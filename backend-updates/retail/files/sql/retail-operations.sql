-- Additive Retail counter tools. Never store a PIN or bearer token in clear text.
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS favourite boolean NOT NULL DEFAULT false;
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS minimum_age integer NOT NULL DEFAULT 0 CHECK(minimum_age BETWEEN 0 AND 25);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS cashier_snapshot jsonb;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS age_check jsonb;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS exchange_credit_pence integer NOT NULL DEFAULT 0;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS exchanged_from_id uuid REFERENCES retail_sales(id);
ALTER TABLE retail_sale_items ADD COLUMN IF NOT EXISTS returned_qty integer NOT NULL DEFAULT 0 CHECK(returned_qty>=0 AND returned_qty<=qty);
CREATE TABLE IF NOT EXISTS retail_counter_settings(
 workspace_id uuid REFERENCES workspaces(id),inventory_id uuid REFERENCES inventories(id),
 staff_login_required boolean NOT NULL DEFAULT false,PRIMARY KEY(workspace_id,inventory_id)
);
CREATE TABLE IF NOT EXISTS retail_staff_credentials(
 staff_id uuid PRIMARY KEY REFERENCES retail_team(id),workspace_id uuid REFERENCES workspaces(id),inventory_id uuid REFERENCES inventories(id),
 staff_number text NOT NULL CHECK(staff_number ~ '^[0-9]{1,10}$'),pin_salt text NOT NULL,pin_hash text NOT NULL,version integer NOT NULL DEFAULT 1,
 UNIQUE(workspace_id,inventory_id,staff_number)
);
CREATE TABLE IF NOT EXISTS retail_staff_attempts(
 workspace_id uuid REFERENCES workspaces(id),inventory_id uuid REFERENCES inventories(id),actor_id uuid REFERENCES users(id),
 attempts integer NOT NULL DEFAULT 0,window_at timestamptz NOT NULL,locked_until timestamptz,PRIMARY KEY(workspace_id,inventory_id,actor_id)
);
CREATE TABLE IF NOT EXISTS retail_till_devices(
 workspace_id uuid REFERENCES workspaces(id),inventory_id uuid REFERENCES inventories(id),device_id uuid NOT NULL,
 owner_staff_id uuid REFERENCES retail_team(id),PRIMARY KEY(workspace_id,inventory_id,device_id)
);
CREATE TABLE IF NOT EXISTS retail_staff_sessions(
 token_hash text PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id),inventory_id uuid REFERENCES inventories(id),actor_id uuid REFERENCES users(id),
 device_id uuid NOT NULL,staff_id uuid REFERENCES retail_team(id),credential_version integer NOT NULL,expires_at timestamptz NOT NULL,
 revoked boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retail_staff_device_sessions ON retail_staff_sessions(workspace_id,inventory_id,device_id);
CREATE TABLE IF NOT EXISTS retail_parked_sales(
 id uuid PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id),inventory_id uuid REFERENCES inventories(id),
 label text NOT NULL,items jsonb NOT NULL,status text NOT NULL DEFAULT 'parked' CHECK(status IN('parked','recalled','deleted')),
 actor_id uuid REFERENCES users(id),cashier_name text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retail_returns(
 id uuid PRIMARY KEY,workspace_id uuid REFERENCES workspaces(id),inventory_id uuid REFERENCES inventories(id),sale_id uuid REFERENCES retail_sales(id),
 reference text NOT NULL,reason text NOT NULL,total_pence integer NOT NULL,goods_pence integer NOT NULL,net_pence integer NOT NULL,vat_pence integer NOT NULL,
 tip_pence integer NOT NULL DEFAULT 0,commission_pence integer NOT NULL DEFAULT 0,actor_id uuid REFERENCES users(id),cashier_snapshot jsonb,
 exchange_sale_id uuid REFERENCES retail_sales(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retail_return_items(
 id uuid PRIMARY KEY,return_id uuid REFERENCES retail_returns(id),sale_item_id uuid REFERENCES retail_sale_items(id),product_id uuid REFERENCES retail_products(id),
 name text NOT NULL,qty integer NOT NULL CHECK(qty>0),gross_pence integer NOT NULL,net_pence integer NOT NULL,vat_pence integer NOT NULL,
 restocked boolean NOT NULL,cost_reversed_pence integer NOT NULL
);
CREATE INDEX IF NOT EXISTS retail_parked_scope ON retail_parked_sales(workspace_id,inventory_id,status,created_at);
CREATE INDEX IF NOT EXISTS retail_returns_scope ON retail_returns(workspace_id,inventory_id,created_at);
CREATE INDEX IF NOT EXISTS retail_returns_sale ON retail_returns(sale_id);
CREATE INDEX IF NOT EXISTS retail_return_lines ON retail_return_items(return_id);
