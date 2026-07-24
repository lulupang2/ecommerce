-- Adoptable baseline for the existing inventory database.
CREATE TABLE IF NOT EXISTS stock(product_id UUID PRIMARY KEY,available_qty INTEGER NOT NULL DEFAULT 0 CHECK(available_qty>=0),version INTEGER NOT NULL DEFAULT 0);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS warehouses(id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,address TEXT,active BOOLEAN NOT NULL DEFAULT true);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS warehouse_bins(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,UNIQUE(warehouse_id,code));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS inventory_balances(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,available_qty INTEGER NOT NULL DEFAULT 0 CHECK(available_qty>=0),reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK(reserved_qty>=0),damaged_qty INTEGER NOT NULL DEFAULT 0 CHECK(damaged_qty>=0),incoming_qty INTEGER NOT NULL DEFAULT 0 CHECK(incoming_qty>=0),version INTEGER NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT now(),UNIQUE(warehouse_id,variant_id));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS inventory_movements(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,product_id UUID,variant_id UUID NOT NULL,type TEXT NOT NULL,quantity INTEGER NOT NULL,reason TEXT,reference_type TEXT,reference_id UUID,actor_id UUID,created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS inventory_reservations(id UUID PRIMARY KEY,order_id UUID NOT NULL,warehouse_id UUID NOT NULL,variant_id UUID NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),status TEXT NOT NULL,expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(order_id,variant_id));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS serial_numbers(id UUID PRIMARY KEY,variant_id UUID NOT NULL,warehouse_id UUID NOT NULL,serial_number TEXT UNIQUE NOT NULL,status TEXT NOT NULL,order_id UUID,received_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS stock_alert_rules(id UUID PRIMARY KEY,warehouse_id UUID NOT NULL,variant_id UUID NOT NULL,safety_qty INTEGER NOT NULL DEFAULT 5,reorder_qty INTEGER NOT NULL DEFAULT 20,UNIQUE(warehouse_id,variant_id));
