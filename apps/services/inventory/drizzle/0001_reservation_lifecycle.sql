ALTER TABLE inventory_reservations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_reason TEXT;

-- statement-breakpoint

ALTER TABLE inventory_reservations
  DROP CONSTRAINT IF EXISTS inventory_reservations_order_id_variant_id_key;

-- statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_order_warehouse_variant_uidx
  ON inventory_reservations(order_id, warehouse_id, variant_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS inventory_reservations_expiry_idx
  ON inventory_reservations(expires_at)
  WHERE status = 'reserved' AND expires_at IS NOT NULL;
