-- Adoptable baseline for the existing admin-query database.
CREATE TABLE IF NOT EXISTS processed_events(event_id UUID PRIMARY KEY,event_type TEXT NOT NULL,processed_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_product_projection(product_id UUID PRIMARY KEY,variant_id UUID,sku TEXT,model_number TEXT,name TEXT NOT NULL,brand TEXT,category TEXT,price INTEGER NOT NULL DEFAULT 0,cost_price INTEGER NOT NULL DEFAULT 0,status TEXT,image TEXT,display_stock INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_order_projection(order_id UUID PRIMARY KEY,order_number TEXT UNIQUE,user_id UUID,status TEXT,payment_status TEXT,fulfillment_status TEXT,total_amount INTEGER NOT NULL DEFAULT 0,discount_amount INTEGER NOT NULL DEFAULT 0,recipient TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_order_item_projection(id UUID PRIMARY KEY,order_id UUID NOT NULL,product_id UUID,variant_id UUID,sku TEXT,name TEXT,brand TEXT,unit_price INTEGER NOT NULL DEFAULT 0,quantity INTEGER NOT NULL DEFAULT 0);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_inventory_projection(balance_id UUID PRIMARY KEY,warehouse_id UUID,warehouse_code TEXT,warehouse_name TEXT,product_id UUID,variant_id UUID,available_qty INTEGER NOT NULL DEFAULT 0,reserved_qty INTEGER NOT NULL DEFAULT 0,damaged_qty INTEGER NOT NULL DEFAULT 0,incoming_qty INTEGER NOT NULL DEFAULT 0,safety_qty INTEGER NOT NULL DEFAULT 5,reorder_qty INTEGER NOT NULL DEFAULT 20,updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_payment_projection(payment_id UUID PRIMARY KEY,order_id UUID UNIQUE,status TEXT,amount INTEGER NOT NULL DEFAULT 0,refunded_amount INTEGER NOT NULL DEFAULT 0,provider TEXT,approved_at TIMESTAMPTZ);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_shipment_projection(shipment_id UUID PRIMARY KEY,order_id UUID UNIQUE,shipment_number TEXT,warehouse_id UUID,carrier TEXT,tracking_number TEXT,status TEXT,recipient TEXT,shipped_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_return_projection(return_id UUID PRIMARY KEY,order_id UUID,return_number TEXT,status TEXT,reason TEXT,refund_amount INTEGER NOT NULL DEFAULT 0,requested_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_purchase_order_projection(purchase_order_id UUID PRIMARY KEY,purchase_order_number TEXT,supplier_id UUID,supplier_name TEXT,warehouse_id UUID,status TEXT,total_amount INTEGER NOT NULL DEFAULT 0,item_count INTEGER NOT NULL DEFAULT 0,outstanding_qty INTEGER NOT NULL DEFAULT 0,expected_at TIMESTAMPTZ,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_member_projection(user_id UUID PRIMARY KEY,email TEXT,name TEXT,role TEXT,admin_role TEXT,status TEXT,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_review_projection(review_id UUID PRIMARY KEY,product_id UUID,user_name TEXT,rating INTEGER,body TEXT,status TEXT,created_at TIMESTAMPTZ);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_audit_logs(id UUID PRIMARY KEY,actor_id UUID,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,reason TEXT,metadata JSONB NOT NULL DEFAULT '{}',occurred_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS admin_dead_letters(id UUID PRIMARY KEY,service TEXT NOT NULL,event_id UUID NOT NULL,event_type TEXT NOT NULL,envelope JSONB NOT NULL,error TEXT NOT NULL,retry_count INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved_at TIMESTAMPTZ,resolved_by UUID);
