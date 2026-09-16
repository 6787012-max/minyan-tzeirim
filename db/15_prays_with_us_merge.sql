-- 15_prays_with_us_merge.sql — משלים 14_prays_with_us.sql: בלי זה, מיזוג שני
-- כרטיסים כפולים (rpc/merge_congregants, מ-11_contacts_crm.sql) היה משאיר את
-- prays_with_us של הכרטיס שנמחק אבוד בשקט — אף שדה בפונקציה לא נגע בעמודה
-- כי היא לא הייתה קיימת כשהפונקציה נכתבה. create or replace עם אותו גוף
-- בדיוק + שורה אחת, לא שינוי התנהגות בשום שדה אחר.
--
-- אידמפוטנטי.

create or replace function minyan.merge_congregants(keep_id bigint, drop_id bigint, fields jsonb)
returns void language plpgsql security definer set search_path = minyan as $$
begin
  if not minyan.is_admin() then raise exception 'not admin'; end if;
  if keep_id = drop_id then raise exception 'same id'; end if;

  update minyan.congregants c set
    surname        = coalesce(fields->>'surname', c.surname),
    full_name      = coalesce(fields->>'full_name', c.full_name),
    phone          = coalesce(fields->>'phone', c.phone),
    email          = coalesce(fields->>'email', c.email),
    address        = coalesce(fields->>'address', c.address),
    id_num         = coalesce(fields->>'id_num', c.id_num),
    role           = coalesce(fields->>'role', c.role),
    match_note     = coalesce(fields->>'match_note', c.match_note),
    prays_with_us  = coalesce(fields->>'prays_with_us', c.prays_with_us),
    tags           = (select array(select distinct unnest(
                       c.tags || (select tags from minyan.congregants where id = drop_id)))),
    updated_at     = now()
  where c.id = keep_id;

  update minyan.contact_docs         set contact_id = keep_id where contact_id = drop_id;
  update minyan.signups              set congregant_id = keep_id where congregant_id = drop_id;
  update minyan.congregant_relations set a_id = keep_id where a_id = drop_id;
  update minyan.congregant_relations set b_id = keep_id where b_id = drop_id;
  delete from minyan.congregant_relations where a_id = b_id; -- self-relation שנוצר מהמיזוג

  delete from minyan.congregants where id = drop_id;
end $$;
grant execute on function minyan.merge_congregants(bigint, bigint, jsonb) to authenticated;
