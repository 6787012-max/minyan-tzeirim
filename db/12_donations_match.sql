-- 12_donations_match.sql — קישור תרומות (נדרים פלוס) לכרטיס איש-קשר.
-- יוסף: "זה לא מסונכרן עם התרומות" — donations.client_name הוא טקסט חופשי
-- מנדרים פלוס, בלי שום קשר ל-congregants. אין טלפון משותף לשני הצדדים
-- (בניגוד ל-signups↔congregants), אז אי אפשר לקשר אוטומטית-ובוודאות
-- כמו במיגרציה 10 — זה עניין כספי, שיוך שגוי הוא בעיה אמיתית. הפתרון:
-- הצעת-התאמה לפי דמיון שם (pg_trgm, שני הכיוונים כי נדרים פלוס לפעמים
-- "פרטי משפחה" ולפעמים "משפחה פרטי", ולפעמים כינוי כמו יוסי/יוסף) —
-- ומנהל מאשר בקליק, לא commitment אוטומטי. אחרי אישור פעם אחת לשם
-- מסוים, כל תרומה עתידית מאותו client_name משתייכת לבד (trigger).
--
-- אידמפוטנטי.

alter table minyan.donations add column if not exists congregant_id bigint
  references minyan.congregants(id) on delete set null;
create index if not exists donations_congregant_idx on minyan.donations(congregant_id);

create extension if not exists pg_trgm with schema public;

-- ── שיוך אוטומטי להמשך: ברגע ששם שויך פעם אחת, כל תרומה עתידית מאותו
--    client_name (upsert שעתי מנדרים פלוס) יורשת את אותו congregant. ──
create or replace function minyan.auto_link_donation() returns trigger
language plpgsql security definer set search_path = minyan as $$
declare cid bigint;
begin
  if new.congregant_id is null then
    select d.congregant_id into cid from minyan.donations d
      where d.client_name = new.client_name and d.congregant_id is not null
      limit 1;
    new.congregant_id := cid;
  end if;
  return new;
end $$;

drop trigger if exists donations_auto_link on minyan.donations;
create trigger donations_auto_link
  before insert or update of client_name on minyan.donations
  for each row execute function minyan.auto_link_donation();

-- ── הצעות התאמה לשמות שעדיין לא שויכו ────────────────────────────────
create or replace function minyan.donation_match_suggestions()
returns table(client_name text, total_amount numeric, tx_count bigint,
              congregant_id bigint, congregant_name text, score real)
language sql stable security definer set search_path = minyan, public as $$
  with unmatched as (
    select d.client_name, sum(d.amount) as total_amount, count(*) as tx_count
      from minyan.donations d
     where d.congregant_id is null
     group by d.client_name
  ),
  scored as (
    select u.client_name, u.total_amount, u.tx_count,
           c.id as congregant_id, coalesce(c.full_name, c.surname) as congregant_name,
           greatest(
             similarity(u.client_name, coalesce(c.full_name, c.surname)),
             similarity(u.client_name, c.surname)
           ) as score,
           row_number() over (partition by u.client_name
                               order by greatest(
                                 similarity(u.client_name, coalesce(c.full_name, c.surname)),
                                 similarity(u.client_name, c.surname)
                               ) desc) as rnk
      from unmatched u
      cross join minyan.congregants c
  )
  select client_name, total_amount, tx_count, congregant_id, congregant_name, score
    from scored
   where rnk = 1
   order by score desc
$$;
grant execute on function minyan.donation_match_suggestions() to authenticated;

-- ── שיוך בפועל: כל התרומות הקיימות עם אותו client_name בבת אחת ───────
create or replace function minyan.assign_donation_match(p_client_name text, p_congregant_id bigint)
returns integer language plpgsql security definer set search_path = minyan as $$
declare n int;
begin
  if not minyan.is_admin() then raise exception 'not admin'; end if;
  update minyan.donations set congregant_id = p_congregant_id where client_name = p_client_name;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function minyan.assign_donation_match(text, bigint) to authenticated;

-- ── סיכום תרומות לכרטיס, לתצוגה בפאנל אנשי-קשר ────────────────────────
create or replace view minyan.congregant_donations
with (security_invoker = true) as
select congregant_id, sum(amount) as total_amount, count(*) as tx_count, max(transaction_time) as last_at
  from minyan.donations
 where congregant_id is not null
 group by congregant_id;
grant select on minyan.congregant_donations to authenticated;
