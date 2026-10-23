-- Kitchen places (cocina).
--
-- The kitchen has three places: fridge, freezer and pantry. A product's
-- storage is its usual place; each fridge item now records where it is
-- (place). Meat, poultry, fish and frozen products are usually in the
-- freezer, which has no expiry. add_to_fridge() takes an optional map of
-- product id to place. Nothing in "public" changes.
--
-- Supabase → SQL Editor → paste → Run. If anything fails, nothing changes.

begin;

-- ───────────────────────── Usual place
alter table heladera.products drop constraint products_storage_check;
alter table heladera.products add constraint products_storage_check
  check (storage in ('fridge', 'freezer', 'pantry'));
update heladera.products set storage = 'freezer'
  where category in ('carne', 'pollo', 'pescado', 'congelado');

-- ───────────────────────── Place of each fridge item
alter table heladera.fridge_items add column place text;
update heladera.fridge_items f set place = p.storage
  from heladera.products p where p.id = f.product_id;
update heladera.fridge_items set expires_on = null where place = 'freezer';
alter table heladera.fridge_items alter column place set not null;
alter table heladera.fridge_items add constraint fridge_items_place_check
  check (place in ('fridge', 'freezer', 'pantry'));

-- ───────────────────────── add_to_fridge with places
drop function heladera.add_to_fridge(bigint[], date);

-- Adds products to the fridge of the logged-in user's household. today
-- comes from the client: the database runs in UTC, the household does not.
-- places maps a product id (as text) to where it goes: fridge, freezer or
-- pantry; a product it leaves out goes to its usual place (products.storage).
-- Adding a product that is already there renews it (in the chosen place),
-- and takes it off the shopping list.
create function heladera.add_to_fridge(product_ids bigint[], today date, places jsonb default '{}')
returns void language sql security invoker set search_path = '' as $$
  with ids as (select distinct unnest(product_ids) as product_id),
  added as (
    insert into heladera.fridge_items (household_id, product_id, added_on, place)
    select heladera.my_household_id(), i.product_id, today, coalesce(places ->> i.product_id::text, p.storage)
    from ids i join heladera.products p on p.id = i.product_id
    on conflict (household_id, product_id)
      do update set added_on = excluded.added_on, expires_on = null, place = excluded.place
  ),
  listed as (
    delete from heladera.shopping_items s
    where s.household_id = heladera.my_household_id()
      and s.product_id in (select product_id from ids)
  )
  insert into heladera.purchases (household_id, product_id, bought_on)
  select heladera.my_household_id(), product_id, today from ids
$$;
revoke execute on function heladera.add_to_fridge(bigint[], date, jsonb) from public, anon;
grant execute on function heladera.add_to_fridge(bigint[], date, jsonb) to authenticated;

commit;
