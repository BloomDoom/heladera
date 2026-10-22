-- Cooked, skipped dishes, basics and recipe candidates (stage 2c).
--
-- A household keeps what it cooked (cooked), the dishes it skipped
-- (rejections) and its own say on which basics it always has
-- (assumed_overrides). recipe_candidates() finds the recipes it can make.
-- Nothing in "public" changes.
--
-- Supabase → SQL Editor → paste → Run. If anything fails, nothing changes.

begin;

-- ───────────────────────── Cooked, skipped and basics (¿Qué comemos hoy?)
-- What the household cooked, kept as history. Delete is for Undo.
create table heladera.cooked (
  id           bigint generated always as identity primary key,
  household_id bigint not null references heladera.households(id),
  recipe_id    bigint not null references heladera.recipes(id) on delete cascade,
  cooked_on    date not null
);

-- Dishes the household skipped ("otra") so they stop coming up.
create table heladera.rejections (
  id           bigint generated always as identity primary key,
  household_id bigint not null references heladera.households(id),
  recipe_id    bigint not null references heladera.recipes(id) on delete cascade,
  rejected_on  date not null
);

-- A household's own say on a basic: assumed = false means "we don't always
-- have it", true means "we always have it". No row = the product's default.
create table heladera.assumed_overrides (
  household_id bigint not null references heladera.households(id),
  product_id   bigint not null references heladera.products(id),
  assumed      boolean not null,
  primary key (household_id, product_id)
);

-- Recipes the logged-in user's household can make: no main ingredient
-- missing and at most one minor. "At home" is the fridge plus the basics
-- (the product's assumed, unless the household overrides it). The recipe
-- must use something from the fridge: used_product_ids are those products,
-- without the basics.
create function heladera.recipe_candidates()
returns table (
  recipe_id bigint, title text, minutes int, used_product_ids bigint[],
  missing_product_id bigint, missing_product_name text
) language sql stable security invoker set search_path = '' as $$
  with fridge as (
    select product_id from heladera.fridge_items
    where household_id = (select heladera.my_household_id())
  ),
  basics as (
    select p.id as product_id
    from heladera.products p
    left join heladera.assumed_overrides o
      on o.product_id = p.id and o.household_id = (select heladera.my_household_id())
    where coalesce(o.assumed, p.assumed)
  ),
  home as (
    select product_id from fridge union select product_id from basics
  ),
  per_recipe as (
    select
      ri.recipe_id,
      count(*) filter (where ri.is_main and h.product_id is null) as main_missing,
      count(*) filter (where not ri.is_main and h.product_id is null) as minor_missing,
      array_agg(ri.product_id) filter (
        where f.product_id is not null and b.product_id is null
      ) as used,
      (array_agg(ri.product_id) filter (
        where not ri.is_main and h.product_id is null
      ))[1] as missing_id
    from heladera.recipe_ingredients ri
    left join home h on h.product_id = ri.product_id
    left join fridge f on f.product_id = ri.product_id
    left join basics b on b.product_id = ri.product_id
    group by ri.recipe_id
  )
  select r.id, r.title, r.minutes, pr.used, pr.missing_id, mp.name
  from per_recipe pr
  join heladera.recipes r on r.id = pr.recipe_id
  left join heladera.products mp on mp.id = pr.missing_id
  where pr.main_missing = 0 and pr.minor_missing <= 1 and pr.used is not null
  order by r.id
$$;
revoke execute on function heladera.recipe_candidates() from public, anon;
grant execute on function heladera.recipe_candidates() to authenticated;

alter table heladera.cooked enable row level security;
create policy "Household sees what it cooked" on heladera.cooked
  for select to authenticated using (household_id = (select heladera.my_household_id()));
create policy "Household records what it cooked" on heladera.cooked
  for insert to authenticated with check (
    household_id = (select heladera.my_household_id())
    and exists (select 1 from heladera.recipes r where r.id = recipe_id)
  );
create policy "Household undoes what it cooked" on heladera.cooked
  for delete to authenticated using (household_id = (select heladera.my_household_id()));
grant select, insert, delete on heladera.cooked to authenticated;

alter table heladera.rejections enable row level security;
create policy "Household sees its skipped dishes" on heladera.rejections
  for select to authenticated using (household_id = (select heladera.my_household_id()));
create policy "Household skips dishes" on heladera.rejections
  for insert to authenticated with check (
    household_id = (select heladera.my_household_id())
    and exists (select 1 from heladera.recipes r where r.id = recipe_id)
  );
grant select, insert on heladera.rejections to authenticated;

alter table heladera.assumed_overrides enable row level security;
create policy "Household basics" on heladera.assumed_overrides
  for all to authenticated
  using (household_id = (select heladera.my_household_id()))
  with check (
    household_id = (select heladera.my_household_id())
    and exists (select 1 from heladera.products p where p.id = product_id)
  );
grant select, insert, update, delete on heladera.assumed_overrides to authenticated;

grant usage, select on all sequences in schema heladera to service_role;

commit;
