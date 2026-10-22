-- Favorites and recipes written by the household (stage 2d).
--
-- A household marks recipes as favorites (favorites) and writes its own
-- recipes (recipes with household_id), saved with save_own_recipe().
-- recipe_candidates() now also says which recipes are own and favorite.
-- Base recipes stay read-only. Nothing in "public" changes.
--
-- Supabase → SQL Editor → paste → Run. If anything fails, nothing changes.

begin;

-- ───────────────────────── Favorites
create table heladera.favorites (
  household_id bigint not null references heladera.households(id),
  recipe_id    bigint not null references heladera.recipes(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (household_id, recipe_id)
);

alter table heladera.favorites enable row level security;
create policy "Household favorites" on heladera.favorites
  for all to authenticated
  using (household_id = (select heladera.my_household_id()))
  with check (
    household_id = (select heladera.my_household_id())
    and exists (select 1 from heladera.recipes r where r.id = recipe_id)
  );
grant select, insert, delete on heladera.favorites to authenticated;

-- ───────────────────────── Own recipes
-- Households write, edit and delete their own recipes. source_key stays out
-- of the grants and the check (household_id is null) = (source_key is not null)
-- keeps them from writing base rows.
create policy "Households add own recipes" on heladera.recipes
  for insert to authenticated
  with check (household_id = (select heladera.my_household_id()) and source = 'propia');
create policy "Households edit own recipes" on heladera.recipes
  for update to authenticated
  using (household_id = (select heladera.my_household_id()))
  with check (household_id = (select heladera.my_household_id()));
create policy "Households delete own recipes" on heladera.recipes
  for delete to authenticated
  using (household_id = (select heladera.my_household_id()));
grant insert (household_id, title, minutes, servings, steps, source) on heladera.recipes to authenticated;
grant update (title, minutes, servings, steps) on heladera.recipes to authenticated;
grant delete on heladera.recipes to authenticated;

-- Ingredients only of the household's own recipes, with products it can see.
create policy "Households add ingredients to own recipes" on heladera.recipe_ingredients
  for insert to authenticated
  with check (
    exists (
      select 1 from heladera.recipes r
      where r.id = recipe_id and r.household_id = (select heladera.my_household_id())
    )
    and exists (select 1 from heladera.products p where p.id = product_id)
  );
create policy "Households remove ingredients of own recipes" on heladera.recipe_ingredients
  for delete to authenticated
  using (exists (
    select 1 from heladera.recipes r
    where r.id = recipe_id and r.household_id = (select heladera.my_household_id())
  ));
grant insert, delete on heladera.recipe_ingredients to authenticated;

-- Writes a recipe of the logged-in user's household and its ingredients
-- ([{ product_id, line, is_main }]) in one go. recipe_id null = new recipe.
-- A blank line stores the product's name. Runs with the caller's rights, so
-- RLS decides: another household's recipe or a product it can't see fails
-- the whole call and nothing is saved.
create function heladera.save_own_recipe(
  recipe_id bigint, title text, minutes int, servings int, steps text, ingredients jsonb
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  rid bigint;
begin
  if title is null or btrim(title) = '' then
    raise exception 'title is required';
  end if;
  if ingredients is null or jsonb_typeof(ingredients) <> 'array' or jsonb_array_length(ingredients) = 0 then
    raise exception 'ingredients are required';
  end if;

  if save_own_recipe.recipe_id is null then
    insert into heladera.recipes (household_id, title, minutes, servings, steps, source)
    values (
      (select heladera.my_household_id()), btrim(save_own_recipe.title),
      save_own_recipe.minutes, save_own_recipe.servings, save_own_recipe.steps, 'propia'
    )
    returning id into rid;
  else
    update heladera.recipes r
    set title = btrim(save_own_recipe.title), minutes = save_own_recipe.minutes,
        servings = save_own_recipe.servings, steps = save_own_recipe.steps
    where r.id = save_own_recipe.recipe_id
    returning r.id into rid;
    if rid is null then
      raise exception 'recipe not found';
    end if;
    delete from heladera.recipe_ingredients ri where ri.recipe_id = rid;
  end if;

  insert into heladera.recipe_ingredients (recipe_id, product_id, line, is_main)
  select rid, e.product_id, coalesce(nullif(btrim(e.line), ''), p.name), coalesce(e.is_main, false)
  from jsonb_to_recordset(save_own_recipe.ingredients) as e(product_id bigint, line text, is_main boolean)
  left join heladera.products p on p.id = e.product_id;

  return rid;
end
$$;
revoke execute on function heladera.save_own_recipe(bigint, text, int, int, text, jsonb) from public, anon;
grant execute on function heladera.save_own_recipe(bigint, text, int, int, text, jsonb) to authenticated;

-- ───────────────────────── Recipe candidates, now flagged own and favorite
-- Same logic and order as before; own = written by a household, favorite =
-- the household marked it. The return type changes, so the old one goes.
drop function heladera.recipe_candidates();
create function heladera.recipe_candidates()
returns table (
  recipe_id bigint, title text, minutes int, used_product_ids bigint[],
  missing_product_id bigint, missing_product_name text,
  own boolean, favorite boolean
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
  select r.id, r.title, r.minutes, pr.used, pr.missing_id, mp.name,
    r.household_id is not null,
    exists (
      select 1 from heladera.favorites fv
      where fv.recipe_id = r.id and fv.household_id = (select heladera.my_household_id())
    )
  from per_recipe pr
  join heladera.recipes r on r.id = pr.recipe_id
  left join heladera.products mp on mp.id = pr.missing_id
  where pr.main_missing = 0 and pr.minor_missing <= 1 and pr.used is not null
  order by r.id
$$;
revoke execute on function heladera.recipe_candidates() from public, anon;
grant execute on function heladera.recipe_candidates() to authenticated;

grant usage, select on all sequences in schema heladera to service_role;

commit;
