-- עזר ליולדת (v2): סוגי ארוחות חדשים, תבנית לאירוע, "מה מביאים", שם מותאם למשבצת.
-- סוגים: breakfast, lunch, dinner, shabbat_1 (ליל שבת), shabbat_2, shabbat_3, וגם x... (משבצת בשם חופשי).

alter table minyan.meal_events add column if not exists template jsonb;            -- {"0":["breakfast","lunch"],...} לפי יום בשבוע (0=ראשון)
alter table minyan.meal_events add column if not exists bring jsonb not null default '{}'::jsonb;  -- {"lunch":"מה מביאים", ...}
alter table minyan.meal_slots  add column if not exists label text not null default '';

alter table minyan.meal_slots drop constraint if exists meal_slots_kind_check;
alter table minyan.meal_slots add constraint meal_slots_kind_check check (kind ~ '^[a-z0-9_]{1,30}$');

-- המרת משבצות קיימות לסוגים החדשים (כל הסעודות בתאריך של שבת)
update minyan.meal_slots set day = day + 1, kind = 'shabbat_1' where kind = 'shabbat_night'
  and not exists (select 1 from minyan.meal_slots t where t.event_id = meal_slots.event_id and t.day = meal_slots.day + 1 and t.kind = 'shabbat_1');
update minyan.meal_slots set kind = 'shabbat_2' where kind = 'shabbat_lunch'
  and not exists (select 1 from minyan.meal_slots t where t.event_id = meal_slots.event_id and t.day = meal_slots.day and t.kind = 'shabbat_2');
update minyan.meal_slots set kind = 'shabbat_3' where kind = 'shalosh'
  and not exists (select 1 from minyan.meal_slots t where t.event_id = meal_slots.event_id and t.day = meal_slots.day and t.kind = 'shabbat_3');
