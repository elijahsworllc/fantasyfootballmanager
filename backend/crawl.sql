-- Trade crawl tables (backend/crawl.mjs). Run once in Supabase → SQL Editor → New query → Run.
-- Row-level security is on with no policies, so only the secret (service role) key used by the
-- scheduled job can read or write these tables. The app's publishable key cannot see them.

-- Leagues found by the crawl, with the settings that make trades comparable ("league fingerprint").
create table if not exists public.crawl_leagues (
  league_id          text primary key,
  season             int not null,
  status             text,
  kind               smallint not null default 0,   -- Sleeper settings.type: 0 redraft, 1 keeper, 2 dynasty
  best_ball          boolean not null default false,
  teams              int,
  qbs                smallint,                      -- 2 = superflex or 2QB
  ppr                real,
  tep                real,                          -- tight end premium (bonus per TE reception)
  pass_td            real,
  idp                boolean not null default false,
  starters           text,                          -- starting slots, e.g. "QB,RB,RB,WR,WR,TE,FLEX,SUPER_FLEX"
  roster_size        int,
  taxi               int,
  faab               int,
  previous_league_id text,
  discovered_at      timestamptz not null default now(),
  scanned_at         timestamptz,                   -- last time its transactions were read
  scanned_week       int,
  users_done         boolean not null default false -- its managers have been added to crawl_users
);
create index if not exists crawl_leagues_queue on public.crawl_leagues (kind desc, scanned_at asc nulls first);

-- Managers found in crawled leagues; each one leads to more leagues.
create table if not exists public.crawl_users (
  user_id       text primary key,
  discovered_at timestamptz not null default now(),
  scanned_at    timestamptz
);
create index if not exists crawl_users_queue on public.crawl_users (scanned_at asc nulls first);

-- Completed trades. adds: {player_id: receiving roster_id}; picks: [{season, round, orig, to, from}];
-- faab: [{from, to, amount}].
create table if not exists public.trades (
  transaction_id text primary key,
  league_id      text not null references public.crawl_leagues(league_id) on delete cascade,
  season         int not null,
  week           int,
  ts             timestamptz not null,
  roster_ids     int[] not null default '{}',
  adds           jsonb not null default '{}'::jsonb,
  drops          jsonb not null default '{}'::jsonb,
  picks          jsonb not null default '[]'::jsonb,
  faab           jsonb not null default '[]'::jsonb,
  inserted_at    timestamptz not null default now()
);
create index if not exists trades_ts on public.trades (ts desc);
create index if not exists trades_league on public.trades (league_id);
create index if not exists trades_adds on public.trades using gin (adds);

alter table public.crawl_leagues enable row level security;
alter table public.crawl_users   enable row level security;
alter table public.trades        enable row level security;
revoke all on public.crawl_leagues, public.crawl_users, public.trades from anon, authenticated;
