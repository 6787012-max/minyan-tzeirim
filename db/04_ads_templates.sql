-- 04_ads_templates.sql — תבניות מותאמות-אישית לעורך המודעות (2026-09-15, בקשת יוסף)
--
-- התבניות הקבועות (התרמה/הודעה/זמני שבת/ריבוע-וואטסאפ) חיות בקובץ סטטי
-- data/ads-templates.json — אין לזה גישת-כתיבה מהדפדפן. תבנית שמנהל שומר
-- מתוך העורך עצמו ("שמירה כתבנית…") נכתבת לכאן במקום. js/admin-ads.js
-- מציג את שתי הרשימות מאוחדות: הקבועות קודם, אחריהן "התבניות שלנו".
--
-- הרשאות: כמו כל שאר הטבלאות בסכימה — minyan.is_admin() בלבד (לא anon,
-- לא authenticated סתם). בלי update (recreate ולא edit-במקום, מספיק לצורך).
--
-- אידמפוטנטי.

create table if not exists minyan.ads_templates (
  id         bigserial primary key,
  name       text not null,
  canvas     jsonb not null,
  elements   jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table minyan.ads_templates enable row level security;

drop policy if exists ads_tpl_read on minyan.ads_templates;
create policy ads_tpl_read on minyan.ads_templates
  for select to authenticated using (minyan.is_admin());
drop policy if exists ads_tpl_write on minyan.ads_templates;
create policy ads_tpl_write on minyan.ads_templates
  for insert to authenticated with check (minyan.is_admin());
drop policy if exists ads_tpl_delete on minyan.ads_templates;
create policy ads_tpl_delete on minyan.ads_templates
  for delete to authenticated using (minyan.is_admin());

grant select, insert, delete on minyan.ads_templates to authenticated;
grant usage, select on sequence minyan.ads_templates_id_seq to authenticated;
