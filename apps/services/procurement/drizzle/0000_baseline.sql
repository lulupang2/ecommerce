-- Adoptable baseline for the existing procurement database.
DO $$ BEGIN CREATE TYPE purchase_order_status AS ENUM ('draft','approved','partially_received','received','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS suppliers(id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,contact_name TEXT,phone TEXT,email TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS supplier_products(id UUID PRIMARY KEY,supplier_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,supplier_sku TEXT,unit_cost INTEGER NOT NULL CHECK(unit_cost>=0),lead_time_days INTEGER NOT NULL DEFAULT 7,UNIQUE(supplier_id,variant_id));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS purchase_orders(id UUID PRIMARY KEY,purchase_order_number TEXT UNIQUE NOT NULL,supplier_id UUID NOT NULL,warehouse_id UUID NOT NULL,status purchase_order_status NOT NULL,total_amount INTEGER NOT NULL CHECK(total_amount>=0),expected_at TIMESTAMPTZ,approved_by UUID,approved_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS purchase_order_items(id UUID PRIMARY KEY,purchase_order_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,sku TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),received_qty INTEGER NOT NULL DEFAULT 0 CHECK(received_qty>=0),unit_cost INTEGER NOT NULL CHECK(unit_cost>=0));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS goods_receipts(id UUID PRIMARY KEY,receipt_number TEXT UNIQUE NOT NULL,purchase_order_id UUID NOT NULL,warehouse_id UUID NOT NULL,received_by UUID,received_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS goods_receipt_items(id UUID PRIMARY KEY,goods_receipt_id UUID NOT NULL,purchase_order_item_id UUID NOT NULL,variant_id UUID NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),condition TEXT NOT NULL DEFAULT 'good');
