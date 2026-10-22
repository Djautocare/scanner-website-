-- Customer receipt delivery and its independent, opt-in per-shop subscription.
CREATE TABLE IF NOT EXISTS retail_receipt_accounts (
 inventory_id uuid PRIMARY KEY REFERENCES retail_stores(inventory_id) ON DELETE CASCADE,
 subscription_created_at bigint, stripe_customer_id text UNIQUE, stripe_subscription_id text UNIQUE, checkout_id text,
 checkout_expires_at timestamptz, status text NOT NULL DEFAULT 'none',
 period_start timestamptz, period_end timestamptz, intro_end timestamptz,
 cancel_at_period_end boolean NOT NULL DEFAULT false, payment_confirmed boolean NOT NULL DEFAULT false,
 override_enabled boolean NOT NULL DEFAULT false, override_expires_at timestamptz,
 override_reason text NOT NULL DEFAULT '', synced_at timestamptz
);
CREATE TABLE IF NOT EXISTS retail_receipt_emails (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL,
 sale_id uuid NOT NULL, request_id uuid NOT NULL, email text NOT NULL, payload jsonb NOT NULL,
 actor_id uuid, staff_id uuid, created_at timestamptz NOT NULL, first_attempt_at timestamptz,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL,
 sent_at timestamptz, provider_id text, error text, meter_customer_id text,
 meter_first_attempt_at timestamptz, meter_reported_at timestamptz, meter_event_at timestamptz,
 UNIQUE(inventory_id,request_id),
 FOREIGN KEY(workspace_id,inventory_id,sale_id) REFERENCES retail_sales(workspace_id,inventory_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS retail_receipt_jobs ON retail_receipt_emails(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS retail_receipt_usage ON retail_receipt_emails(inventory_id,sent_at);
