-- 13_congregant_scan_upload.sql — העלאת ספח ת"ז ישירות מכרטיס איש-קשר
-- בפאנל (לא רק דרך טופס ציבורי), עם חילוץ אוטומטי + שדה ילדים ערוך.
-- יוסף: "שיהיה לי אפשרות להעלות ידנית את הספח, ושהוא מסתנכרן אוטומטית
-- לשם... ואפשר לשנות/להוסיף ילדים".
--
-- אידמפוטנטי.

alter table minyan.congregants add column if not exists children jsonb not null default '[]'::jsonb;
comment on column minyan.congregants.children is
  'JSON array: [{name, id_num?, birth_date?, gender?}] — נערך ידנית או ממולא מהצעת חילוץ ספח.';
grant update (children) on minyan.congregants to authenticated;

-- העלאה מהפאנל היא authenticated+admin (לא anon כמו simchat/) — תיקיית
-- משנה נפרדת 'contacts/' כדי שה-policy הציבורית של simchat לא תחול כאן.
drop policy if exists "id_scans admin insert contacts" on storage.objects;
create policy "id_scans admin insert contacts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'id-scans'
    and (storage.foldername(name))[1] = 'contacts'
    and minyan.is_admin()
  );
