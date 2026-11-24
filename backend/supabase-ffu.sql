-- FFU fantasy database (Nov 23, 2026). Run once in Supabase → SQL Editor → New query → Run. Safe to re-run.
-- Everything here is server-only: row level security is on with no policies, so the app's publishable key
-- can't read or write these tables. The nightly jobs (GitHub Actions) and the data API (Vercel) use the
-- project's secret key, which bypasses row level security.

-- Leagues we've crawled: their shape (format and scoring that matter for value) and who owns each roster.
create table if not exists public.ffu_leagues (
  league_id  text primary key,
  season     int  not null,
  type       smallint,            -- 0 redraft, 1 keeper, 2 dynasty
  teams      smallint,
  qbs        smallint,            -- 2 = superflex / 2QB
  ppr        real,
  tep        real,
  pass_td    real,
  owners     jsonb,               -- {roster_id: user_id}
  owners_at  timestamptz,
  updated_at timestamptz not null default now()
);

-- Every completed trade, with the owner on each side at the time we recorded it.
create table if not exists public.ffu_trades (
  id         text primary key,    -- Sleeper transaction id
  league_id  text not null,
  season     int  not null,
  ts         timestamptz not null,
  rids       int[] not null,
  owners     text[],              -- user ids in the same order as rids (null where unknown)
  adds       jsonb not null default '{}'::jsonb,   -- {player_id: receiving roster_id}
  picks      jsonb not null default '[]'::jsonb,   -- [{season, round, orig, to, from}]
  created_at timestamptz not null default now()
);
create index if not exists ffu_trades_league on public.ffu_trades (league_id);
create index if not exists ffu_trades_ts on public.ffu_trades (ts desc);
create index if not exists ffu_trades_owners on public.ffu_trades using gin (owners);
create index if not exists ffu_trades_adds on public.ffu_trades using gin (adds jsonb_path_ops);

-- Daily FFU values per asset (player id, or pick key like "2027-1") and league shape ("sf" or "oneqb").
create table if not exists public.ffu_values (
  day     date not null,
  shape   text not null,
  asset   text not null,
  ffu     int  not null,          -- the FFU value
  market  int,                    -- market price that day (FantasyCalc), when there is one
  factor  real,                   -- in-house factor applied (1 = market)
  n       int,                    -- trades behind the factor
  src     text,                   -- "trades", "market", or "experts" (no market price)
  primary key (day, shape, asset)
);
create index if not exists ffu_values_asset on public.ffu_values (asset, shape, day desc);

-- Manager profiles from every trade in the database (built nightly).
create table if not exists public.ffu_managers (
  user_id    text primary key,
  season     int not null,
  trades     int not null,
  profile    jsonb not null,       -- {lastDay, leagues, partners, pricing, pricedN, buy[], sell[], buyPricing}
  updated_at timestamptz not null default now()
);

-- Data API: keys are stored only as SHA-256 hashes; usage is counted per key per day.
create table if not exists public.api_keys (
  key_hash    text primary key,
  owner       text not null,
  plan        text not null default 'trial',
  daily_limit int  not null default 1000,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create table if not exists public.api_usage (
  key_hash text not null references public.api_keys(key_hash) on delete cascade,
  day      date not null default (now() at time zone 'utc')::date,
  calls    int  not null default 0,
  primary key (key_hash, day)
);

-- One call per API request: counts it and says whether the key is valid and under its daily limit.
create or replace function public.ffu_api_hit(p_hash text)
returns table (ok boolean, plan text, calls int, daily_limit int)
language plpgsql
security definer
set search_path = ''
as $$
declare k public.api_keys; c int;
begin
  select * into k from public.api_keys where key_hash = p_hash and not revoked;
  if not found then return query select false, null::text, 0, 0; return; end if;
  insert into public.api_usage (key_hash, day, calls) values (p_hash, (now() at time zone 'utc')::date, 1)
    on conflict (key_hash, day) do update set calls = public.api_usage.calls + 1
    returning public.api_usage.calls into c;
  return query select c <= k.daily_limit, k.plan, c, k.daily_limit;
end;
$$;

-- Trades that moved a given player (for the API's /trades?player=), newest first.
create or replace function public.ffu_trades_with_player(p_id text, p_limit int default 50)
returns setof public.ffu_trades
language sql stable security definer set search_path = ''
as $$ select * from public.ffu_trades where adds ? p_id order by ts desc limit least(greatest(p_limit, 1), 200) $$;
revoke all on function public.ffu_trades_with_player(text, int) from public, anon, authenticated;

alter table public.ffu_leagues  enable row level security;
alter table public.ffu_trades   enable row level security;
alter table public.ffu_values   enable row level security;
alter table public.ffu_managers enable row level security;
alter table public.api_keys     enable row level security;
alter table public.api_usage    enable row level security;
revoke all on public.ffu_leagues, public.ffu_trades, public.ffu_values, public.ffu_managers, public.api_keys, public.api_usage from anon, authenticated;
revoke all on function public.ffu_api_hit(text) from public, anon, authenticated;

-- To issue a key (keep the plain key; only its hash is stored):
--   insert into public.api_keys (key_hash, owner, plan, daily_limit)
--   values (encode(sha256('ffu_live_PASTE_A_LONG_RANDOM_STRING'::bytea), 'hex'), 'Partner name', 'trial', 1000);
