ALTER TABLE channel_connections
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz;
