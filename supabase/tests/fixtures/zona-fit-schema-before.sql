-- Zona Fit: database schema (everything in one file).
-- Run this once in Supabase → SQL Editor → New query → paste → Run.
--
-- Conventions:
--   * Money is stored as whole pesos (integer). No centavos.
--   * Months are stored as a date on the 1st (2026-03-01 = March 2026).
--   * Weekdays: 1 = Monday ... 7 = Sunday (ISO standard).
--   * Payments, charges, absences and sales are never deleted: they get a
--     deleted_at timestamp instead ("soft delete"), so history survives.
--   * Table and column names are in English (like the code); everything
--     Nadia reads on screen is in Spanish.


-- ───────────────────────── Settings (always exactly one row)
create table settings (
  id               int primary key default 1 check (id = 1),
  due_day          int not null default 10 check (due_day between 1 and 28),  -- no longer used: each fee is due on the day its member started
  skip_months      int[] not null default '{}',  -- e.g. {1} = no fees in January
  birthday_message text not null
    default '¡Feliz cumple, {name}! 🎂 Que tengas un día hermoso. ¡Te esperamos en Zona Fit! 💪'
);
insert into settings (id) values (1);


-- ───────────────────────── Plans (what members pay for)
-- e.g. "2 veces por semana", "3 veces por semana", "Libre".
create table plans (
  id             bigint generated always as identity primary key,
  name           text not null,
  times_per_week int check (times_per_week between 1 and 7),  -- to warn if her times don't match
  notes          text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Price history. The price for a month = the row with the latest
-- effective_month that is <= that month.
create table plan_prices (
  id              bigint generated always as identity primary key,
  plan_id         bigint not null references plans(id),
  amount          int not null check (amount >= 0),
  effective_month date not null check (extract(day from effective_month) = 1),
  unique (plan_id, effective_month)
);


-- ───────────────────────── Classes (called "groups" in the code)
-- A class with fixed weekly times, e.g. "Funcional" Tue + Thu 19:00.
create table groups (
  id         bigint generated always as identity primary key,
  name       text not null,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- The fixed weekly times of each class ("Tuesday 19:00, 60 min").
create table group_slots (
  id           bigint generated always as identity primary key,
  group_id     bigint not null references groups(id),
  weekday      int not null check (weekday between 1 and 7),
  start_time   time not null,
  duration_min int not null default 60 check (duration_min > 0),
  active       boolean not null default true  -- turned off instead of deleted
);


-- ───────────────────────── Members (socios)
-- plan_id = what they pay each month. No plan = no monthly fee.
create table members (
  id              bigint generated always as identity primary key,
  name            text not null,
  phone           text,
  birth_date      date,
  emergency_name  text,
  emergency_phone text,
  notes           text,
  plan_id         bigint references plans(id),
  active          boolean not null default true,
  start_date      date not null default current_date,
  created_at      timestamptz not null default now()
);

-- Which weekly times (one day + hour of a class) a member goes to, for
-- the attendance lists. Leaving a time sets end_date, so the history is kept.
create table slot_enrollments (
  id         bigint generated always as identity primary key,
  member_id  bigint not null references members(id),
  slot_id    bigint not null references group_slots(id),
  start_date date not null default current_date,
  end_date   date
);

-- A member signed up to a WHOLE class, without her times chosen yet
-- (members loaded before times existed, or from a CSV import). She shows
-- as "Falta elegir horarios" and is on every list of that class until
-- her times are chosen; then this row gets an end_date.
create table enrollments (
  id         bigint generated always as identity primary key,
  member_id  bigint not null references members(id),
  group_id   bigint not null references groups(id),
  start_date date not null default current_date,
  end_date   date
);


-- ───────────────────────── Sessions (one class on one day)
-- Regular weekly classes are NOT stored in advance: the app calculates
-- them from group_slots. A row is saved here only when something happens
-- to a class: attendance saved, cancelled, moved, or an extra class.
--   original_date = the week's regular date this class belongs to
--   date          = when it actually happens (differs if it was moved)
-- Extra (one-off) classes have slot_id and original_date = null.
create table sessions (
  id                  bigint generated always as identity primary key,
  group_id            bigint not null references groups(id),
  slot_id             bigint references group_slots(id),
  original_date       date,
  date                date not null,
  start_time          time not null,
  duration_min        int not null check (duration_min > 0),
  cancelled           boolean not null default false,
  note                text,
  attendance_saved_at timestamptz,
  created_at          timestamptz not null default now(),
  unique (slot_id, original_date)
);

-- Attendance: everyone is present unless there's a row here.
create table absences (
  id         bigint generated always as identity primary key,
  session_id bigint not null references sessions(id),
  member_id  bigint not null references members(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (session_id, member_id)
);


-- ───────────────────────── Monthly fees
-- One charge per member per month. The plan and amount are COPIED when
-- the charge is created, so later price or plan changes never touch
-- past months.
create table charges (
  id            bigint generated always as identity primary key,
  member_id     bigint not null references members(id),
  plan_id       bigint not null references plans(id),
  month         date not null check (extract(day from month) = 1),
  amount        int not null check (amount >= 0),
  amount_edited boolean not null default false,  -- she changed it by hand
  note          text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (member_id, month)
);

create table payments (
  id         bigint generated always as identity primary key,
  charge_id  bigint not null references charges(id),
  amount     int not null check (amount > 0),
  paid_on    date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  method     text not null check (method in ('cash', 'transfer', 'mercado_pago', 'cuenta_dni')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);


-- ───────────────────────── Shop (tienda)
-- stock is only changed by the functions further down (record_sale,
-- undo_sale, add_stock, lend_product...), so it always matches the sales.
-- It counts only what's on the rack (perchero): clothes a chica took to
-- try are in loan_moves until she buys them or gives them back.
create table products (
  id         bigint generated always as identity primary key,
  name       text not null,
  price      int not null check (price >= 0),
  stock      int not null default 0,  -- can go below 0 if she sells more than she counted
  min_stock  int not null default 3 check (min_stock >= 0),  -- warn at this many or fewer
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  -- clothes hang on the rack and can be lent; consumables (agua, granola) can't
  kind       text not null default 'clothes' check (kind in ('clothes', 'consumable'))
);

-- unit_price is copied from the product at the moment of the sale.
create table sales (
  id         bigint generated always as identity primary key,
  product_id bigint not null references products(id),
  qty        int not null check (qty > 0),
  unit_price int not null check (unit_price >= 0),
  method     text not null check (method in ('cash', 'transfer', 'mercado_pago', 'cuenta_dni')),
  member_id  bigint references members(id),  -- who bought it, for clothes a chica had taken
  sold_on    date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- The shop's wallet: money that goes in or out of the shop, apart from sales.
--   purchase   = paid for stock that arrived (product_id + qty)
--   withdrawal = money taken out of the shop (e.g. to the gym's pocket)
--   deposit    = money put in (e.g. the cash the shop starts with)
-- Wallet balance = sales + deposits − purchases − withdrawals.
create table shop_moves (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('purchase', 'withdrawal', 'deposit')),
  amount     int not null check (amount >= 0),
  product_id bigint references products(id),
  qty        int,
  note       text,
  moved_on   date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);


-- What each chica took and how it ended:
--   lent     = she took qty from the rack
--   returned = she gave qty back to the rack
--   sold     = she bought qty of what she had (sale_id = that sale)
-- What she still has = lent − returned − sold. products.stock counts only
-- what's on the rack, so lending takes it off and returning puts it back.
create table loan_moves (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('lent', 'returned', 'sold')),
  product_id bigint not null references products(id),
  member_id  bigint not null references members(id),
  qty        int not null check (qty > 0),
  sale_id    bigint references sales(id),
  moved_on   date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);


-- ───────────────────────── Monthly fee functions
-- The app calls ensure_charges('2026-09-01') every time the Pagos screen
-- opens a month. It's safe to run any number of times.
-- "Untouched" charge = no payments and not edited by hand. Only those
-- are ever changed automatically; anything she touched stays as it is.

-- The price of a plan for a month: the latest price starting on or
-- before that month. If the plan's first price starts later, use that
-- first price (so months before the app was set up still get charged).
create function price_for(p_plan bigint, p_month date)
returns int language sql stable as $$
  select amount
  from plan_prices
  where plan_id = p_plan
  order by
    (effective_month <= p_month) desc,                                 -- prices that apply first...
    case when effective_month <= p_month then effective_month end desc, -- ...the latest of those
    effective_month asc                                                -- otherwise the earliest price
  limit 1
$$;

create function ensure_charges(p_month date)
returns void language plpgsql as $$
declare
  month_end  date := (p_month + interval '1 month' - interval '1 day')::date;
  this_month date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  skipped    boolean;
begin
  -- Months without fees (Ajustes → "Meses sin cuota").
  select extract(month from p_month)::int = any (skip_months) into skipped from settings where id = 1;
  if skipped then
    update charges c set deleted_at = now()
    where c.month = p_month and c.deleted_at is null and not c.amount_edited
      and not exists (select 1 from payments p where p.charge_id = c.id and p.deleted_at is null);
    return;
  end if;

  -- 1. A charge for every active member with an active plan who had
  --    started by the end of that month. Plan and amount are copied.
  insert into charges (member_id, plan_id, month, amount)
  select m.id, m.plan_id, p_month, price_for(m.plan_id, p_month)
  from members m
  join plans pl on pl.id = m.plan_id and pl.active
  where m.active
    and m.start_date <= month_end
    and price_for(m.plan_id, p_month) is not null
  on conflict (member_id, month) do update
    -- a charge removed automatically before (e.g. month was skipped) comes back
    set deleted_at = null, amount = excluded.amount, plan_id = excluded.plan_id
    where charges.deleted_at is not null;

  -- 2. Untouched charges follow price changes for their month.
  update charges c set amount = price_for(c.plan_id, p_month)
  where c.month = p_month and c.deleted_at is null and not c.amount_edited
    and price_for(c.plan_id, p_month) is not null
    and price_for(c.plan_id, p_month) <> c.amount
    and not exists (select 1 from payments p where p.charge_id = c.id and p.deleted_at is null);

  -- 3. This month and next: untouched charges follow a change of plan.
  --    (Past months keep the plan they had.)
  if p_month >= this_month then
    update charges c set plan_id = m.plan_id, amount = price_for(m.plan_id, p_month)
    from members m
    where m.id = c.member_id and m.plan_id is not null and m.plan_id <> c.plan_id
      and c.month = p_month and c.deleted_at is null and not c.amount_edited
      and price_for(m.plan_id, p_month) is not null
      and not exists (select 1 from payments p where p.charge_id = c.id and p.deleted_at is null);
  end if;

  -- 4. Next month only: remove untouched charges of members who have
  --    left or have no plan now. (Current and past months are never
  --    cleaned up: someone who leaves mid-month still owes that month.)
  if p_month > this_month then
    update charges c set deleted_at = now()
    where c.month = p_month and c.deleted_at is null and not c.amount_edited
      and not exists (select 1 from payments p where p.charge_id = c.id and p.deleted_at is null)
      and not exists (
        select 1 from members m
        join plans pl on pl.id = m.plan_id and pl.active
        where m.id = c.member_id and m.active and m.start_date <= month_end
      );
  end if;
end $$;


-- ───────────────────────── Shop functions
-- Each one changes the sale and the stock together (one transaction),
-- so the stock can never get out of step with the sales.

-- Sells p_qty of a product at its current price. Returns the sale id
-- (the app keeps it for the Undo button).
create function record_sale(p_product bigint, p_qty int, p_method text)
returns bigint language plpgsql as $$
declare new_id bigint;
begin
  insert into sales (product_id, qty, unit_price, method)
  select id, p_qty, price, p_method from products where id = p_product
  returning id into new_id;
  if new_id is null then
    raise exception 'product % not found', p_product;
  end if;
  update products set stock = stock - p_qty where id = p_product;
  return new_id;
end $$;

-- Undo / remove a sale: marked as removed, and the stock goes back. If
-- the sale was of clothes a chica had, they go back to her instead.
create function undo_sale(p_sale bigint)
returns void language plpgsql as $$
declare s record;
begin
  update sales set deleted_at = now()
  where id = p_sale and deleted_at is null
  returning product_id, qty into s;
  if found then
    update loan_moves set deleted_at = now() where sale_id = p_sale and deleted_at is null;
    if not found then
      update products set stock = stock + s.qty where id = s.product_id;
    end if;
  end if;
end $$;

-- A stock correction (a negative number takes some away). No money moves.
create function add_stock(p_product bigint, p_qty int)
returns void language sql as $$
  update products set stock = stock + p_qty where id = p_product
$$;

-- Stock arrived and was paid for: adds the stock and the purchase together.
-- Returns the purchase id (the app keeps it for the Undo button).
create function restock(p_product bigint, p_qty int, p_cost int)
returns bigint language plpgsql as $$
declare new_id bigint;
begin
  update products set stock = stock + p_qty where id = p_product;
  if not found then
    raise exception 'product % not found', p_product;
  end if;
  insert into shop_moves (kind, amount, product_id, qty)
  values ('purchase', p_cost, p_product, p_qty)
  returning id into new_id;
  return new_id;
end $$;

-- Undo / remove a purchase: marked as removed, and its stock is taken back.
create function undo_restock(p_move bigint)
returns void language plpgsql as $$
declare m record;
begin
  update shop_moves set deleted_at = now()
  where id = p_move and kind = 'purchase' and deleted_at is null
  returning product_id, qty into m;
  if found then
    update products set stock = stock - m.qty where id = m.product_id;
  end if;
end $$;

-- What's in the shop's wallet right now.
create function shop_balance()
returns int language sql stable as $$
  select (coalesce((select sum(qty * unit_price) from sales where deleted_at is null), 0)
        + coalesce((select sum(case when kind = 'deposit' then amount else -amount end)
                    from shop_moves where deleted_at is null), 0))::int
$$;

-- How many of a product a chica has right now.
create function loan_qty(p_product bigint, p_member bigint)
returns int language sql stable as $$
  select coalesce(sum(case when kind = 'lent' then qty else -qty end), 0)::int
  from loan_moves
  where product_id = p_product and member_id = p_member and deleted_at is null
$$;

-- Everything that's with a chica now, one row per chica + product.
-- since = the first day she took it. kind = clothes (to try) or
-- consumable (she took it and hasn't paid yet).
create function open_loans()
returns table (member_id bigint, member_name text, product_id bigint, product_name text,
               price int, qty int, since date, kind text)
language sql stable as $$
  select l.member_id, m.name, l.product_id, p.name, p.price,
         sum(case when l.kind = 'lent' then l.qty else -l.qty end)::int,
         min(l.moved_on) filter (where l.kind = 'lent'),
         p.kind
  from loan_moves l
  join members m on m.id = l.member_id
  join products p on p.id = l.product_id
  where l.deleted_at is null
  group by l.member_id, m.name, l.product_id, p.name, p.price, p.kind
  having sum(case when l.kind = 'lent' then l.qty else -l.qty end) > 0
  order by m.name, p.name
$$;

-- A chica takes p_qty from the rack. Returns the move id (for Undo).
create function lend_product(p_product bigint, p_member bigint, p_qty int)
returns bigint language plpgsql as $$
declare new_id bigint;
begin
  update products set stock = stock - p_qty where id = p_product;
  if not found then
    raise exception 'product % not found', p_product;
  end if;
  insert into loan_moves (kind, product_id, member_id, qty)
  values ('lent', p_product, p_member, p_qty)
  returning id into new_id;
  return new_id;
end $$;

-- She gives p_qty back: they go back on the rack. Returns the move id.
create function return_loan(p_product bigint, p_member bigint, p_qty int)
returns bigint language plpgsql as $$
declare new_id bigint;
begin
  if p_qty > loan_qty(p_product, p_member) then
    raise exception 'she only has % of product %', loan_qty(p_product, p_member), p_product;
  end if;
  update products set stock = stock + p_qty where id = p_product;
  insert into loan_moves (kind, product_id, member_id, qty)
  values ('returned', p_product, p_member, p_qty)
  returning id into new_id;
  return new_id;
end $$;

-- She buys p_qty of what she has, at today's price. The stock doesn't
-- change (it already left the rack). Returns the sale id (undo with undo_sale).
create function sell_loan(p_product bigint, p_member bigint, p_qty int, p_method text)
returns bigint language plpgsql as $$
declare new_id bigint;
begin
  if p_qty > loan_qty(p_product, p_member) then
    raise exception 'she only has % of product %', loan_qty(p_product, p_member), p_product;
  end if;
  insert into sales (product_id, qty, unit_price, method, member_id)
  select id, p_qty, price, p_method, p_member from products where id = p_product
  returning id into new_id;
  insert into loan_moves (kind, product_id, member_id, qty, sale_id)
  values ('sold', p_product, p_member, p_qty, new_id);
  return new_id;
end $$;

-- Undo a "took" or "gave back" (a "bought" is undone with undo_sale).
create function undo_loan_move(p_move bigint)
returns void language plpgsql as $$
declare l record;
begin
  update loan_moves set deleted_at = now()
  where id = p_move and kind in ('lent', 'returned') and deleted_at is null
  returning kind, product_id, member_id, qty into l;
  if not found then
    return;
  end if;
  if loan_qty(l.product_id, l.member_id) < 0 then
    raise exception 'she already bought or returned some of it';
  end if;
  update products
  set stock = stock + case when l.kind = 'lent' then l.qty else -l.qty end
  where id = l.product_id;
end $$;

-- Only the logged-in user may run these (Postgres lets everyone by default).
revoke execute on function price_for(bigint, date), ensure_charges(date),
  record_sale(bigint, int, text), undo_sale(bigint), add_stock(bigint, int),
  restock(bigint, int, int), undo_restock(bigint), shop_balance(),
  loan_qty(bigint, bigint), open_loans(), lend_product(bigint, bigint, int),
  return_loan(bigint, bigint, int), sell_loan(bigint, bigint, int, text), undo_loan_move(bigint) from public, anon;
grant execute on function price_for(bigint, date), ensure_charges(date),
  record_sale(bigint, int, text), undo_sale(bigint), add_stock(bigint, int),
  restock(bigint, int, int), undo_restock(bigint), shop_balance(),
  loan_qty(bigint, bigint), open_loans(), lend_product(bigint, bigint, int),
  return_loan(bigint, bigint, int), sell_loan(bigint, bigint, int, text), undo_loan_move(bigint) to authenticated;


-- ───────────────────────── Security (Row Level Security)
-- Sign-ups are turned off in Supabase, so the only account that can log
-- in is Nadia's. Rule: logged-in users can do everything, visitors who
-- aren't logged in can't see or change anything.
do $$
declare t text;
begin
  foreach t in array array['settings', 'plans', 'plan_prices', 'groups', 'group_slots', 'members',
    'slot_enrollments', 'enrollments','sessions', 'absences', 'charges', 'payments', 'products', 'sales', 'shop_moves', 'loan_moves']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "Logged-in user has full access" on %I
                    for all to authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
end $$;

-- Deleting is only allowed where it can't destroy history. Payments,
-- charges, absences, sessions, sales, shop moves, loan moves and products have no delete
-- permission at all, so even a bug in the app can't erase them.
grant delete on plan_prices, group_slots, slot_enrollments, enrollments to authenticated;


-- ───────────────────────── Keep-alive
-- Supabase pauses free projects after 7 days without activity (e.g. the
-- January holidays). A GitHub Action calls this every few days.
create function ping() returns int language sql as 'select 1';
grant execute on function ping() to anon;
