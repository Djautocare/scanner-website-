-- Backups survive a shop being removed so a retried request cannot delete another shop.
-- No account passwords, staff PINs or login tokens are stored here.
ALTER TABLE retail_stores ADD COLUMN IF NOT EXISTS deleting_backup_id uuid;
CREATE TABLE IF NOT EXISTS retail_store_deletions (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL,
 owner_id uuid NOT NULL, recipient text NOT NULL, store_name text NOT NULL,
 snapshot_hash text NOT NULL, manifest jsonb NOT NULL, email_payload jsonb,
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN('prepared','sent','deleting','deleted')),
 provider_id text, send_lease_until timestamptz,
 billing_environment text NOT NULL, subscription_ids jsonb NOT NULL DEFAULT '[]',
 billing_result jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL, sent_at timestamptz, deleted_at timestamptz,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS retail_deletion_store ON retail_store_deletions(workspace_id,inventory_id,created_at);
