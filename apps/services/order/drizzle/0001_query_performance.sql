CREATE INDEX IF NOT EXISTS orders_user_created_idx
  ON orders(user_id, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS orders_status_created_idx
  ON orders(status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS orders_payment_status_created_idx
  ON orders(payment_status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS orders_fulfillment_status_created_idx
  ON orders(fulfillment_status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON order_items(order_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS order_items_product_order_idx
  ON order_items(product_id, order_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS order_addresses_order_type_idx
  ON order_addresses(order_id, type);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS coupon_redemptions_order_idx
  ON coupon_redemptions(order_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS order_saga_steps_order_started_idx
  ON order_saga_steps(order_id, started_at);
