-- Create all tables from Drizzle schema

-- group_bindings table
CREATE TABLE IF NOT EXISTS group_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  group_id TEXT NOT NULL,
  topic_id TEXT,
  lane TEXT NOT NULL,
  market TEXT NOT NULL,
  data TEXT,
  purpose TEXT,
  created_at INTEGER NOT NULL
);

-- Add user_id column if it doesn't exist (for existing tables)
ALTER TABLE group_bindings ADD COLUMN user_id TEXT;

-- users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  safety_profile TEXT DEFAULT 'balanced' NOT NULL,
  priority_fee_tier TEXT DEFAULT 'medium',
  show_token_preview INTEGER DEFAULT 1 NOT NULL,
  unsafe_override INTEGER DEFAULT 0 NOT NULL,
  price_impact_limit INTEGER DEFAULT 500,
  liquidity_minimum TEXT DEFAULT '1000',
  tp_percent INTEGER,
  sl_percent INTEGER,
  min_buy_amount TEXT DEFAULT '0.01',
  priority_fee_amount TEXT DEFAULT '0.0015',
  mev_protection INTEGER DEFAULT 1 NOT NULL,
  max_retries INTEGER DEFAULT 3,
  rpc_preference TEXT DEFAULT 'auto',
  custom_rpc_url TEXT,
  duplicate_protection INTEGER DEFAULT 1 NOT NULL,
  is_mainnet INTEGER DEFAULT 1 NOT NULL,
  last_airdrop INTEGER,
  last_active INTEGER,
  withdrawal_address TEXT,
  withdrawal_amount TEXT
);

-- user_lanes table
CREATE TABLE IF NOT EXISTS user_lanes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  lane TEXT NOT NULL,
  enabled INTEGER DEFAULT 0 NOT NULL
);

-- user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  topic_id TEXT,
  lane TEXT NOT NULL,
  enabled INTEGER DEFAULT 1 NOT NULL,
  created_at INTEGER NOT NULL
);

-- user_premiums table
CREATE TABLE IF NOT EXISTS user_premiums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  daily_analyze_usage INTEGER DEFAULT 0 NOT NULL,
  daily_other_usage INTEGER DEFAULT 0 NOT NULL,
  last_usage_reset INTEGER NOT NULL
);

-- admins table
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  is_owner INTEGER DEFAULT 0 NOT NULL,
  created_at INTEGER NOT NULL
);

-- wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  label TEXT NOT NULL,
  is_mainnet INTEGER DEFAULT 1 NOT NULL,
  is_active INTEGER DEFAULT 0 NOT NULL,
  balance TEXT DEFAULT '0',
  created_at INTEGER NOT NULL
);

-- signals table
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL,
  bias TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  timeframe TEXT DEFAULT '1h',
  status TEXT DEFAULT 'active',
  entry_price TEXT,
  tp1 TEXT,
  tp2 TEXT,
  tp3 TEXT,
  sl TEXT,
  message_id TEXT,
  chat_id TEXT,
  topic_id TEXT,
  last_update_at INTEGER,
  next_update_at INTEGER,
  data TEXT,
  created_at INTEGER NOT NULL
);

-- trades table
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  wallet_id INTEGER NOT NULL,
  mint TEXT NOT NULL,
  symbol TEXT,
  amount_in TEXT NOT NULL,
  amount_out TEXT,
  entry_price TEXT,
  status TEXT DEFAULT 'pending',
  tx_hash TEXT,
  error TEXT,
  tp1 TEXT,
  sl TEXT,
  created_at INTEGER NOT NULL
);

-- Chat-related tables (for replit integrations)
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  topic_id TEXT,
  title TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

