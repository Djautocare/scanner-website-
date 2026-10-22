-- Additive reporting and supplier estimates. Historic purchase costs stay intact.
ALTER TABLE retail_counts ADD COLUMN IF NOT EXISTS unit_cost_pence integer;
ALTER TABLE retail_counts ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE retail_counts ADD COLUMN IF NOT EXISTS first_count jsonb;
ALTER TABLE retail_counts ADD COLUMN IF NOT EXISTS approval jsonb;
ALTER TABLE retail_staff_assignments ADD COLUMN IF NOT EXISTS can_manage boolean NOT NULL DEFAULT false;
ALTER TABLE retail_waste ADD COLUMN IF NOT EXISTS staff_snapshot jsonb;
ALTER TABLE retail_waste ADD COLUMN IF NOT EXISTS approved_by jsonb;
ALTER TABLE retail_waste ADD COLUMN IF NOT EXISTS registered_till_id uuid REFERENCES retail_registered_tills(id);
ALTER TABLE retail_tasks ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS retail_task_source ON retail_tasks(workspace_id,inventory_id,source_key) WHERE source_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS retail_order_settings(
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 recount_units integer NOT NULL DEFAULT 10 CHECK(recount_units BETWEEN 1 AND 1000000),
 recount_value_pence integer NOT NULL DEFAULT 2500 CHECK(recount_value_pence BETWEEN 1 AND 100000000),
 PRIMARY KEY(workspace_id,inventory_id)
);
CREATE TABLE IF NOT EXISTS retail_supplier_products(
 product_id uuid PRIMARY KEY REFERENCES retail_products(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 url text NOT NULL DEFAULT '',sku text NOT NULL DEFAULT '',variant_id text NOT NULL DEFAULT '',
 pack_units integer NOT NULL DEFAULT 1 CHECK(pack_units BETWEEN 1 AND 1000000),
 minimum_order_pence integer NOT NULL DEFAULT 0 CHECK(minimum_order_pence BETWEEN 0 AND 100000000),
 monitoring boolean NOT NULL DEFAULT false,confirmed boolean NOT NULL DEFAULT false,
 supplier_vat_rate integer NOT NULL DEFAULT 0 CHECK(supplier_vat_rate IN(0,5,20)),
 price_includes_vat boolean NOT NULL DEFAULT true,cost_excludes_vat boolean NOT NULL DEFAULT false,
 pack_price_pence integer CHECK(pack_price_pence BETWEEN 1 AND 100000000),
 estimated_unit_cost_pence integer CHECK(estimated_unit_cost_pence BETWEEN 0 AND 100000000),
 checked_at timestamptz,next_check_at timestamptz,lease_until timestamptz,
 status text NOT NULL DEFAULT 'Not checked',version integer NOT NULL DEFAULT 0,
 FOREIGN KEY(workspace_id,inventory_id,product_id) REFERENCES retail_products(workspace_id,inventory_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS retail_price_reviews(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES retail_products(id) ON DELETE CASCADE,
 baseline_cost_pence integer NOT NULL,latest_cost_pence integer NOT NULL,old_sale_pence integer NOT NULL,
 supplier_url text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','kept','superseded')),
 version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,actor_id uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS retail_one_price_review ON retail_price_reviews(product_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS retail_supplier_checks ON retail_supplier_products(next_check_at) WHERE monitoring AND confirmed;
CREATE INDEX IF NOT EXISTS retail_count_dates ON retail_counts(workspace_id,inventory_id,completed_at);
CREATE INDEX IF NOT EXISTS retail_waste_dates ON retail_waste(workspace_id,inventory_id,created_at);
CREATE INDEX IF NOT EXISTS retail_audit_dates ON retail_audit(workspace_id,inventory_id,created_at);

-- v10: waste baskets share drawer locking, never the sales or cash ledger.
ALTER TABLE retail_drawer_assignments DROP CONSTRAINT IF EXISTS retail_drawer_assignments_transaction_kind_check;
ALTER TABLE retail_drawer_assignments ADD CONSTRAINT retail_drawer_assignments_transaction_kind_check CHECK(transaction_kind IN('sale','refund','waste'));
CREATE TABLE IF NOT EXISTS retail_waste_batches(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 inventory_id uuid NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
 registered_till_id uuid REFERENCES retail_registered_tills(id),receipt jsonb NOT NULL,
 actor_id uuid REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE retail_waste ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES retail_waste_batches(id);
CREATE INDEX IF NOT EXISTS retail_waste_batch_store ON retail_waste_batches(workspace_id,inventory_id,created_at);
