BEGIN;
CREATE TABLE IF NOT EXISTS workspace_order_delivery_events (
  order_id UUID NOT NULL REFERENCES workspace_orders(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  request_id UUID NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  carrier TEXT NOT NULL CHECK (carrier IN ('royal-mail','evri','dpd','inpost','other')),
  tracking_number TEXT NOT NULL CHECK (length(tracking_number) BETWEEN 6 AND 60),
  status TEXT NOT NULL CHECK (status IN ('ready','dispatched','in_transit','delivered','exception','returned')),
  delivery_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status <> 'delivered' OR delivery_confirmed),
  PRIMARY KEY (order_id, version),
  UNIQUE (order_id, request_id)
);
COMMIT;
