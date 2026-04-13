-- Run in Supabase SQL editor (optional; /api/ar/session logs best-effort)
create table if not exists usage_logs (
  id uuid default gen_random_uuid() primary key,
  endpoint text not null,
  user_id uuid not null,
  product_id text not null,
  created_at timestamp with time zone default timezone('utc', now())
);

create index if not exists usage_logs_user_id_idx on usage_logs(user_id);
