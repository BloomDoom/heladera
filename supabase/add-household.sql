-- Creates a household (hogar) with two members.
--
-- BEFORE RUNNING: create both logins (Authentication → Add user), then
-- replace NOMBRE_HOGAR, EMAIL_1, NOMBRE_1, EMAIL_2 and NOMBRE_2 below.
-- NOMBRE_1/NOMBRE_2 are the names the app shows (e.g. "Agus").
-- Fill it in only in the SQL Editor: never commit it filled in (the repo
-- is public). For one member, delete the EMAIL_2 lines.
--
-- Supabase → SQL Editor → paste → Run. If anything fails, nothing changes.

begin;

do $$
declare
  household bigint;
  m record;
  member_id uuid;
begin
  insert into heladera.households (name) values ('NOMBRE_HOGAR') returning id into household;

  for m in
    select * from (values
      ('EMAIL_1', 'NOMBRE_1'),
      ('EMAIL_2', 'NOMBRE_2')
    ) as v(email, display_name)
  loop
    select id into member_id from auth.users where email = lower(trim(m.email));
    if member_id is null then
      raise exception 'No login with the email %: create it first, or fix the email', m.email;
    end if;
    insert into heladera.household_members (user_id, household_id, display_name)
    values (member_id, household, m.display_name);
  end loop;
end $$;

commit;
