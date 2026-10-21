create table if not exists minyan.gan_signatures (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null,
  child text not null,
  gan text not null,
  phone text not null default ''
);
alter table minyan.gan_signatures enable row level security;
grant all on minyan.gan_signatures to service_role;
grant usage, select on all sequences in schema minyan to service_role;
