-- 05_forms.sql — טפסים דינמיים למניין הצעירים (2026-09-15, בקשת יוסף:
-- "כמו בבית התלמוד" — טופס עם שדות משלי, קישור לשליחה, ומעקב תשובות).
--
-- מבנה זהה במכוון לבית התלמוד (public.forms/form_responses + get_public_form/
-- submit_public_form/get_signing/submit_signature ב-SECURITY DEFINER) — שם
-- זה כבר עבד ונבדק בפועל, כולל תיקון אבטחה (הגנות גודל על קלט anon) שנמצא
-- שם רק אחרי סריקה. את זה מוסיפים כאן מההתחלה, לא בדיעבד.
--
-- שני מצבי טופס:
--   ציבורי  (is_public, link_token) — קישור אחד לכולם, כל אחד עונה בלי זיהוי מראש.
--   אישי    (form_responses.congregant_id) — שורה מראש לכל איש-קשר מ-minyan.congregants,
--            עם token אישי (form.html?t=...).
--
-- הצוות (מנהל/גבאי) ניגש ישירות לטבלאות מהאדמין, מוגן ב-minyan.is_admin().
-- אנשים לא-מחוברים (מי שממלא טופס) עוברים אך ורק דרך ה-RPC למטה — לפי
-- טוקן בלתי-נחיש, אף פעם לא לפי מספר טופס. "חתימה" היא הקלדת שם ואישור,
-- לא ציור ביד (מספיק להקשר של המניין; בבית התלמוד יש קנבס חתימה בגלל
-- טפסי הסכמה רפואית/משפטית של קטינים — לא רלוונטי כאן).
--
-- אידמפוטנטי.

create table if not exists minyan.forms (
  id         bigserial primary key,
  title      text not null,
  body       text,
  fields     jsonb not null default '[]'::jsonb,
  is_public  boolean not null default false,
  link_token text unique,
  open_until date,
  closed     boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists minyan.form_responses (
  id            bigserial primary key,
  form_id       bigint not null references minyan.forms(id) on delete cascade,
  congregant_id bigint references minyan.congregants(id) on delete set null,
  status        text not null default 'pending',
  signer_name   text,
  signed_at     date,
  token         text unique not null,
  answers       jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists formresp_form_idx on minyan.form_responses(form_id);
create index if not exists formresp_token_idx on minyan.form_responses(token);

alter table minyan.forms          enable row level security;
alter table minyan.form_responses enable row level security;

drop policy if exists forms_admin on minyan.forms;
create policy forms_admin on minyan.forms for all
  to authenticated using (minyan.is_admin()) with check (minyan.is_admin());
drop policy if exists fr_admin on minyan.form_responses;
create policy fr_admin on minyan.form_responses for all
  to authenticated using (minyan.is_admin()) with check (minyan.is_admin());

grant select, insert, update, delete on minyan.forms, minyan.form_responses to authenticated;
grant usage, select on sequence minyan.forms_id_seq, minyan.form_responses_id_seq to authenticated;

-- ── טופס ציבורי: קריאה ושליחה לפי link_token בלבד ─────────────────────
create or replace function minyan.get_public_form(g_token text)
  returns table(title text, body text, fields jsonb)
  language sql stable security definer set search_path = minyan as
$$ select f.title, f.body, f.fields
     from minyan.forms f
    where f.link_token = g_token and f.is_public and not f.closed
      and (f.open_until is null or f.open_until >= current_date) $$;

create or replace function minyan.submit_public_form(g_token text, p_name text, p_answers jsonb)
  returns boolean language plpgsql security definer set search_path = minyan as
$$
declare fid bigint;
begin
  if length(coalesce(p_name,'')) < 2 or length(p_name) > 100 then return false; end if;
  if pg_column_size(coalesce(p_answers, '{}'::jsonb)) > 65536 then return false; end if;
  select f.id into fid from minyan.forms f
    where f.link_token = g_token and f.is_public and not f.closed
      and (f.open_until is null or f.open_until >= current_date)
    limit 1;
  if fid is null then return false; end if;
  insert into minyan.form_responses(form_id, congregant_id, status, signer_name, signed_at, answers, token)
    values (fid, null, 'signed', p_name, current_date, coalesce(p_answers, '{}'::jsonb),
            'pub-' || md5(random()::text || clock_timestamp()::text));
  return true;
end $$;

-- ── קישור אישי: קריאה ושליחה לפי token של form_responses בלבד ─────────
create or replace function minyan.get_signing(p_token text)
  returns table(form_id bigint, title text, body text, fields jsonb, status text, signer_name text, signed_at date)
  language sql stable security definer set search_path = minyan as
$$ select f.id, f.title, f.body, f.fields, r.status, r.signer_name, r.signed_at
     from minyan.form_responses r join minyan.forms f on f.id = r.form_id
    where r.token = p_token $$;

create or replace function minyan.submit_signature(p_token text, p_name text, p_answers jsonb)
  returns boolean language plpgsql security definer set search_path = minyan as
$$
declare n int;
begin
  if length(coalesce(p_name,'')) < 2 or length(p_name) > 100 then return false; end if;
  if pg_column_size(coalesce(p_answers, '{}'::jsonb)) > 65536 then return false; end if;
  update minyan.form_responses set status = 'signed', signer_name = p_name, signed_at = current_date,
    answers = coalesce(p_answers, answers)
    where token = p_token and status <> 'signed';
  get diagnostics n = row_count; return n > 0;
end $$;

revoke all on function minyan.get_public_form(text), minyan.submit_public_form(text, text, jsonb),
  minyan.get_signing(text), minyan.submit_signature(text, text, jsonb) from public;
grant execute on function minyan.get_public_form(text)              to anon, authenticated;
grant execute on function minyan.submit_public_form(text, text, jsonb) to anon, authenticated;
grant execute on function minyan.get_signing(text)                  to anon, authenticated;
grant execute on function minyan.submit_signature(text, text, jsonb) to anon, authenticated;
