-- 16_kasefet.sql — כספת לארון הקודש (2026-11-15, התרמה לכספת ל-4 ספרי תורה).
-- יעד 10,000 ש"ח (8,000 כספת + 2,000 הובלה). מי שהתחייב בשבת, ומי שמצטרף עכשיו.
--
-- עקרון: אין policy לאף אחד. anon ו-authenticated לא קוראים ולא כותבים לטבלאות
-- ישירות. כל גישה עוברת דרך פונקציות RPC עם SECURITY DEFINER:
--   ציבורי:  kasefet_public (בלי טלפונים, בלי טוקנים, בלי סכום אישי),
--            kasefet_pledge (הרשמה, מחזיר טוקן אישי), kasefet_get / kasefet_update
--            (רק למי שמחזיק בטוקן האישי; אי אפשר לשנות בהן paid_amount).
--   גבאים:   kasefet_admin_* — עובדים רק עם קוד גבאי תקין (8 ספרות). קוד שגוי
--            מחזיר {ok:false}, ולא זורק שגיאה, כדי שרישום הניסיון יישמר. אחרי
--            10 ניסיונות שגויים ב-15 דקות הכול נעול 15 דקות (המנגנון גלובלי, בלי IP).
-- הקודים עצמם לא נמצאים בקובץ הזה: נשמר רק hash מתוחכם (salt + 50,000 סבבי sha256).
-- הקודים נמצאים בקובץ מקומי שאינו נדחף (_kasefet_codes.txt, ב-.gitignore).
--
-- אידמפוטנטי: create ... if not exists, create or replace, on conflict.

create table if not exists minyan.kasefet_pledges (
  id          bigserial primary key,
  name        text not null check (char_length(name) between 2 and 80),
  phone       text check (phone is null or char_length(phone) <= 20),
  amount      integer not null check (amount between 1 and 100000),
  method      text not null default 'cash' check (method in ('cash', 'nedarim')),
  show_name   boolean not null default true,
  source      text not null default 'new' check (source in ('shabbat', 'new')),
  edit_token  text not null unique
              default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  paid_amount integer not null default 0 check (paid_amount between 0 and 100000),
  paid_at     timestamptz,
  paid_by     text,
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kasefet_pledges_created on minyan.kasefet_pledges (created_at);

create table if not exists minyan.kasefet_gabaim (
  name      text primary key,
  salt      text not null,
  code_hash text not null
);

create table if not exists minyan.kasefet_attempts (
  id bigserial primary key,
  at timestamptz not null default now()
);
create index if not exists kasefet_attempts_at on minyan.kasefet_attempts (at);

alter table minyan.kasefet_pledges  enable row level security;
alter table minyan.kasefet_gabaim   enable row level security;
alter table minyan.kasefet_attempts enable row level security;

revoke all on minyan.kasefet_pledges, minyan.kasefet_gabaim, minyan.kasefet_attempts from anon, authenticated;
grant usage on schema minyan to anon, authenticated;

-- ── גבאים (hash בלבד) ──────────────────────────────────────────────────
-- @@GABAI_BEGIN@@
insert into minyan.kasefet_gabaim (name, salt, code_hash) values
  ('יוסף שניידר', '12d350a44e4da50ee4b2c0e7cf1479a8', '01cb0cd728fe0b2ff8e52413d943817e1279302d954d628ce3fc83b4a840c933'),
  ('יעקב וייס', '389f4e9d0802bd62a707587c5a4a7b1b', 'dc2ecfb3fb98191b07c0391d5b40ba561a7baa5bc5b8df5b1e958e725017cf09')
on conflict (name) do update set salt = excluded.salt, code_hash = excluded.code_hash;
-- @@GABAI_END@@

-- ── hash: salt + קוד, 50,000 סבבי sha256 ──────────────────────────────
create or replace function minyan.kasefet_hash(p_salt text, p_code text)
returns text language plpgsql immutable set search_path = minyan as
$$
declare h bytea := convert_to(p_salt || p_code, 'UTF8'); i int;
begin
  for i in 1..50000 loop h := sha256(h); end loop;
  return encode(h, 'hex');
end $$;

-- ── בדיקת קוד גבאי ─────────────────────────────────────────────────────
-- מחזיר שם גבאי, או null (קוד שגוי), או 'LOCKED' (נעול). לא זורק שגיאה, כדי
-- שהרישום של הניסיון השגוי יישמר.
create or replace function minyan.kasefet_gabai_of(p_code text)
returns text language plpgsql security definer set search_path = minyan as
$$
declare g record; n int;
begin
  select count(*) into n from minyan.kasefet_attempts where at > now() - interval '15 minutes';
  if n >= 10 then return 'LOCKED'; end if;
  if p_code is not null and p_code ~ '^[0-9]{8}$' then
    for g in select name, salt, code_hash from minyan.kasefet_gabaim loop
      if minyan.kasefet_hash(g.salt, p_code) = g.code_hash then return g.name; end if;
    end loop;
  end if;
  insert into minyan.kasefet_attempts default values;
  return null;
end $$;

-- ── אימות שדות (זורק שגיאה בעברית) ────────────────────────────────────
create or replace function minyan.kasefet_check(p_name text, p_phone text, p_amount int, p_method text, p_source text)
returns void language plpgsql immutable set search_path = minyan as
$$
begin
  if char_length(coalesce(p_name, '')) < 2 or char_length(p_name) > 80 then
    raise exception 'השם חייב להיות בין 2 ל-80 תווים';
  end if;
  if p_phone is not null and p_phone !~ '^[0-9+\- ]{6,20}$' then
    raise exception 'מספר הטלפון לא תקין';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'הסכום חייב להיות בין 1 ל-100,000 ש"ח';
  end if;
  if p_method not in ('cash', 'nedarim') then
    raise exception 'אופן התשלום לא תקין';
  end if;
  if p_source not in ('shabbat', 'new') then
    raise exception 'מקור ההתחייבות לא תקין';
  end if;
end $$;

-- ── ציבורי: מצב המגבית (בלי טלפונים, טוקנים או סכום אישי) ──────────────
create or replace function minyan.kasefet_public()
returns jsonb language sql stable security definer set search_path = minyan as
$$
  select jsonb_build_object(
    'goal',     10000,
    'pledged',  coalesce(sum(amount), 0),
    'paid',     coalesce(sum(paid_amount), 0),
    'partners', count(*),
    'people',   coalesce(jsonb_agg(jsonb_build_object(
                  'name', case when show_name then name else 'שותף בעילום שם' end,
                  'paid', paid_amount > 0
                ) order by created_at, id), '[]'::jsonb),
    'at',       now()
  )
  from minyan.kasefet_pledges
$$;

-- ── ציבורי: הרשמה. מחזיר טוקן אישי לעדכון ─────────────────────────────
create or replace function minyan.kasefet_pledge(p_name text, p_phone text, p_amount int, p_method text, p_show_name boolean, p_source text)
returns text language plpgsql security definer set search_path = minyan as
$$
declare tok text; n int;
  nm text := btrim(coalesce(p_name, ''));
  ph text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  perform minyan.kasefet_check(nm, ph, p_amount, p_method, p_source);
  select count(*) into n from minyan.kasefet_pledges where created_at > now() - interval '1 hour';
  if n >= 30 then
    raise exception 'יש כרגע הרבה הרשמות, נסו שוב בעוד מעט';
  end if;
  insert into minyan.kasefet_pledges (name, phone, amount, method, show_name, source)
    values (nm, ph, p_amount, p_method, coalesce(p_show_name, true), p_source)
    returning edit_token into tok;
  return tok;
end $$;

-- ── ציבורי: קריאה ועדכון לפי טוקן אישי בלבד ────────────────────────────
create or replace function minyan.kasefet_get(p_token text)
returns jsonb language sql stable security definer set search_path = minyan as
$$
  select jsonb_build_object('name', name, 'phone', phone, 'amount', amount, 'method', method,
           'show_name', show_name, 'source', source, 'paid_amount', paid_amount, 'paid_at', paid_at)
  from minyan.kasefet_pledges
  where length(p_token) = 64 and edit_token = p_token
$$;

create or replace function minyan.kasefet_update(p_token text, p_name text, p_phone text, p_amount int, p_method text, p_show_name boolean)
returns boolean language plpgsql security definer set search_path = minyan as
$$
declare r minyan.kasefet_pledges%rowtype;
  nm text := btrim(coalesce(p_name, ''));
  ph text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'הקישור לא תקין';
  end if;
  select * into r from minyan.kasefet_pledges where edit_token = p_token;
  if not found then
    raise exception 'הקישור לא נמצא, ייתכן שהוא ישן';
  end if;
  perform minyan.kasefet_check(nm, ph, p_amount, p_method, r.source);
  if p_amount < r.paid_amount then
    raise exception 'לא ניתן לרדת מתחת לסכום שכבר שולם';
  end if;
  update minyan.kasefet_pledges
     set name = nm, phone = ph, amount = p_amount, method = p_method,
         show_name = coalesce(p_show_name, show_name), updated_at = now()
   where id = r.id;
  return true;
end $$;

-- ── גבאים: כל הפונקציות מחזירות jsonb, ולא זורקות על קוד שגוי ──────────
create or replace function minyan.kasefet_admin_list(p_code text)
returns jsonb language plpgsql security definer set search_path = minyan as
$$
declare g text; r jsonb;
begin
  g := minyan.kasefet_gabai_of(p_code);
  if g = 'LOCKED' then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if g is null then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  select jsonb_build_object('ok', true, 'gabai', g, 'rows', coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'name', name, 'phone', phone, 'amount', amount, 'method', method,
           'show_name', show_name, 'source', source, 'paid_amount', paid_amount,
           'paid_at', paid_at, 'paid_by', paid_by, 'note', note, 'created_at', created_at)
         order by created_at, id), '[]'::jsonb))
    into r from minyan.kasefet_pledges;
  return r;
end $$;

create or replace function minyan.kasefet_mark_paid(p_code text, p_id bigint, p_paid_amount int, p_note text)
returns jsonb language plpgsql security definer set search_path = minyan as
$$
declare g text; n int;
begin
  g := minyan.kasefet_gabai_of(p_code);
  if g = 'LOCKED' then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if g is null then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  if p_paid_amount is null or p_paid_amount < 0 or p_paid_amount > 100000 then
    raise exception 'הסכום ששולם לא תקין';
  end if;
  update minyan.kasefet_pledges
     set paid_amount = p_paid_amount,
         paid_at = case when p_paid_amount > 0 then now() else null end,
         paid_by = case when p_paid_amount > 0 then g else null end,
         note = nullif(left(btrim(coalesce(p_note, '')), 300), ''),
         updated_at = now()
   where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function minyan.kasefet_admin_save(p_code text, p_id bigint, p_name text, p_phone text,
    p_amount int, p_method text, p_show_name boolean, p_source text)
returns jsonb language plpgsql security definer set search_path = minyan as
$$
declare g text; r minyan.kasefet_pledges%rowtype; newid bigint;
  nm text := btrim(coalesce(p_name, ''));
  ph text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  g := minyan.kasefet_gabai_of(p_code);
  if g = 'LOCKED' then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if g is null then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  perform minyan.kasefet_check(nm, ph, p_amount, p_method, p_source);
  if p_id is null then
    insert into minyan.kasefet_pledges (name, phone, amount, method, show_name, source)
      values (nm, ph, p_amount, p_method, coalesce(p_show_name, true), p_source)
      returning id into newid;
    return jsonb_build_object('ok', true, 'id', newid);
  end if;
  select * into r from minyan.kasefet_pledges where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_amount < r.paid_amount then
    raise exception 'הסכום נמוך מהסכום ששולם בפועל (%)', r.paid_amount;
  end if;
  update minyan.kasefet_pledges
     set name = nm, phone = ph, amount = p_amount, method = p_method,
         show_name = coalesce(p_show_name, show_name), source = p_source, updated_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id);
end $$;

create or replace function minyan.kasefet_admin_delete(p_code text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = minyan as
$$
declare g text; n int;
begin
  g := minyan.kasefet_gabai_of(p_code);
  if g = 'LOCKED' then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if g is null then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;
  delete from minyan.kasefet_pledges where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ── הרשאות: רק הפונקציות הציבוריות והגבאיות נחשפות ─────────────────────
revoke all on function minyan.kasefet_hash(text, text), minyan.kasefet_gabai_of(text),
  minyan.kasefet_check(text, text, int, text, text) from public, anon, authenticated;

revoke all on function minyan.kasefet_public(), minyan.kasefet_pledge(text, text, int, text, boolean, text),
  minyan.kasefet_get(text), minyan.kasefet_update(text, text, text, int, text, boolean),
  minyan.kasefet_admin_list(text), minyan.kasefet_mark_paid(text, bigint, int, text),
  minyan.kasefet_admin_save(text, bigint, text, text, int, text, boolean, text),
  minyan.kasefet_admin_delete(text, bigint) from public;

grant execute on function minyan.kasefet_public()                                              to anon, authenticated;
grant execute on function minyan.kasefet_pledge(text, text, int, text, boolean, text)          to anon, authenticated;
grant execute on function minyan.kasefet_get(text)                                             to anon, authenticated;
grant execute on function minyan.kasefet_update(text, text, text, int, text, boolean)          to anon, authenticated;
grant execute on function minyan.kasefet_admin_list(text)                                      to anon, authenticated;
grant execute on function minyan.kasefet_mark_paid(text, bigint, int, text)                    to anon, authenticated;
grant execute on function minyan.kasefet_admin_save(text, bigint, text, text, int, text, boolean, text) to anon, authenticated;
grant execute on function minyan.kasefet_admin_delete(text, bigint)                            to anon, authenticated;
