CREATE INDEX IF NOT EXISTS admin_orders_created_status_idx
  ON admin_order_projection(created_at DESC, status);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_orders_payment_created_idx
  ON admin_order_projection(payment_status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_orders_fulfillment_created_idx
  ON admin_order_projection(fulfillment_status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_orders_user_created_idx
  ON admin_order_projection(user_id, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_products_status_created_idx
  ON admin_product_projection(status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_products_brand_created_idx
  ON admin_product_projection(brand, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_products_category_created_idx
  ON admin_product_projection(category, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_inventory_warehouse_updated_idx
  ON admin_inventory_projection(warehouse_id, updated_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_inventory_variant_idx
  ON admin_inventory_projection(variant_id);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_inventory_risk_idx
  ON admin_inventory_projection(available_qty, safety_qty)
  WHERE available_qty <= safety_qty;

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_payments_status_approved_idx
  ON admin_payment_projection(status, approved_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_shipments_status_created_idx
  ON admin_shipment_projection(status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_shipments_warehouse_created_idx
  ON admin_shipment_projection(warehouse_id, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_returns_status_requested_idx
  ON admin_return_projection(status, requested_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_purchase_orders_status_created_idx
  ON admin_purchase_order_projection(status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_purchase_orders_warehouse_created_idx
  ON admin_purchase_order_projection(warehouse_id, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_members_status_created_idx
  ON admin_member_projection(status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_reviews_status_created_idx
  ON admin_review_projection(status, created_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_audit_occurred_idx
  ON admin_audit_logs(occurred_at DESC);

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS admin_dead_letters_status_created_idx
  ON admin_dead_letters(status, created_at DESC);
