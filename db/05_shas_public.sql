-- הטבלה הציבורית של הש״ס נבנתה מ-data/shas.json בלבד, ולכן אישור
-- בפאנל לא שינה בה כלום — הגבאי אישר, והכרך המשיך להופיע פנוי.
--
-- התצוגה הזו חושפת את המינימום שנדרש כדי לסמן כרך כתפוס:
-- מזהה הכרך והשם. **בלי טלפון, בלי מייל, בלי סכום** — אלה נשארים
-- לגבאי בלבד. שם על כרך הוא ממילא מה שיודפס בספר עצמו.
create or replace view minyan.shas_taken
with (security_invoker = true) as
select ref_key, name, status
from minyan.signups
where kind = 'shas'
  and ref_key is not null
  and status in ('confirmed', 'paid');

-- ה-view רץ בהרשאות הקורא, ולכן צריך policy אמיתית ל-anon על
-- הטבלה — מצומצמת בדיוק לאותן שורות.
drop policy if exists signups_shas_public on minyan.signups;
create policy signups_shas_public on minyan.signups
  for select to anon
  using (kind = 'shas' and status in ('confirmed', 'paid'));

-- העמודות שאסור ל-anon לראות נחסמות ברמת ההרשאה ולא רק בתצוגה,
-- כך שגם פנייה ישירה ל-signups לא תחזיר טלפון או סכום.
revoke all on minyan.signups from anon;
grant select (kind, ref_key, ref_label, name, status) on minyan.signups to anon;
grant select on minyan.shas_taken to anon, authenticated;
