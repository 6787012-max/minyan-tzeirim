-- service_role עוקף RLS אבל לא עוקף הרשאות ברמת schema.
-- בלי ה-grant הזה כל INSERT מהפונקציה מוחזר כ-"permission denied for schema minyan".
grant usage on schema minyan to service_role, anon, authenticated;

grant all on all tables    in schema minyan to service_role;
grant all on all sequences in schema minyan to service_role;
grant all on all functions in schema minyan to service_role;

-- anon לא מקבל כלום מעבר ל-usage. אין לו policy באף טבלה, ולכן
-- גם אם ה-anon key גלוי בקוד הדף — הוא לא רואה ולא כותב דבר.
revoke all on all tables in schema minyan from anon;

alter default privileges in schema minyan
  grant all on tables to service_role;
alter default privileges in schema minyan
  grant all on sequences to service_role;
