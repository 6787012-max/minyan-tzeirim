-- תרומות נדרים פלוס — מוסד 8000707, מוצג בפאנל הניהול.
--
-- למה טבלה ולא רק הגיליון: הגיליון תלוי בסנכרון ל-Drive של חשבון אחר,
-- ונשבר בשקט כל פעם שהבעלות על הקובץ זזה. כאן הסנכרון המקומי כותב
-- ישירות למסד של האתר עצמו (PostgREST + service_role), ואין קובץ
-- אמצעי שיכול לאבד הרשאה בלי שאף אחד ישים לב.
--
-- transaction_id הוא ה-PK — כך שהסנכרון יכול לדרוס (upsert) את כל
-- ההיסטוריה בכל ריצה בלי לדאוג לכפילויות, ובלי לשמור state נפרד.

create table if not exists minyan.donations (
  transaction_id    text primary key,
  keva_id           text,
  kind              text not null check (kind in ('once','keva')),
  client_name       text not null,
  amount            numeric(10,2) not null,
  transaction_time  timestamptz not null,
  kabala_id         text,
  synced_at         timestamptz not null default now()
);

create index if not exists donations_time on minyan.donations (transaction_time desc);
create index if not exists donations_keva on minyan.donations (keva_id) where keva_id is not null;

alter table minyan.donations enable row level security;

drop policy if exists donations_admin_read on minyan.donations;
create policy donations_admin_read on minyan.donations
  for select to authenticated using (minyan.is_admin());
-- אין policy לכתיבה מ-authenticated, ואין שום policy ל-anon.
-- הכתיבה היחידה היא מ-donations_sync.py דרך service_role, שעוקף RLS.

grant usage on schema minyan to service_role;
grant all on minyan.donations to service_role;
grant select on minyan.donations to authenticated;
revoke all on minyan.donations from anon;

-- ── תצוגת סיכום, לכרטיס בפאנל ─────────────────────────────────────
create or replace view minyan.donations_stats
with (security_invoker = true) as
select
  count(*)                                                            as total,
  count(*) filter (where kind = 'keva')                               as keva_count,
  coalesce(sum(amount), 0)                                            as total_sum,
  coalesce(sum(amount) filter (where transaction_time > now() - interval '30 days'), 0)
                                                                       as last_30d_sum,
  max(transaction_time)                                               as last_at,
  max(synced_at)                                                      as synced_at
from minyan.donations;

grant select on minyan.donations_stats to authenticated;
