create extension if not exists pgcrypto;

create table if not exists public.tracked_products (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null,
  product_slug text,
  product_name text not null,
  product_brand text,
  product_category text,
  product_sku text,
  option_key text not null default '',
  option_id text,
  option_label text,
  product_url text not null,
  is_tracked boolean not null default true,
  last_scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_key)
);

create table if not exists public.scrape_log (
  id uuid primary key default gen_random_uuid(),
  tracked_product_id uuid references public.tracked_products(id) on delete cascade,
  product_id bigint not null,
  product_name text not null,
  option_key text not null default '',
  option_label text,
  scraped_at timestamptz not null default now(),
  price_text text,
  price_amount numeric,
  stock_text text,
  stock_quantity integer,
  stock_available boolean,
  outcome text not null check (outcome in ('success', 'retried', 'failed')),
  attempt_count integer not null default 1,
  error_message text,
  source_url text,
  created_at timestamptz not null default now()
);

create index if not exists tracked_products_is_tracked_idx on public.tracked_products (is_tracked);
create index if not exists tracked_products_product_idx on public.tracked_products (product_id, option_key);
create index if not exists scrape_log_tracked_product_idx on public.scrape_log (tracked_product_id, scraped_at desc);
create index if not exists scrape_log_product_idx on public.scrape_log (product_id, scraped_at desc);
create index if not exists scrape_log_outcome_idx on public.scrape_log (outcome, scraped_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tracked_products_updated_at on public.tracked_products;
create trigger set_tracked_products_updated_at
before update on public.tracked_products
for each row
execute procedure public.set_updated_at();