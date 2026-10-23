-- Shopping list (stage 3).
--
-- shopping_items is what the household plans to buy; shopping_snoozes are
-- habitual products put off for now. finish_fridge_item() sends a finished
-- fridge product to the list, add_to_fridge() now also takes products off
-- it, store_checked() moves the checked ones into the fridge,
-- add_recipe_to_list() lists what a dish is missing and week_candidates()
-- suggests dishes that are 1 to 3 products away.
-- Nothing in "public" changes.
--
-- Supabase → SQL Editor → paste → Run. If anything fails, nothing changes.

begin;

-- ───────────────────────── Shopping list (lista de compras)
-- What the household plans to buy. reason: se_acabo (finished in the fridge),
-- habitual (usually bought), plato (for a dish), a_mano (typed in).
create table heladera.shopping_items (
  household_id bigint not null references heladera.households(id),
  product_id   bigint not null references heladera.products(id),
  reason       text not null check (reason in ('se_acabo', 'habitual', 'plato', 'a_mano')),
  recipe_id    bigint references heladera.recipes(id) on delete set null,
  added_on     date not null,
  checked      boolean not null default false,
  primary key (household_id, product_id)
);

-- Habitual products the household put off ("hoy no").
create table heladera.shopping_snoozes (
  household_id bigint not null references heladera.households(id),
  product_id   bigint not null references heladera.products(id),
  snoozed_on   date not null,
  primary key (household_id, product_id)
);

-- Adds products to the fridge of the logged-in user's household. today
-- comes from the client: the database runs in UTC, the household does not.
-- Adding a product that is already there renews it, and takes it off the
-- shopping list.
create or replace function heladera.add_to_fridge(product_ids bigint[], today date)
returns void language sql security invoker set search_path = '' as $$
  with ids as (select distinct unnest(product_ids) as product_id),
  added as (
    insert into heladera.fridge_items (household_id, product_id, added_on)
    select heladera.my_household_id(), product_id, today from ids
    on conflict (household_id, product_id)
      do update set added_on = excluded.added_on, expires_on = null
  ),
  listed as (
    delete from heladera.shopping_items s
    where s.household_id = heladera.my_household_id()
      and s.product_id in (select product_id from ids)
  )
  insert into heladera.purchases (household_id, product_id, bought_on)
  select heladera.my_household_id(), product_id, today from ids
$$;
revoke execute on function heladera.add_to_fridge(bigint[], date) from public, anon;
grant execute on function heladera.add_to_fridge(bigint[], date) to authenticated;

alter table heladera.shopping_items enable row level security;
create policy "Household shopping list" on heladera.shopping_items
  for all to authenticated
  using (household_id = (select heladera.my_household_id()))
  with check (
    household_id = (select heladera.my_household_id())
    and exists (select 1 from heladera.products p where p.id = product_id)
    and (recipe_id is null or exists (select 1 from heladera.recipes r where r.id = recipe_id))
  );
grant select, insert, delete on heladera.shopping_items to authenticated;
grant update (checked) on heladera.shopping_items to authenticated;

alter table heladera.shopping_snoozes enable row level security;
create policy "Household snoozes" on heladera.shopping_snoozes
  for all to authenticated
  using (household_id = (select heladera.my_household_id()))
  with check (
    household_id = (select heladera.my_household_id())
    and exists (select 1 from heladera.products p where p.id = product_id)
  );
grant select, insert, delete on heladera.shopping_snoozes to authenticated;
grant update (snoozed_on) on heladera.shopping_snoozes to authenticated;

-- The list is shared live between the household's phones.
alter publication supabase_realtime add table heladera.shopping_items;

-- A fridge product ran out: it leaves the fridge and goes on the list.
-- true only when it was added now (not already listed).
create function heladera.finish_fridge_item(product_id bigint, today date)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  added int;
begin
  delete from heladera.fridge_items f
  where f.household_id = (select heladera.my_household_id())
    and f.product_id = finish_fridge_item.product_id;

  insert into heladera.shopping_items (household_id, product_id, reason, added_on)
  values ((select heladera.my_household_id()), finish_fridge_item.product_id, 'se_acabo', today)
  on conflict on constraint shopping_items_pkey do nothing;
  get diagnostics added = row_count;
  return added > 0;
end
$$;
revoke execute on function heladera.finish_fridge_item(bigint, date) from public, anon;
grant execute on function heladera.finish_fridge_item(bigint, date) to authenticated;

-- Moves everything checked on the list into the fridge (and the purchases).
-- Returns how many products that was.
create function heladera.store_checked(today date)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  ids bigint[];
begin
  -- Delete first: a second phone pressing at once waits on the row locks and finds none.
  with gone as (
    delete from heladera.shopping_items s
    where s.household_id = (select heladera.my_household_id()) and s.checked
    returning s.product_id
  )
  select coalesce(array_agg(g.product_id), '{}') into ids from gone g;

  if cardinality(ids) = 0 then
    return 0;
  end if;
  perform heladera.add_to_fridge(ids, today);
  return cardinality(ids);
end
$$;
revoke execute on function heladera.store_checked(date) from public, anon;
grant execute on function heladera.store_checked(date) to authenticated;

-- Puts on the list what a recipe needs and the household doesn't have at
-- home (fridge or basics). Returns the product ids it added.
create function heladera.add_recipe_to_list(recipe_id bigint, today date)
returns bigint[] language plpgsql security invoker set search_path = '' as $$
declare
  added bigint[];
begin
  if not exists (select 1 from heladera.recipes r where r.id = add_recipe_to_list.recipe_id) then
    raise exception 'recipe not found';
  end if;

  with home as (
    select f.product_id from heladera.fridge_items f
    where f.household_id = (select heladera.my_household_id())
    union
    select p.id
    from heladera.products p
    left join heladera.assumed_overrides o
      on o.product_id = p.id and o.household_id = (select heladera.my_household_id())
    where coalesce(o.assumed, p.assumed)
  ),
  ins as (
    insert into heladera.shopping_items (household_id, product_id, reason, recipe_id, added_on)
    select (select heladera.my_household_id()), m.product_id, 'plato', add_recipe_to_list.recipe_id, today
    from (
      select distinct ri.product_id from heladera.recipe_ingredients ri
      where ri.recipe_id = add_recipe_to_list.recipe_id
        and ri.product_id not in (select product_id from home)
    ) m
    on conflict (household_id, product_id) do nothing
    returning product_id
  )
  select coalesce(array_agg(product_id order by product_id), '{}') into added from ins;
  return added;
end
$$;
revoke execute on function heladera.add_recipe_to_list(bigint, date) from public, anon;
grant execute on function heladera.add_recipe_to_list(bigint, date) to authenticated;

-- Recipes the household is 1 to 3 products away from cooking, with what is
-- missing (main or minor), fewest missing first.
create function heladera.week_candidates()
returns table (
  recipe_id bigint, title text, minutes int, missing_names text[],
  own boolean, favorite boolean
) language sql stable security invoker set search_path = '' as $$
  with home as (
    select f.product_id from heladera.fridge_items f
    where f.household_id = (select heladera.my_household_id())
    union
    select p.id
    from heladera.products p
    left join heladera.assumed_overrides o
      on o.product_id = p.id and o.household_id = (select heladera.my_household_id())
    where coalesce(o.assumed, p.assumed)
  ),
  missing as (
    select m.recipe_id, count(*) as n, array_agg(m.name order by m.name) as names
    from (
      select distinct ri.recipe_id, ri.product_id, p.name
      from heladera.recipe_ingredients ri
      join heladera.products p on p.id = ri.product_id
      where ri.product_id not in (select product_id from home)
    ) m
    group by m.recipe_id
  )
  select r.id, r.title, r.minutes, ms.names,
    r.household_id is not null,
    exists (
      select 1 from heladera.favorites fv
      where fv.recipe_id = r.id and fv.household_id = (select heladera.my_household_id())
    )
  from missing ms
  join heladera.recipes r on r.id = ms.recipe_id
  where ms.n between 1 and 3
  order by ms.n, r.id
  limit 300
$$;
revoke execute on function heladera.week_candidates() from public, anon;
grant execute on function heladera.week_candidates() to authenticated;

commit;
