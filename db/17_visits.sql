-- 17_visits.sql — מעקב כניסות לאתר (2026-11-15, בקשת יוסף הגבאי).
--
-- עקרון זהה ל-16_kasefet.sql: אין policy לאף אחד. anon לא קורא ולא כותב לטבלה
-- ישירות. הדף הציבורי קורא רק ל-log_visit (כתיבה בלבד, בלי החזרת נתונים),
-- והגבאים קוראים דרך visits_admin עם קוד גבאי תקין.
-- פרטיות: לא נשמרים IP ולא User-Agent. המעקב הוא לפי מכשיר (מזהה אקראי
-- שהדף יוצר ושומר ב-localStorage). שם מופיע רק למי שסימן את עצמו בכספת.
--
-- אידמפוטנטי: create ... if not exists, create or replace.

create table if not exists minyan.site_visits (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  visitor_id text not null check (char_length(visitor_id) between 8 and 40),
  page       text not null check (char_length(page) between 1 and 60),
  referrer   text check (referrer is null or char_length(referrer) <= 80),
  device     text not null check (device in ('mobile', 'tablet', 'desktop')),
  is_new     boolean not null default false,
  pledge_id  bigint
);
create index if not exists site_visits_created on minyan.site_visits (created_at);
create index if not exists site_visits_visitor on minyan.site_visits (visitor_id, page, created_at);

alter table minyan.site_visits enable row level security;
revoke all on minyan.site_visits from anon, authenticated;
revoke all on sequence minyan.site_visits_id_seq from anon, authenticated;

-- ── רישום כניסה (ציבורי, שקט, לא זורק שגיאות) ───────────────────────────
-- מחזיר true אם נרשמה שורה חדשה, אחרת false. שדות לא תקינים נדחים בשקט.
create or replace function minyan.log_visit(p_visitor text, p_page text, p_ref text, p_device text, p_token text)
returns boolean language plpgsql security definer set search_path = minyan as
$$
declare
  v   text := left(btrim(coalesce(p_visitor, '')), 40);
  pg  text := lower(left(btrim(coalesce(p_page, '')), 60));
  rf  text := nullif(lower(left(btrim(coalesce(p_ref, '')), 80)), '');
  dv  text := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end;
  pid bigint;
  recent_id bigint;
  nw  boolean;
begin
  if v !~ '^[A-Za-z0-9_-]{8,40}$' then return false; end if;
  if pg !~ '^[a-z0-9_-]{1,60}$' then return false; end if;
  if rf is not null and rf !~ '^[a-z0-9.-]+$' then rf := null; end if;

  if p_token is not null and length(p_token) = 64 then
    select id into pid from minyan.kasefet_pledges where edit_token = p_token;
  end if;

  -- לא יותר מכניסה אחת לאותו מכשיר ואותו דף ב-30 דקות
  select id into recent_id from minyan.site_visits
   where visitor_id = v and page = pg and created_at > now() - interval '30 minutes'
   order by created_at desc limit 1;
  if found then
    if pid is not null then
      update minyan.site_visits set pledge_id = pid where id = recent_id and pledge_id is null;
    end if;
    return false;
  end if;

  -- תקרה כללית נגד הצפה
  if (select count(*) from minyan.site_visits where created_at > now() - interval '1 hour') >= 3000 then
    return false;
  end if;

  nw := not exists (select 1 from minyan.site_visits where visitor_id = v);
  insert into minyan.site_visits (visitor_id, page, referrer, device, is_new, pledge_id)
    values (v, pg, rf, dv, nw, pid);
  return true;
end $$;

-- ── תצוגה לגבאים ────────────────────────────────────────────────────────
create or replace function minyan.visits_admin(p_code text, p_days int default 14)
returns jsonb language plpgsql security definer set search_path = minyan as
$$
declare
  g text; r jsonb;
  d int := least(greatest(coalesce(p_days, 14), 1), 60);
  today date := (now() at time zone 'Asia/Jerusalem')::date;
begin
  g := minyan.kasefet_gabai_of(p_code);
  if g = 'LOCKED' then return jsonb_build_object('ok', false, 'error', 'locked'); end if;
  if g is null then return jsonb_build_object('ok', false, 'error', 'bad_code'); end if;

  with v as (
    select s.*, (s.created_at at time zone 'Asia/Jerusalem') as il,
           (s.created_at at time zone 'Asia/Jerusalem')::date as day
      from minyan.site_visits s
  ),
  linked as (
    select visitor_id, max(pledge_id) as pid from v where pledge_id is not null group by visitor_id
  ),
  kv as (
    select distinct visitor_id from v where page = 'kasefet'
  )
  select jsonb_build_object(
    'ok', true,
    'gabai', g,
    'total', (select count(*) from v),
    'devices', (select count(distinct visitor_id) from v),
    'today', (select count(*) from v where day = today),
    'today_devices', (select count(distinct visitor_id) from v where day = today),
    'yesterday', (select count(*) from v where day = today - 1),
    'yesterday_devices', (select count(distinct visitor_id) from v where day = today - 1),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', gs::date, 'visits', coalesce(c.n, 0),
                  'devices', coalesce(c.dv, 0)) order by gs), '[]'::jsonb)
                 from generate_series(today - (d - 1), today, interval '1 day') gs
                 left join (select day, count(*) n, count(distinct visitor_id) dv from v group by day) c
                   on c.day = gs::date),
    'by_page', (select coalesce(jsonb_agg(jsonb_build_object('page', page, 'visits', n, 'devices', dv)
                  order by n desc), '[]'::jsonb)
                 from (select page, count(*) n, count(distinct visitor_id) dv from v group by page) x),
    'by_device', (select coalesce(jsonb_agg(jsonb_build_object('device', device, 'visits', n, 'devices', dv)
                  order by n desc), '[]'::jsonb)
                 from (select device, count(*) n, count(distinct visitor_id) dv from v group by device) x),
    'kasefet_visitors', (select count(*) from kv),
    'kasefet_identified', (select count(*) from kv join linked l on l.visitor_id = kv.visitor_id),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
                  'at', to_char(il, 'DD/MM HH24:MI'), 'page', page, 'device', device,
                  'referrer', referrer, 'is_new', is_new, 'name', nm) order by created_at desc, id desc), '[]'::jsonb)
                 from (select v.*, coalesce(p.name, 'אורח') as nm
                         from v
                         left join linked l on l.visitor_id = v.visitor_id
                         left join minyan.kasefet_pledges p on p.id = coalesce(v.pledge_id, l.pid)
                        order by v.created_at desc, v.id desc limit 100) q)
  ) into r;
  return r;
end $$;

-- ── הרשאות ───────────────────────────────────────────────────────────────
revoke all on function minyan.log_visit(text, text, text, text, text), minyan.visits_admin(text, int) from public;
grant execute on function minyan.log_visit(text, text, text, text, text) to anon, authenticated;
grant execute on function minyan.visits_admin(text, int)                 to anon, authenticated;
