-- שיבוץ ארוחות ליולדת / למשפחה שצריכה עזרה (meals.html, meals-admin.html).
-- כל הטבלאות סגורות: RLS פעיל, אין policy ואין grant ל-anon/authenticated.
-- הגישה רק דרך פונקציית meals (מפתח שירות בצד השרת).

create table if not exists minyan.meal_events (
  id         bigserial primary key,
  slug       text not null unique,
  family     text not null,
  date_from  date not null,
  date_to    date not null,
  address    text not null default '',
  notes      text not null default '',
  closed     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists minyan.meal_slots (
  id       bigserial primary key,
  event_id bigint not null references minyan.meal_events(id) on delete cascade,
  day      date not null,
  kind     text not null check (kind in ('dinner','shabbat_night','shabbat_lunch','lunch','shalosh')),
  active   boolean not null default true,
  unique (event_id, day, kind)
);

create table if not exists minyan.meal_signups (
  id         bigserial primary key,
  slot_id    bigint not null unique references minyan.meal_slots(id) on delete cascade,  -- unique = משבצת אחת, מתפסת פעם אחת
  name       text not null,
  phone      text not null,
  dish       text not null,
  token      text not null,           -- לביטול עצמי ממכשיר המתנדבת
  created_at timestamptz not null default now()
);

create table if not exists minyan.meal_contacts (
  id         bigserial primary key,
  name       text not null,
  phone      text not null,
  source     text not null default '',
  created_at timestamptz not null default now(),
  unique (phone, name)
);
create index if not exists meal_contacts_name_idx on minyan.meal_contacts (name text_pattern_ops);

alter table minyan.meal_events   enable row level security;
alter table minyan.meal_slots    enable row level security;
alter table minyan.meal_signups  enable row level security;
alter table minyan.meal_contacts enable row level security;
revoke all on minyan.meal_events, minyan.meal_slots, minyan.meal_signups, minyan.meal_contacts from anon, authenticated;
grant all on minyan.meal_events, minyan.meal_slots, minyan.meal_signups, minyan.meal_contacts to service_role;
grant usage, select on all sequences in schema minyan to service_role;
