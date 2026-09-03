-- תמונות בהודעות. מודעה סרוקה היא לרוב *כל* ההודעה — הגוף ריק
-- והתוכן כולו בתמונה — ולכן בלי זה חצי מהלוח היה כותרת בלי כלום.
alter table minyan.news add column if not exists images jsonb not null default '[]'::jsonb;

-- התצוגה הציבורית נבנית מחדש כדי לכלול images.
-- ocr_text עדיין לא נחשף: הוא נשמר לצורך חיפוש וביקורת, ומה שמוצג
-- לציבור הוא ה-body שכבר שולב בו הטקסט אחרי ניקוי.
drop view if exists minyan.news_public;
create view minyan.news_public
with (security_invoker = true) as
select id, title, body, category, image_url, images, msg_date, created_at
from minyan.news
where status = 'approved' and (expires_at is null or expires_at > now());

grant select on minyan.news_public to anon, authenticated;
