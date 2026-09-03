-- ═══════════════════════════════════════════════════════════════════
-- minyan — מסד הרישומים של מניין הצעירים מעלה עמוס
--
-- למה בכלל מסד ולא mailto: עד היום כל טופס באתר רק פתח טאב של המייל.
-- אם המשתמש סגר את הטאב — הרישום פשוט לא קרה, ואף אחד לא ידע.
-- כאן הרישום נשמר לפני שנשלח משהו, ולכן שום הרשמה לא נעלמת.
--
-- מודל ההרשאות, בקצרה:
--   anon           — אין לו שום policy. הוא לא קורא ולא כותב. כלום.
--   Edge Function  — רצה עם service_role, עוקפת RLS, וזו הדרך היחידה לכתוב.
--   admin (יוסף)   — משתמש Auth אמיתי, קורא ומעדכן דרך RLS בלבד.
-- כלומר גם אם מישהו יחלץ את ה-anon key מקוד הדף — והוא גלוי שם —
-- הוא לא יכול לראות אף רישום ולא לשנות כלום.
-- ═══════════════════════════════════════════════════════════════════

create schema if not exists minyan;

-- ── מי מורשה לנהל ──────────────────────────────────────────────────
create table if not exists minyan.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text,
  created_at timestamptz not null default now()
);

create or replace function minyan.is_admin()
returns boolean
language sql
stable
security definer
set search_path = minyan, public
as $$
  select exists (select 1 from minyan.admins a where a.user_id = auth.uid());
$$;

-- ── רישומים ────────────────────────────────────────────────────────
-- טבלה אחת לכל סוגי הטפסים. kind מבדיל ביניהם, ו-details נושא
-- את מה שייחודי לכל טופס. עדיף על ארבע טבלאות כמעט־זהות שיתפצלו
-- ויתחילו להיסחף אחת מהשנייה.
create table if not exists minyan.signups (
  id          bigserial primary key,
  kind        text not null check (kind in ('kibud','shas','seats','contact','other')),
  ref_key     text,                    -- מפתח הפריט: תאריך ערב, מזהה כרך וכו'
  ref_label   text,                    -- אותו דבר בעברית, לתצוגה ולמייל
  name        text not null,
  phone       text,
  email       text,
  qty         integer,
  amount      numeric(10,2),
  details     jsonb not null default '{}'::jsonb,
  status      text not null default 'new'
              check (status in ('new','confirmed','paid','cancelled','duplicate')),
  admin_note  text,
  source      text,                    -- הדף שממנו הגיע
  ua_hash     text,                    -- טביעה גסה לזיהוי כפילויות, לא מזהה אישית
  mail_status text not null default 'pending'
              check (mail_status in ('pending','sent','failed','skipped')),
  mail_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists signups_kind_created on minyan.signups (kind, created_at desc);
create index if not exists signups_status       on minyan.signups (status);
-- רישום פעיל אחד לכל פריט. ביטול משחרר את המקום מיד.
create unique index if not exists signups_active_ref
  on minyan.signups (kind, ref_key)
  where ref_key is not null and status in ('new','confirmed','paid');

-- ── יומן פעולות ────────────────────────────────────────────────────
create table if not exists minyan.audit (
  id         bigserial primary key,
  actor      text,
  action     text not null,
  target     text,
  data       jsonb,
  created_at timestamptz not null default now()
);

create or replace function minyan.touch_updated()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists signups_touch on minyan.signups;
create trigger signups_touch before update on minyan.signups
  for each row execute function minyan.touch_updated();

-- ── RLS ────────────────────────────────────────────────────────────
alter table minyan.signups enable row level security;
alter table minyan.admins  enable row level security;
alter table minyan.audit   enable row level security;

drop policy if exists signups_admin_read   on minyan.signups;
drop policy if exists signups_admin_write  on minyan.signups;
drop policy if exists admins_self_read     on minyan.admins;
drop policy if exists audit_admin_read     on minyan.audit;

create policy signups_admin_read  on minyan.signups
  for select to authenticated using (minyan.is_admin());
create policy signups_admin_write on minyan.signups
  for update to authenticated using (minyan.is_admin()) with check (minyan.is_admin());
create policy admins_self_read    on minyan.admins
  for select to authenticated using (user_id = auth.uid());
create policy audit_admin_read    on minyan.audit
  for select to authenticated using (minyan.is_admin());
-- אין policy ל-anon בשום טבלה. deny by default. זה מכוון.

grant usage on schema minyan to authenticated;
grant select on minyan.signups, minyan.admins, minyan.audit to authenticated;
grant update (status, admin_note) on minyan.signups to authenticated;

-- ── תצוגת סיכום לפאנל ─────────────────────────────────────────────
create or replace view minyan.stats
with (security_invoker = true) as
select kind,
       count(*)                                          as total,
       count(*) filter (where status = 'new')            as pending,
       count(*) filter (where status in ('confirmed','paid')) as approved,
       count(*) filter (where status = 'cancelled')      as cancelled,
       count(*) filter (where created_at > now() - interval '7 days') as last_week,
       coalesce(sum(amount) filter (where status = 'paid'), 0)        as paid_sum,
       max(created_at)                                   as last_at
from minyan.signups
group by kind;

grant select on minyan.stats to authenticated;
