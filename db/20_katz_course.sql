-- 20_katz_course.sql — סכימה "katz" לדפי קורס חיים כץ (/katz/), 22/11/2026.
--
-- שתי טבלאות: נסיעות לצפת (rides) והערות/הצעות תיקון לסיכומים ולמשחקים (comments).
-- אין policy לאף אחד. anon ו-authenticated לא קוראים ולא כותבים בכלל.
-- כל גישה עוברת דרך Edge Function אחת, katz-course, עם service_role.
-- קוד העריכה של כל רשומה נשמר בדפדפן של מי שיצר אותה, והמסד שומר רק hash שלו.
--
-- אידמפוטנטי: create ... if not exists, create or replace.
-- שלב נוסף שנעשה בנפרד בקוד הפריסה: הוספת katz ל-db_schema של PostgREST.

create schema if not exists katz;

-- service_role עוקף RLS אבל לא עוקף הרשאות ברמת schema (ראו זיכרון המניין).
grant usage on schema katz to service_role;

create table if not exists katz.rides (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 40),
  from_city   text not null check (char_length(from_city) between 1 and 30),
  leave_time  text not null check (char_length(leave_time) between 1 and 20),
  mode        text not null check (mode in ('offer', 'seek')),
  seats       int  not null default 0 check (seats between 0 and 12),
  passengers  text[] not null default '{}' check (cardinality(passengers) <= 12),
  pickup      text check (pickup is null or char_length(pickup) <= 200),
  contact     text check (contact is null or char_length(contact) <= 100),
  note        text check (note is null or char_length(note) <= 300),
  edit_hash   text not null check (char_length(edit_hash) = 64)
);
create index if not exists katz_rides_city on katz.rides (from_city);

create table if not exists katz.comments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  target      text not null check (char_length(target) between 1 and 120),
  kind        text not null check (kind in ('note', 'fix', 'add')),
  body        text not null check (char_length(body) between 1 and 2000),
  name        text check (name is null or char_length(name) <= 40),
  edit_hash   text not null check (char_length(edit_hash) = 64)
);
create index if not exists katz_comments_target on katz.comments (target);

alter table katz.rides    enable row level security;
alter table katz.comments enable row level security;

revoke all on all tables in schema katz from anon, authenticated;
grant all on all tables in schema katz to service_role;
