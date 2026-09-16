-- 09_family_extraction.sql — חילוץ אוטומטי של פרטי משפחה מספח ת״ז
-- שהועלה בטופס simchat.html. הפייפליין: Storage → Gemini Vision → JSON.
--
-- נשמר בעמודות של signups עצמה (לא טבלה נפרדת) כי:
--  1. חילוץ שייך להרשמה, לא ישות עצמאית
--  2. אין כרגע צורך להצליב "אותה משפחה בשני טפסים" — הפרטים גם מגיעים
--     מהזהות (mt-form-identity) ב-localStorage
--  3. פחות joins ב-admin
--
-- אידמפוטנטי.

alter table minyan.signups add column if not exists family_extracted jsonb;
alter table minyan.signups add column if not exists extraction_status text
  check (extraction_status in ('pending','extracted','failed','skipped'))
  default null;
alter table minyan.signups add column if not exists extraction_error text;

-- אינדקס קטן כדי לחפש הרשמות שלא חולצו עדיין (למקרה שנרצה re-run)
create index if not exists signups_extraction_pending_idx on minyan.signups (extraction_status)
  where extraction_status = 'pending';

comment on column minyan.signups.family_extracted is
  'JSON: { head_of_household:{name,id?}, spouse?:{name,id?},
           address?:string, city?:string,
           children:[{name,id?,birth_date?,gender?}],
           notes?:string, model:string, extracted_at:iso8601 }';
comment on column minyan.signups.extraction_status is
  'pending=בהמתנה, extracted=הצליח, failed=נכשל, skipped=לא צורף ספח';
