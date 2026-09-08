-- CRM של מתפללי מניין הצעירים — לקמפיין ההתרמה לראש השנה ותומכי-קבע.
--
-- למה טבלה נפרדת מ-donations: מתפלל הוא בן-אדם (שם קבוע, טלפון, מייל,
-- רמת מעורבות), תרומה היא אירוע (סכום, תאריך, transaction_id). מיזוג
-- שניהם לטבלה אחת ייצר כפילויות בכל תרומה נוספת של אותו אדם.
-- tier הוא היעד המוצע (שותף/מחזיק/תורם), לא מה שכבר שולם בפועל —
-- זה מגיע מ-minyan.donations דרך kind='keva' + amount.

create table if not exists minyan.congregants (
  id           bigserial primary key,
  surname      text not null,          -- כפי שנמסר ברשימה המקורית, למעקב
  full_name    text,                   -- שם מלא כפי שנמצא באנשי הקשר/במייל
  phone        text,
  email        text,
  tier         text check (tier in ('שותף','מחזיק','תורם')),
  tier_amount  numeric(10,2),          -- הסכום המוצע ברמה (70/100/150)
  match_note   text,                   -- אי-ודאות/הערת התאמה מהמחקר, לביקורת יוסף
  campaign_status text not null default 'new'
               check (campaign_status in ('new','drafted','sent','responded','declined')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists congregants_surname_uq on minyan.congregants (surname, full_name);

alter table minyan.congregants enable row level security;

drop policy if exists congregants_admin_read   on minyan.congregants;
drop policy if exists congregants_admin_write  on minyan.congregants;
drop policy if exists congregants_admin_insert on minyan.congregants;
create policy congregants_admin_read  on minyan.congregants
  for select to authenticated using (minyan.is_admin());
create policy congregants_admin_write on minyan.congregants
  for update to authenticated using (minyan.is_admin()) with check (minyan.is_admin());
-- הוספה ידנית מהפאנל (08/09) — לא רק מ-service_role כמו המילוי הראשוני.
create policy congregants_admin_insert on minyan.congregants
  for insert to authenticated with check (minyan.is_admin());
-- אין policy ל-anon בכלל.

grant usage on schema minyan to service_role;
grant all on minyan.congregants to service_role;
grant select, insert on minyan.congregants to authenticated;
grant usage, select on sequence minyan.congregants_id_seq to authenticated;  -- bigserial צריך גם את זה, לא רק INSERT על הטבלה
grant update (tier, tier_amount, campaign_status, phone, email, full_name) on minyan.congregants to authenticated;
revoke all on minyan.congregants from anon;

drop trigger if exists congregants_touch on minyan.congregants;
create trigger congregants_touch before update on minyan.congregants
  for each row execute function minyan.touch_updated();
