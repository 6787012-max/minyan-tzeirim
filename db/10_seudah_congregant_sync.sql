-- 10_seudah_congregant_sync.sql — עריכת רישומי סעודת שמחת תורה מתעדכנת
-- אוטומטית בכרטיס איש הקשר התואם (מבוקשת ע"י יוסף, 16/09/2026).
--
-- למה טריגר ולא לוגיקה ב-admin.js: העריכה בפאנל היא PATCH ישיר על
-- signups (authenticated, לא דרך Edge Function), וגם ה-INSERT הראשוני
-- מגיע מה-Edge Function (service_role) — שתי דרכים לגעת באותה שורה.
-- טריגר ב-DB הוא המקום היחיד שרואה את שתיהן, אז הסנכרון קורה פעם אחת
-- ובמקום אחד, לא משוכפל בין JS ל-Deno.
--
-- מכוון בכוונה רק ל-kind='other' + ref_key שמתחיל ב-'seudah-' (לא לכל
-- signup באתר) — kibud/shas/seats/contact הם לא "אנשי קהילה" לצורך
-- הכרטיס הזה, ו-congregants הוא רשימה מטופחת לקמפיין תרומות; ליצור שם
-- כרטיס לכל מי שממלא איזשהו טופס היה מזהם אותה. תג 'סעודת שמחת תורה'
-- על כל כרטיס שנוגע כאן מאפשר להבדיל/לסנן בעתיד.
--
-- לא דורס עריכות ידניות קיימות בכרטיס: מעדכן full_name/address רק אם
-- היו ריקים, ומוסיף לתגית בלי למחוק תגיות קיימות.
--
-- אידמפוטנטי.

alter table minyan.signups add column if not exists congregant_id bigint
  references minyan.congregants(id) on delete set null;
create index if not exists signups_congregant_idx on minyan.signups(congregant_id);

-- עריכה מהפאנל: שם/טלפון/כמות/פרטים (עד היום רק status+admin_note היו פתוחים).
grant update (name, phone, qty, details) on minyan.signups to authenticated;

create or replace function minyan.norm_phone(p text) returns text
language sql immutable as $$
  select right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 9)
$$;

create or replace function minyan.sync_seudah_congregant() returns trigger
language plpgsql security definer set search_path = minyan as $$
declare
  cid       bigint;
  fam       jsonb;
  addr      text;
  scan_path text;
  scan_name text;
  norm      text;
begin
  if new.ref_key is null or new.ref_key not like 'seudah-%' then
    return new;
  end if;

  norm := minyan.norm_phone(new.phone);
  if norm <> '' then
    select id into cid from minyan.congregants
     where minyan.norm_phone(phone) = norm
     limit 1;
  end if;

  fam  := new.family_extracted;
  addr := nullif(trim(both ', ' from
            coalesce(fam->>'address','') ||
            case when coalesce(fam->>'city','') <> '' then ', ' || (fam->>'city') else '' end
          ), '');

  if cid is null then
    insert into minyan.congregants
      (surname, full_name, phone, address, is_family, match_note, tags, last_contact_at)
    values
      (split_part(trim(new.name), ' ', 1), new.name, new.phone, addr, true,
       'נוסף אוטומטית מטופס סעודת שמחת תורה', array['סעודת שמחת תורה'], now())
    on conflict (surname, full_name) do update set
      phone = coalesce(nullif(minyan.congregants.phone, ''), excluded.phone),
      last_contact_at = now()
    returning id into cid;
  else
    update minyan.congregants set
      full_name       = coalesce(nullif(full_name, ''), new.name),
      address         = coalesce(nullif(address, ''), addr),
      tags            = case when tags @> array['סעודת שמחת תורה'] then tags
                             else tags || array['סעודת שמחת תורה'] end,
      last_contact_at = now()
    where id = cid;
  end if;

  scan_path := new.details->>'id_scan_path';
  scan_name := new.details->>'id_scan_name';
  if coalesce(scan_path, '') <> '' and cid is not null
     and not exists (select 1 from minyan.contact_docs
                       where contact_id = cid and file_path = scan_path) then
    insert into minyan.contact_docs (contact_id, kind, file_path, original_name, uploaded_by)
    values (cid, 'id_scan', scan_path, scan_name, 'form:simchat');
  end if;

  new.congregant_id := cid;
  return new;
end $$;

drop trigger if exists seudah_sync on minyan.signups;
create trigger seudah_sync
  before insert or update of name, phone, details, family_extracted
  on minyan.signups
  for each row execute function minyan.sync_seudah_congregant();
