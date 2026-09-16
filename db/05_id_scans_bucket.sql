-- 05_id_scans_bucket.sql
-- דלי אחסון פרטי לספחי ת״ז שנשלחים דרך טופס simchat.html
-- Bucket פרטי; anon יכול רק להעלות (INSERT) לתת-נתיב simchat/; קריאה רק ל-service_role.
-- מריצים דרך Management API (tools/sb.py sql db/05_id_scans_bucket.sql).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'id-scans',
  'id-scans',
  false,
  33554432, -- 32 MiB (מרחב לקבצים עד 30 מגה + header)
  array['image/jpeg','image/jpg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- מדיניות: anon יכול להעלות אך ורק תחת simchat/ (וזה גם קורא הכל, service_role עוקף RLS)
drop policy if exists "id_scans anon insert simchat" on storage.objects;
create policy "id_scans anon insert simchat" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'id-scans'
    and (storage.foldername(name))[1] = 'simchat'
  );

-- ללא מדיניות SELECT ל-anon → אין קריאה, אין רשימה. גישה רק דרך signed URL של service_role.
