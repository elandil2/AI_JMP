-- Benchmark bookkeeping. Existing batches keep the original 2.5 Flash default.
alter table public.batches
  add column model text not null default 'gemini-2.5-flash',
  add column use_tolls boolean not null default true,
  add column departure_time timestamptz,
  add column input_hash text;

alter table public.batches
  add constraint batches_model_check
  check (model in ('gemini-2.5-flash', 'gemini-3.8-flash'));

alter table public.batch_items
  add column attempt_id uuid,
  add column claimed_at timestamptz,
  add column attempt_count integer not null default 0;

create unique index batch_items_batch_row_unique
  on public.batch_items (batch_id, row_index);

-- Server-only usage ledger. Nullable amounts mean a provider did not return
-- enough information for a defensible estimate; they must never mean zero.
create table public.generation_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete set null,
  batch_item_id uuid references public.batch_items(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  attempt_id uuid,
  provider text not null check (provider in ('gemini', 'maps')),
  stage text not null,
  model text check (model in ('gemini-2.5-flash', 'gemini-3.8-flash')),
  outcome text not null check (outcome in ('ok', 'error')),
  duration_ms integer,
  prompt_tokens integer,
  candidate_tokens integer,
  thoughts_tokens integer,
  cached_tokens integer,
  tool_prompt_tokens integer,
  search_query_count integer,
  source_count integer,
  token_cost_usd numeric(12, 6),
  search_cost_usd numeric(12, 6),
  maps_cost_usd numeric(12, 6),
  route_source text check (route_source in ('maps', 'gemini_fallback', 'unavailable')),
  error_code text,
  pricing_as_of date not null default date '2026-09-14',
  created_at timestamptz not null default now()
);

create index generation_events_batch_idx on public.generation_events (batch_id, created_at);
create index generation_events_report_idx on public.generation_events (report_id, created_at);

alter table public.generation_events enable row level security;
revoke all on table public.generation_events from public, anon, authenticated;
grant select, insert, update, delete on table public.generation_events to service_role;
