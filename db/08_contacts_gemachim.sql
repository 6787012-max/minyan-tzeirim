-- 08_contacts_gemachim.sql — הרחבה של congregants ל-CRM מלא + גמ"חים.
--
-- למה לא טבלה חדשה: congregants כבר קיימת עם 33 שורות, פונקציה is_admin,
-- ותרומות מקושרות אליה מבחינה סמלית. עדיף להרחיב, לא לפצל.
--
-- מה מתווסף:
--   • congregants: address, id_num, tags[], last_contact_at, is_family
--   • טבלה חדשה  minyan.contact_docs (מסמכים לאיש קשר — ספח ת״ז, אישור וכו')
--   • טבלה חדשה  minyan.gemachim (רשימת הגמ״חים של הקהילה)

alter table minyan.congregants add column if not exists address       text;
alter table minyan.congregants add column if not exists id_num        text;
alter table minyan.congregants add column if not exists tags          text[] not null default '{}';
alter table minyan.congregants add column if not exists last_contact_at timestamptz;
alter table minyan.congregants add column if not exists is_family     boolean not null default true;
alter table minyan.congregants add column if not exists role          text; -- 'ועדה' / 'גבאי' / וכו'

grant update (address, id_num, tags, last_contact_at, is_family, role)
  on minyan.congregants to authenticated;

-- מסמכים לאיש קשר (ספח ת״ז, מכתב וכו'). הקבצים עצמם ב-storage bucket 'minyan-docs'.
create table if not exists minyan.contact_docs (
  id             bigserial primary key,
  contact_id     bigint references minyan.congregants(id) on delete cascade,
  kind           text not null default 'id_scan'
                 check (kind in ('id_scan','letter','signed_hok','other')),
  file_path      text,        -- נתיב בתוך ה-bucket
  original_name  text,
  mime           text,
  bytes          int,
  note           text,
  uploaded_by    text,        -- 'form:simchat' / email של admin שהעלה
  created_at     timestamptz not null default now()
);

create index if not exists contact_docs_contact on minyan.contact_docs(contact_id);
create index if not exists contact_docs_kind    on minyan.contact_docs(kind);

alter table minyan.contact_docs enable row level security;
drop policy if exists contact_docs_admin on minyan.contact_docs;
create policy contact_docs_admin on minyan.contact_docs
  for all to authenticated
  using (minyan.is_admin()) with check (minyan.is_admin());

grant all on minyan.contact_docs to service_role;
grant select, insert, update, delete on minyan.contact_docs to authenticated;
grant usage, select on sequence minyan.contact_docs_id_seq to authenticated;

-- טבלת הגמ״חים של הקהילה
create table if not exists minyan.gemachim (
  id           bigserial primary key,
  name         text not null,       -- "גמ״ח כספים", "גמ״ח מזון" וכו'
  category     text,                -- כספים · מטבח · תרופות · ילדים · אחר
  contact_name text,
  phone        text,
  address      text,
  hours        text,                -- "כל יום 18:00-20:00, בת שני 08:00-10:00"
  description  text,                -- מה נותנים, למי, איך מבקשים
  note_admin   text,
  is_public    boolean not null default true, -- האם מוצג באתר הציבורי
  sort_order   int not null default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists gemachim_public_sort on minyan.gemachim (is_public, sort_order);
create index if not exists gemachim_category    on minyan.gemachim (category);

alter table minyan.gemachim enable row level security;
drop policy if exists gemachim_public_read on minyan.gemachim;
drop policy if exists gemachim_admin       on minyan.gemachim;
-- ציבורי: anon יכול לקרוא רק גמ"חים שסומנו is_public
create policy gemachim_public_read on minyan.gemachim
  for select to anon using (is_public = true);
create policy gemachim_admin on minyan.gemachim
  for all to authenticated
  using (minyan.is_admin()) with check (minyan.is_admin());

grant all on minyan.gemachim to service_role;
grant select on minyan.gemachim to anon;
grant select, insert, update, delete on minyan.gemachim to authenticated;
grant usage, select on sequence minyan.gemachim_id_seq to authenticated;

drop trigger if exists gemachim_touch on minyan.gemachim;
create trigger gemachim_touch before update on minyan.gemachim
  for each row execute function minyan.touch_updated();

-- אינדקס חיפוש חופשי לטקסטים (עברית) — array_to_string לא IMMUTABLE אז tags נחפש בנפרד ב-@>.
create index if not exists congregants_search on minyan.congregants
  using gin (to_tsvector('simple',
    coalesce(surname,'') || ' ' || coalesce(full_name,'') || ' ' ||
    coalesce(phone,'') || ' ' || coalesce(email,'') || ' ' ||
    coalesce(address,'') || ' ' || coalesce(role,'')));
create index if not exists congregants_tags on minyan.congregants using gin (tags);
