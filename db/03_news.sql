-- לוח החדשות של היישוב, נאסף מקבוצת המייל «ישר ולעניין».
--
-- שיקול שקבע את המבנה: קבוצת מייל קהילתית מלאה בטלפונים פרטיים,
-- בקשות אישיות ובענייני בריאות. פרסום אוטומטי לאתר ציבורי היה
-- מדליף אותם. לכן כל פריט נכנס כ-'new' וממתין לאישור אנושי, ורק
-- 'approved' נגיש לציבור. status הוא שער, לא תווית.

create table if not exists minyan.news (
  id           bigserial primary key,
  title        text not null,
  body         text,
  category     text,
  msg_id       text unique,          -- מזהה ההודעה במייל. מונע כפילויות בכל ריצה
  msg_date     timestamptz,
  sender       text,                 -- לשיקול הגבאי בלבד, לא מוצג לציבור
  image_url    text,
  ocr_text     text,
  status       text not null default 'new'
               check (status in ('new','approved','rejected','expired')),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists news_status_date on minyan.news (status, msg_date desc);

drop trigger if exists news_touch on minyan.news;
create trigger news_touch before update on minyan.news
  for each row execute function minyan.touch_updated();

alter table minyan.news enable row level security;

drop policy if exists news_public_read on minyan.news;
drop policy if exists news_admin_read  on minyan.news;
drop policy if exists news_admin_write on minyan.news;

-- המקום היחיד בסכימה שבו anon מקבל SELECT — ורק על מה שכבר אושר
-- ולא פג. sender ו-ocr_text לא נחשפים דרך התצוגה שלמטה.
create policy news_public_read on minyan.news
  for select to anon
  using (status = 'approved' and (expires_at is null or expires_at > now()));

create policy news_admin_read  on minyan.news
  for select to authenticated using (minyan.is_admin());
create policy news_admin_write on minyan.news
  for update to authenticated using (minyan.is_admin()) with check (minyan.is_admin());

grant select on minyan.news to anon, authenticated;
grant update (status, title, body, category, expires_at) on minyan.news to authenticated;
grant all on minyan.news to service_role;
grant all on sequence minyan.news_id_seq to service_role;

-- תצוגה ציבורית: בלי שולח, בלי OCR גולמי, בלי מזהה הודעה.
create or replace view minyan.news_public
with (security_invoker = true) as
select id, title, body, category, image_url, msg_date, created_at
from minyan.news
where status = 'approved' and (expires_at is null or expires_at > now());

grant select on minyan.news_public to anon, authenticated;
