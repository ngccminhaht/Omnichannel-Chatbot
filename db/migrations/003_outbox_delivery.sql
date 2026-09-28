ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'queued';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_at timestamptz;
CREATE INDEX IF NOT EXISTS outbox_delivery_ready_idx
  ON outbox_events (available_at, created_at)
  WHERE published_at IS NULL AND status = 'queued';
