-- 11_contacts_crm.sql — הרמת פאנל "אנשי קשר" לרמה מלאה: קישורי משפחה,
-- זיהוי כפילויות + מיזוג per-field, ועדכון בזמן אמת (Realtime).
-- מבוקש ע"י יוסף 16/09/2026, "כמו אצל שעיה זיידל" (ראו project anshei-kesher).
--
-- שונה במכוון מ-anshei-kesher בנקודה אחת: שם כל אדם הוא שורה, כאן כל
-- congregants.id הוא **בית-אב שלם** ("וסרמן מנשה וליאה" בשורה אחת) —
-- זו הסכימה הקיימת מ-07_congregants.sql, לא נוגעים בה כי tier/
-- campaign_status כבר נספרים ברמת בית-אב עבור קמפיין התרומות, ופיצול
-- לשורות-אדם היה שובר את זה. "קישורי משפחה" כאן הם בין בתי-אב
-- (הורים ↔ ילדים נשואים וכו'), לא בין בני אותו זוג.
--
-- אידמפוטנטי.

-- ── מחיקת כרטיס (לא הייתה אפשרית כלל — נדרשת לניקוי כפילויות ידני) ───
drop policy if exists congregants_admin_delete on minyan.congregants;
create policy congregants_admin_delete on minyan.congregants
  for delete to authenticated using (minyan.is_admin());
grant delete on minyan.congregants to authenticated;

-- ── קישורי משפחה בין בתי-אב ──────────────────────────────────────────
create table if not exists minyan.congregant_relations (
  id         bigserial primary key,
  a_id       bigint not null references minyan.congregants(id) on delete cascade,
  b_id       bigint not null references minyan.congregants(id) on delete cascade,
  kind       text not null default 'קשור' check (kind in ('קשור','הורים','ילדים','אחים')),
  note       text,
  created_at timestamptz not null default now(),
  check (a_id <> b_id),
  unique (a_id, b_id, kind)
);
create index if not exists congregant_relations_a on minyan.congregant_relations(a_id);
create index if not exists congregant_relations_b on minyan.congregant_relations(b_id);

alter table minyan.congregant_relations enable row level security;
drop policy if exists congregant_relations_admin on minyan.congregant_relations;
create policy congregant_relations_admin on minyan.congregant_relations
  for all to authenticated using (minyan.is_admin()) with check (minyan.is_admin());
grant all on minyan.congregant_relations to service_role;
grant select, insert, delete on minyan.congregant_relations to authenticated;
grant usage, select on sequence minyan.congregant_relations_id_seq to authenticated;

-- ── זיהוי כפילויות ───────────────────────────────────────────────────
create extension if not exists pg_trgm with schema public;

create or replace function minyan.dup_candidates()
returns table(a_id bigint, a_name text, b_id bigint, b_name text, reason text, score real)
language sql stable security definer set search_path = minyan, public as $$
  select a.id, coalesce(a.full_name, a.surname), b.id, coalesce(b.full_name, b.surname),
         'טלפון זהה', 1.0::real
    from minyan.congregants a join minyan.congregants b
      on a.id < b.id and minyan.norm_phone(a.phone) = minyan.norm_phone(b.phone)
     and minyan.norm_phone(a.phone) <> ''
  union all
  select a.id, coalesce(a.full_name, a.surname), b.id, coalesce(b.full_name, b.surname),
         'ת״ז זהה', 1.0::real
    from minyan.congregants a join minyan.congregants b
      on a.id < b.id and a.id_num = b.id_num and coalesce(a.id_num, '') <> ''
  union all
  select a.id, coalesce(a.full_name, a.surname), b.id, coalesce(b.full_name, b.surname),
         'שם דומה', similarity(coalesce(a.full_name, a.surname), coalesce(b.full_name, b.surname))
    from minyan.congregants a join minyan.congregants b
      on a.id < b.id
     and a.surname = b.surname
     and similarity(coalesce(a.full_name, a.surname), coalesce(b.full_name, b.surname)) > 0.45
  order by 6 desc
$$;
grant execute on function minyan.dup_candidates() to authenticated;

-- ── מיזוג שני כרטיסים ל-keep_id, מוחק drop_id ────────────────────────
-- fields: map של עמודה→ערך שנבחר ב-UI (רק העמודות שהמנהל בחר לשנות).
create or replace function minyan.merge_congregants(keep_id bigint, drop_id bigint, fields jsonb)
returns void language plpgsql security definer set search_path = minyan as $$
begin
  if not minyan.is_admin() then raise exception 'not admin'; end if;
  if keep_id = drop_id then raise exception 'same id'; end if;

  update minyan.congregants c set
    surname     = coalesce(fields->>'surname', c.surname),
    full_name   = coalesce(fields->>'full_name', c.full_name),
    phone       = coalesce(fields->>'phone', c.phone),
    email       = coalesce(fields->>'email', c.email),
    address     = coalesce(fields->>'address', c.address),
    id_num      = coalesce(fields->>'id_num', c.id_num),
    role        = coalesce(fields->>'role', c.role),
    match_note  = coalesce(fields->>'match_note', c.match_note),
    tags        = (select array(select distinct unnest(
                     c.tags || (select tags from minyan.congregants where id = drop_id)))),
    updated_at  = now()
  where c.id = keep_id;

  update minyan.contact_docs         set contact_id = keep_id where contact_id = drop_id;
  update minyan.signups              set congregant_id = keep_id where congregant_id = drop_id;
  update minyan.congregant_relations set a_id = keep_id where a_id = drop_id;
  update minyan.congregant_relations set b_id = keep_id where b_id = drop_id;
  delete from minyan.congregant_relations where a_id = b_id; -- self-relation שנוצר מהמיזוג

  delete from minyan.congregants where id = drop_id;
end $$;
grant execute on function minyan.merge_congregants(bigint, bigint, jsonb) to authenticated;

-- ── Realtime: שינויים חיים בין מסכים פתוחים ──────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'minyan' and tablename = 'congregants') then
    alter publication supabase_realtime add table minyan.congregants;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'minyan' and tablename = 'contact_docs') then
    alter publication supabase_realtime add table minyan.contact_docs;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'minyan' and tablename = 'signups') then
    alter publication supabase_realtime add table minyan.signups;
  end if;
end $$;
