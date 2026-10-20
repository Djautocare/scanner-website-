-- Optional tools are configured per Retail inventory. Existing installations start unchanged.
CREATE TABLE IF NOT EXISTS retail_business_settings (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 business_type text NOT NULL DEFAULT 'general', features jsonb NOT NULL DEFAULT '{}',
 loyalty_target integer NOT NULL DEFAULT 9 CHECK(loyalty_target BETWEEN 1 AND 100), loyalty_minimum_pence integer NOT NULL DEFAULT 100 CHECK(loyalty_minimum_pence BETWEEN 0 AND 100000000),
 loyalty_reward_product_id uuid, reminder_hours integer NOT NULL DEFAULT 24 CHECK(reminder_hours BETWEEN 1 AND 72),
 version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,inventory_id)
);
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'product' CHECK(item_kind IN('product','service'));
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30 CHECK(duration_minutes BETWEEN 1 AND 1440);
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS pack_size integer NOT NULL DEFAULT 1 CHECK(pack_size BETWEEN 1 AND 1000000);
ALTER TABLE retail_products ADD COLUMN IF NOT EXISTS manufacturing_recipe_id uuid;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS goods_total_pence integer;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS tip_pence integer NOT NULL DEFAULT 0 CHECK(tip_pence>=0);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS discount_pence integer NOT NULL DEFAULT 0 CHECK(discount_pence>=0);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS deposit_applied_pence integer NOT NULL DEFAULT 0 CHECK(deposit_applied_pence>=0);
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS cash_tendered_pence integer;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS staff_snapshot jsonb;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS customer_id uuid;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS booking_id uuid;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS preorder_id uuid;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS loyalty_snapshot jsonb;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS promotion_snapshot jsonb;
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS deposit_vat_pence integer NOT NULL DEFAULT 0;
ALTER TABLE retail_sale_items ADD COLUMN IF NOT EXISTS line_total_pence integer;
ALTER TABLE retail_sale_items ADD COLUMN IF NOT EXISTS line_discount_pence integer NOT NULL DEFAULT 0;
ALTER TABLE retail_sale_items ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'product';
ALTER TABLE retail_sale_items ADD COLUMN IF NOT EXISTS vat_treatment text;
ALTER TABLE retail_sale_items ADD COLUMN IF NOT EXISTS vat_rate smallint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS retail_team (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 name text NOT NULL, commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000), active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,inventory_id,id)
);
CREATE TABLE IF NOT EXISTS retail_customers (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 name text NOT NULL, email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', card_token uuid NOT NULL UNIQUE,
 stamps integer NOT NULL DEFAULT 0 CHECK(stamps BETWEEN -1000000 AND 1000000), active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,inventory_id,id)
);
CREATE TABLE IF NOT EXISTS retail_bookings (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 product_id uuid NOT NULL, staff_id uuid, customer_id uuid,
 customer_name text NOT NULL, email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 starts_at timestamptz, ends_at timestamptz, duration_minutes integer NOT NULL,
 status text NOT NULL DEFAULT 'booked' CHECK(status IN('booked','waiting','in_progress','completed','cancelled','no_show')),
 email_reminder boolean NOT NULL DEFAULT false, reminder_due_at timestamptz, note text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 0, sale_id uuid, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,inventory_id,id),
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id),
 FOREIGN KEY(workspace_id,inventory_id,staff_id) REFERENCES retail_team(workspace_id,inventory_id,id),
 FOREIGN KEY(workspace_id,inventory_id,customer_id) REFERENCES retail_customers(workspace_id,inventory_id,id)
);
CREATE INDEX IF NOT EXISTS retail_booking_calendar ON retail_bookings(workspace_id,inventory_id,starts_at,status);
CREATE TABLE IF NOT EXISTS retail_offers (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN('percent','multi_buy','meal_deal')), rule jsonb NOT NULL,
 starts_at timestamptz, ends_at timestamptz, active boolean NOT NULL DEFAULT true, priority integer NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retail_reductions (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 product_id uuid NOT NULL, reduced_price_pence integer NOT NULL CHECK(reduced_price_pence>=0), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at),
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id)
);
CREATE TABLE IF NOT EXISTS retail_preorders (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 customer_id uuid, customer_name text NOT NULL, email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', collection_at timestamptz NOT NULL,
 fulfilment text NOT NULL CHECK(fulfilment IN('stock','make')), status text NOT NULL DEFAULT 'ordered' CHECK(status IN('ordered','in_production','ready','collected','cancelled')),
 note text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 0, sale_id uuid, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,inventory_id,id),
 FOREIGN KEY(workspace_id,inventory_id,customer_id) REFERENCES retail_customers(workspace_id,inventory_id,id)
);
CREATE TABLE IF NOT EXISTS retail_preorder_items (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, preorder_id uuid NOT NULL, product_id uuid NOT NULL,
 name text NOT NULL, qty integer NOT NULL CHECK(qty BETWEEN 1 AND 1000000), unit_price_pence integer NOT NULL CHECK(unit_price_pence>=0), recipe_id uuid,
 FOREIGN KEY(workspace_id,inventory_id,preorder_id) REFERENCES retail_preorders(workspace_id,inventory_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id), UNIQUE(preorder_id,product_id)
);
CREATE INDEX IF NOT EXISTS retail_preorder_collection ON retail_preorders(workspace_id,inventory_id,status,collection_at);
CREATE TABLE IF NOT EXISTS retail_deposits (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 origin_type text NOT NULL CHECK(origin_type IN('booking','preorder')), origin_id uuid NOT NULL,
 amount_pence integer NOT NULL CHECK(amount_pence>0), status text NOT NULL DEFAULT 'held' CHECK(status IN('held','applied','refunded')),
 session_id uuid NOT NULL, sale_id uuid, vat_receipt jsonb, receipt_business jsonb,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), refunded_at timestamptz,
 FOREIGN KEY(workspace_id,inventory_id,session_id) REFERENCES retail_till_sessions(workspace_id,inventory_id,id)
);
CREATE INDEX IF NOT EXISTS retail_deposit_origin ON retail_deposits(workspace_id,inventory_id,origin_type,origin_id,status);
ALTER TABLE retail_cash_events DROP CONSTRAINT IF EXISTS retail_cash_events_kind_check;
ALTER TABLE retail_cash_events ADD CONSTRAINT retail_cash_events_kind_check CHECK(kind IN('sale','refund','lift','change_in','adjustment','balance','close','deposit','deposit_refund'));
CREATE TABLE IF NOT EXISTS retail_loyalty_events (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, customer_id uuid NOT NULL, sale_id uuid NOT NULL,
 delta integer NOT NULL, kind text NOT NULL CHECK(kind IN('sale','refund')), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(sale_id,kind),
 FOREIGN KEY(workspace_id,inventory_id,customer_id) REFERENCES retail_customers(workspace_id,inventory_id,id),
 FOREIGN KEY(workspace_id,inventory_id,sale_id) REFERENCES retail_sales(workspace_id,inventory_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS retail_waste (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 product_id uuid NOT NULL, name text NOT NULL, qty integer NOT NULL CHECK(qty>0), unit_cost_pence integer NOT NULL CHECK(unit_cost_pence>=0),
 reason text NOT NULL CHECK(reason IN('expired','damaged','unsold','other')), note text NOT NULL DEFAULT '', actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id)
);
CREATE TABLE IF NOT EXISTS retail_reminders (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, booking_id uuid NOT NULL, booking_version integer NOT NULL,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','sent','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz, lease_until timestamptz, next_attempt_at timestamptz, sent_at timestamptz, error text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id,booking_version),
 FOREIGN KEY(workspace_id,inventory_id,booking_id) REFERENCES retail_bookings(workspace_id,inventory_id,id) ON DELETE CASCADE
);
ALTER TABLE retail_bookings ADD COLUMN IF NOT EXISTS unit_price_pence integer NOT NULL DEFAULT 0;
ALTER TABLE retail_deposits ADD COLUMN IF NOT EXISTS reference text NOT NULL DEFAULT '';

-- Preserve attribution when universal lookup resolves to a non-food database.
ALTER TABLE retail_products DROP CONSTRAINT IF EXISTS retail_products_catalogue_source_check;
ALTER TABLE retail_products ADD CONSTRAINT retail_products_catalogue_source_check CHECK(catalogue_source IN('','openfoodfacts','openbeautyfacts','openproductsfacts','openpetfoodfacts'));
