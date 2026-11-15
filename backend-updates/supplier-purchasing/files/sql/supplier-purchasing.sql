BEGIN;

CREATE TABLE IF NOT EXISTS supplier_purchase_order_counters (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  last_number integer NOT NULL CHECK (last_number > 0)
);
CREATE TABLE IF NOT EXISTS supplier_purchase_orders (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL,
  create_request_id uuid NOT NULL,
  create_request_hash text NOT NULL,
  creator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  supplier text NOT NULL CHECK (length(supplier) BETWEEN 1 AND 140),
  supplier_key text NOT NULL,
  supplier_details text NOT NULL DEFAULT '' CHECK (length(supplier_details) <= 400),
  buyer text NOT NULL CHECK (length(buyer) BETWEEN 1 AND 140),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 400),
  total_pence bigint NOT NULL CHECK (total_pence >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','issued','cancelled')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  order_number integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  issued_at timestamptz,
  issued_by uuid REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (workspace_id, create_request_id),
  UNIQUE (workspace_id, order_number),
  UNIQUE (workspace_id, id),
  CHECK ((status = 'issued') = (order_number IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS supplier_purchase_orders_workspace_inventory
  ON supplier_purchase_orders (workspace_id, inventory_id, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_purchase_order_lines (
  purchase_order_id uuid NOT NULL REFERENCES supplier_purchase_orders(id) ON DELETE CASCADE,
  line_no smallint NOT NULL CHECK (line_no > 0),
  reorder_order_id bigint REFERENCES reorder_orders(id) ON DELETE SET NULL,
  original_reorder_id bigint NOT NULL,
  description text NOT NULL,
  barcode text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  total_pence bigint NOT NULL CHECK (total_pence >= 0),
  released boolean NOT NULL DEFAULT false,
  PRIMARY KEY (purchase_order_id, line_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_purchase_order_active_reorder_line
  ON supplier_purchase_order_lines (reorder_order_id) WHERE NOT released;

CREATE TABLE IF NOT EXISTS supplier_purchase_invoices (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  supplier_key text NOT NULL,
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 100),
  reference_key text NOT NULL,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  invoice_date date NOT NULL,
  due_date date NOT NULL CHECK (due_date >= invoice_date),
  amount_pence bigint NOT NULL CHECK (amount_pence > 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (workspace_id,purchase_order_id)
    REFERENCES supplier_purchase_orders(workspace_id,id) ON DELETE CASCADE,
  UNIQUE (workspace_id, supplier_key, reference_key),
  UNIQUE (purchase_order_id, request_id)
);

CREATE TABLE IF NOT EXISTS supplier_purchase_payments (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES supplier_purchase_invoices(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_hash text NOT NULL,
  amount_pence bigint NOT NULL CHECK (amount_pence > 0),
  paid_on date NOT NULL,
  reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 120),
  reference_key text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (invoice_id,request_id),
  UNIQUE (invoice_id,reference_key)
);

COMMIT;
