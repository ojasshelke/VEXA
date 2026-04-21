create table subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id text not null unique,
  plan text,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text default 'inactive',
  try_on_limit int default 50,
  try_on_used int default 0,
  current_period_start timestamp,
  updated_at timestamp
);
