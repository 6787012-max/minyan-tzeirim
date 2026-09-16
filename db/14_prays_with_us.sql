-- 14_prays_with_us.sql — סימון "האם מתפלל אצלנו במניין הצעירים" לכל בית-אב
-- בטבלת congregants, נגיש מפאנל "אנשי קשר". יוסף 16/09/2026: "שנוכל לסמן
-- מי אצלנו ומי לא דרך האתר" — במקום באקסל.
--
-- ערכים V / X / אולי (לא yes/no/maybe): בכוונה אותה קונבנציה בדיוק כמו
-- העמודה המקבילה "מתפלל אצלנו?" בגיליון "עליות יום כיפור תשפ"ז" (שם
-- data validation על G5:G189 = רשימה "V,X,אולי") — כדי שלא יהיו שני
-- ניבים לאותו דבר בין האתר לגיליון, אם מישהו יצטרך להצליב בעתיד.
--
-- לא נוגעים ב-RLS: congregants_admin_write הקיימת (using/with check
-- minyan.is_admin()) כבר מכסה UPDATE על השורה; חסר רק ה-grant על העמודה
-- הספציפית הזו, בדיוק כמו כל עמודה שנוספה אחרי המיגרציה המקורית (ראו
-- 08_contacts_gemachim.sql, 13_congregant_scan_upload.sql).
--
-- אידמפוטנטי.

alter table minyan.congregants add column if not exists prays_with_us text
  check (prays_with_us in ('V','X','אולי'));
comment on column minyan.congregants.prays_with_us is
  'V=מתפלל אצלנו במניין הצעירים, X=לא, אולי=לא ודאי, null=טרם סומן. אותה קונבנציה כמו עמודת "מתפלל אצלנו?" בגיליון עליות יום כיפור.';

grant update (prays_with_us) on minyan.congregants to authenticated;

-- לסינון מהיר בפאנל ("מי עוד לא סומן", "מי לא אצלנו")
create index if not exists congregants_prays_with_us_idx on minyan.congregants (prays_with_us);
