-- Analytics: Postgres is the source of truth. KV is optional cache only.

create table if not exists analytics_events (
  id text primary key,
  event_type text not null default 'pageview',
  visitor_id text,
  session_id text,
  page text,
  path text,
  referrer text,
  user_agent text,
  device_type text,
  browser text,
  country text,
  host text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx on analytics_events (created_at);
create index if not exists analytics_events_visitor_id_idx on analytics_events (visitor_id);
create index if not exists analytics_events_session_id_idx on analytics_events (session_id);
create index if not exists analytics_events_event_type_idx on analytics_events (event_type);
create index if not exists analytics_events_path_idx on analytics_events (path);

create table if not exists analytics_sessions (
  session_id text primary key,
  visitor_id text,
  last_seen_at timestamptz not null default now(),
  path text
);

create index if not exists analytics_sessions_last_seen_idx on analytics_sessions (last_seen_at);

create table if not exists analytics_daily_peak (
  day_wib date primary key,
  peak integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists analytics_hourly (
  hour_utc timestamptz primary key,
  page_views integer not null default 0,
  unique_visitors integer not null default 0,
  sessions integer not null default 0
);
