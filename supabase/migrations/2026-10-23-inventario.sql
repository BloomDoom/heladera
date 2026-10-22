-- Fridge, purchases and household products (stage 2b).
--
-- A household keeps what is in its fridge (fridge_items) and what it
-- bought (purchases), and can add its own products to the dictionary.
-- Nothing in "public" changes.
--
-- Supabase → SQL Editor → paste → Run. If anything fails, nothing changes.

begin;

-- ───────────────────────── Fridge (heladera) and purchases (compras)
-- What a household has right now: one row per product. expires_on is set
-- by hand when the default (added_on + shelf_days) is wrong.
create table heladera.fridge_items (
  household_id bigint not null references heladera.households(id),
  product_id   bigint not null references heladera.products(id),
  added_on     date not null,
  expires_on   date,
  primary key (household_id, product_id)
);

-- One row per product bought, kept after it leaves the fridge.
create table heladera.purchases (
  id           bigint generated always as identity primary key,
  household_id bigint not null references heladera.households(id),
  product_id   bigint not null references heladera.products(id),
  bought_on    date not null
);
create index purchases_household_bought_on on heladera.purchases (household_id, bought_on);

-- Adds products to the fridge of the logged-in user's household. today
-- comes from the client: the database runs in UTC, the household does not.
-- Adding a product that is already there renews it.
create function heladera.add_to_fridge(product_ids bigint[], today date)
returns void language sql security invoker set search_path = '' as $$
  with ids as (select distinct unnest(product_ids) as product_id),
  added as (
    insert into heladera.fridge_items (household_id, product_id, added_on)
    select heladera.my_household_id(), product_id, today from ids
    on conflict (household_id, product_id)
      do update set added_on = excluded.added_on, expires_on = null
  )
  insert into heladera.purchases (household_id, product_id, bought_on)
  select heladera.my_household_id(), product_id, today from ids
$$;
revoke execute on function heladera.add_to_fridge(bigint[], date) from public, anon;
grant execute on function heladera.add_to_fridge(bigint[], date) to authenticated;

-- Households add their own products (the base dictionary stays read-only:
-- no code, assumed or synonyms).
create policy "Households add own products" on heladera.products
  for insert to authenticated
  with check (household_id = (select heladera.my_household_id()));
grant insert (household_id, name, category, storage, shelf_days) on heladera.products to authenticated;

-- The fridge is the household's; only products it can see go in.
alter table heladera.fridge_items enable row level security;
create policy "Household fridge" on heladera.fridge_items
  for all to authenticated
  using (household_id = (select heladera.my_household_id()))
  with check (
    household_id = (select heladera.my_household_id())
    and exists (select 1 from heladera.products p where p.id = product_id)
  );
grant select, insert, update, delete on heladera.fridge_items to authenticated;

alter table heladera.purchases enable row level security;
create policy "Household sees its purchases" on heladera.purchases
  for select to authenticated using (household_id = (select heladera.my_household_id()));
create policy "Household records its purchases" on heladera.purchases
  for insert to authenticated with check (household_id = (select heladera.my_household_id()));
grant select, insert on heladera.purchases to authenticated;

commit;
