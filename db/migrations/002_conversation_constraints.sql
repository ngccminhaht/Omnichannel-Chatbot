CREATE UNIQUE INDEX conversations_active_identity_idx
  ON conversations (connection_id, contact_id)
  WHERE state <> 'closed' AND state <> 'spam';
