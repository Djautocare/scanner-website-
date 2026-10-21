-- Retail subscriptions, device credentials and store-scoped cashier access.
CREATE TABLE IF NOT EXISTS retail_stores(
 inventory_id uuid PRIMARY KEY REFERENCES inventories(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name text NOT NULL,customer_number text NOT NULL UNIQUE,
 enabled boolean NOT NULL DEFAULT true,
 stripe_customer_id text,stripe_subscription_id text UNIQUE,stripe_status text NOT NULL DEFAULT 'none',
 paid_plan text NOT NULL DEFAULT 'none' CHECK(paid_plan IN('none','starter','pro','enterprise')),
 paid_pairs integer NOT NULL DEFAULT 0 CHECK(paid_pairs BETWEEN 0 AND 499),
 period_end timestamptz,cancel_at_period_end boolean NOT NULL DEFAULT false,
 override_plan text CHECK(override_plan IN('blocked','starter','pro','enterprise')),
 override_extra_pairs integer NOT NULL DEFAULT 0 CHECK(override_extra_pairs BETWEEN 0 AND 499),
 feature_overrides jsonb NOT NULL DEFAULT '{}',override_expires_at timestamptz,override_reason text NOT NULL DEFAULT '',
 override_version integer NOT NULL DEFAULT 0,settings jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 checkout_session_id text,checkout_expires_at timestamptz
);
CREATE TABLE IF NOT EXISTS retail_registered_tills(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,inventory_id uuid NOT NULL REFERENCES retail_stores(inventory_id) ON DELETE CASCADE,
 name text NOT NULL,slot integer NOT NULL CHECK(slot>0),active boolean NOT NULL DEFAULT true,
 device_hash text UNIQUE,pair_hash text UNIQUE,pair_expires_at timestamptz,
 generation integer NOT NULL DEFAULT 1,hardware jsonb NOT NULL DEFAULT '{}',last_seen timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS retail_till_slot ON retail_registered_tills(inventory_id,slot) WHERE active;
ALTER TABLE retail_till_sessions ADD COLUMN IF NOT EXISTS registered_till_id uuid REFERENCES retail_registered_tills(id);
DROP INDEX IF EXISTS retail_one_open_till;
CREATE UNIQUE INDEX IF NOT EXISTS retail_one_legacy_open_till ON retail_till_sessions(workspace_id,inventory_id) WHERE closed_at IS NULL AND registered_till_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS retail_one_registered_open_till ON retail_till_sessions(registered_till_id) WHERE closed_at IS NULL AND registered_till_id IS NOT NULL;
ALTER TABLE retail_sales DROP CONSTRAINT IF EXISTS retail_sales_payment_method_check;
ALTER TABLE retail_sales ADD CONSTRAINT retail_sales_payment_method_check CHECK(payment_method IN('cash','card'));
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS registered_till_id uuid REFERENCES retail_registered_tills(id);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS till_session_id uuid REFERENCES retail_till_sessions(id);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS payment_confirmation text NOT NULL DEFAULT 'cash';
ALTER TABLE retail_returns ADD COLUMN IF NOT EXISTS registered_till_id uuid REFERENCES retail_registered_tills(id);
ALTER TABLE retail_returns ADD COLUMN IF NOT EXISTS approved_by jsonb;
ALTER TABLE retail_returns ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';
CREATE TABLE IF NOT EXISTS retail_staff_assignments(
 staff_id uuid NOT NULL REFERENCES retail_team(id) ON DELETE CASCADE,inventory_id uuid NOT NULL REFERENCES retail_stores(inventory_id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,can_refund boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(staff_id,inventory_id)
);
ALTER TABLE retail_staff_credentials ADD COLUMN IF NOT EXISTS qr_token uuid;
UPDATE retail_staff_credentials SET qr_token=gen_random_uuid() WHERE qr_token IS NULL;
ALTER TABLE retail_staff_credentials ALTER COLUMN qr_token SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS retail_staff_qr_unique ON retail_staff_credentials(qr_token);
CREATE TABLE IF NOT EXISTS retail_pos_sessions(
 token_hash text PRIMARY KEY,till_id uuid NOT NULL REFERENCES retail_registered_tills(id) ON DELETE CASCADE,staff_id uuid NOT NULL REFERENCES retail_team(id) ON DELETE CASCADE,
 credential_version integer NOT NULL,till_generation integer NOT NULL,expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS retail_pos_attempts(
 bucket text PRIMARY KEY,attempts integer NOT NULL,window_at timestamptz NOT NULL,locked_until timestamptz
);
CREATE TABLE IF NOT EXISTS retail_platform_events(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,inventory_id uuid REFERENCES retail_stores(inventory_id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id),kind text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retail_reorder_emails(
 inventory_id uuid NOT NULL REFERENCES retail_stores(inventory_id) ON DELETE CASCADE,report_date date NOT NULL,status text NOT NULL DEFAULT 'pending',
 items jsonb NOT NULL,idempotency_key text NOT NULL,queued_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0,next_attempt timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(inventory_id,report_date)
);
CREATE TABLE IF NOT EXISTS retail_platform_schema(version integer PRIMARY KEY);
-- Preserve the installed Retail experience for seven days during this billing transition.
-- New stores never receive this migration-only grant, and it never changes Stripe.
INSERT INTO retail_stores(inventory_id,workspace_id,name,customer_number,override_plan,override_expires_at,override_reason)
 SELECT i.id,i.workspace_id,i.name,'S'||replace(i.id::text,'-',''),'pro',now()+interval '7 days','Existing Retail migration: seven-day transition access'
 FROM inventories i JOIN retail_settings r ON r.workspace_id=i.workspace_id AND r.enabled
 WHERE NOT EXISTS(SELECT 1 FROM retail_platform_schema WHERE version=6)
 ON CONFLICT(inventory_id) DO NOTHING;
INSERT INTO retail_staff_assignments(staff_id,inventory_id,workspace_id)
 SELECT st.id,st.inventory_id,st.workspace_id FROM retail_team st JOIN retail_stores s ON s.inventory_id=st.inventory_id
 ON CONFLICT DO NOTHING;
INSERT INTO retail_platform_schema(version) VALUES(6) ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS retail_pos_sessions_till ON retail_pos_sessions(till_id,staff_id);
CREATE INDEX IF NOT EXISTS retail_platform_events_store ON retail_platform_events(inventory_id,created_at);
