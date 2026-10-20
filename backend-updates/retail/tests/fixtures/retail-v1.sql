-- InventoryOS Retail v1. Additive: never changes legacy stock or admin tables.
CREATE TABLE IF NOT EXISTS retail_settings (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 report_time text NOT NULL DEFAULT '17:00' CHECK (report_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 timezone text NOT NULL DEFAULT 'Europe/London',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS retail_products (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 name text NOT NULL, barcode text NOT NULL, price_pence integer NOT NULL CHECK(price_pence BETWEEN 0 AND 100000000),
 cost_pence integer NOT NULL DEFAULT 0 CHECK(cost_pence BETWEEN 0 AND 100000000),
 minimum_qty integer NOT NULL DEFAULT 0 CHECK(minimum_qty BETWEEN 0 AND 1000000),
 target_qty integer NOT NULL DEFAULT 0 CHECK(target_qty BETWEEN minimum_qty AND 1000000),
 stock_qty integer NOT NULL DEFAULT 0 CHECK(stock_qty BETWEEN -1000000 AND 1000000),
 stock_version integer NOT NULL DEFAULT 0, edit_version integer NOT NULL DEFAULT 0,
 supplier text NOT NULL DEFAULT '', supplier_url text NOT NULL DEFAULT '', archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id, inventory_id, barcode), UNIQUE(workspace_id, inventory_id, id)
);
CREATE TABLE IF NOT EXISTS retail_sales (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 reference text NOT NULL, total_pence integer NOT NULL CHECK(total_pence BETWEEN 0 AND 100000000),
 tendered_pence integer NOT NULL CHECK(tendered_pence BETWEEN 0 AND 100000000), change_pence integer NOT NULL CHECK(change_pence >= 0),
 payment_method text NOT NULL CHECK(payment_method='cash'), status text NOT NULL DEFAULT 'completed' CHECK(status IN('completed','refunded')),
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), refunded_at timestamptz,
 refund_reason text, refund_restocked boolean, refund_actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(workspace_id,inventory_id,id), CHECK(tendered_pence-change_pence=total_pence)
);
CREATE TABLE IF NOT EXISTS retail_sale_items (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, sale_id uuid NOT NULL, product_id uuid NOT NULL,
 name text NOT NULL, barcode text NOT NULL, qty integer NOT NULL CHECK(qty BETWEEN 1 AND 1000000),
 unit_price_pence integer NOT NULL CHECK(unit_price_pence >= 0), unit_cost_pence integer NOT NULL CHECK(unit_cost_pence >= 0),
 FOREIGN KEY(workspace_id,inventory_id,sale_id) REFERENCES retail_sales(workspace_id,inventory_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS retail_stock_events (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, product_id uuid NOT NULL,
 delta integer NOT NULL, resulting_qty integer NOT NULL, kind text NOT NULL,
 reference_id uuid, reason text NOT NULL DEFAULT '', actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS retail_counts (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, product_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed')),
 expected_qty integer, counted_qty integer, difference integer, reason text, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS retail_one_pending_count ON retail_counts(workspace_id,inventory_id,product_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS retail_till_sessions (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 opening_pence integer NOT NULL CHECK(opening_pence BETWEEN 0 AND 100000000),
 opened_by uuid REFERENCES users(id) ON DELETE SET NULL, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 UNIQUE(workspace_id,inventory_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS retail_one_open_till ON retail_till_sessions(workspace_id,inventory_id) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS retail_cash_events (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('sale','refund','lift','change_in','adjustment','balance','close')),
 amount_pence integer NOT NULL, expected_pence integer, counted_pence integer, variance_pence integer,
 sale_id uuid, note text NOT NULL DEFAULT '', actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,inventory_id,session_id) REFERENCES retail_till_sessions(workspace_id,inventory_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,inventory_id,sale_id) REFERENCES retail_sales(workspace_id,inventory_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS retail_deliveries (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 supplier text NOT NULL DEFAULT '', reference text NOT NULL DEFAULT '', expected_on date,
 status text NOT NULL DEFAULT 'expected' CHECK(status IN('expected','incoming','partial','received','cancelled')),
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), received_at timestamptz,
 UNIQUE(workspace_id,inventory_id,id)
);
CREATE TABLE IF NOT EXISTS retail_delivery_items (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, inventory_id uuid NOT NULL, delivery_id uuid NOT NULL, product_id uuid NOT NULL,
 ordered_qty integer NOT NULL CHECK(ordered_qty BETWEEN 1 AND 1000000), received_qty integer NOT NULL DEFAULT 0 CHECK(received_qty >= 0 AND received_qty<=ordered_qty),
 unit_cost_pence integer NOT NULL CHECK(unit_cost_pence BETWEEN 0 AND 100000000),
 FOREIGN KEY(workspace_id,inventory_id,delivery_id) REFERENCES retail_deliveries(workspace_id,inventory_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id) ON DELETE CASCADE, UNIQUE(delivery_id,product_id)
);
CREATE TABLE IF NOT EXISTS retail_tasks (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 title text NOT NULL, due_at timestamptz, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed')),
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS retail_reports (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 report_date date NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,inventory_id,report_date)
);
CREATE TABLE IF NOT EXISTS retail_requests (
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, request_id uuid NOT NULL, body_hash text NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,request_id)
);
CREATE TABLE IF NOT EXISTS retail_audit (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, inventory_id uuid REFERENCES inventories(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, kind text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS retail_products_scope ON retail_products(workspace_id,inventory_id,archived);
CREATE INDEX IF NOT EXISTS retail_sales_scope ON retail_sales(workspace_id,inventory_id,created_at);
CREATE INDEX IF NOT EXISTS retail_stock_history ON retail_stock_events(workspace_id,inventory_id,product_id,created_at);
CREATE INDEX IF NOT EXISTS retail_cash_scope ON retail_cash_events(workspace_id,inventory_id,session_id);
CREATE INDEX IF NOT EXISTS retail_delivery_scope ON retail_deliveries(workspace_id,inventory_id,status);
CREATE INDEX IF NOT EXISTS retail_tasks_scope ON retail_tasks(workspace_id,inventory_id,status,due_at);
