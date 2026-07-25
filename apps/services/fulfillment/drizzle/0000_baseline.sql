-- Adoptable baseline for the existing fulfillment database.
DO $$ BEGIN CREATE TYPE shipment_status AS ENUM ('ready','packed','shipped','delivered','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

DO $$ BEGIN CREATE TYPE return_status AS ENUM ('requested','approved','received','refunded','rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS shipments(id UUID PRIMARY KEY,order_id UUID NOT NULL UNIQUE,shipment_number TEXT UNIQUE NOT NULL,warehouse_id UUID NOT NULL,carrier TEXT NOT NULL,tracking_number TEXT UNIQUE,status shipment_status NOT NULL,recipient TEXT,shipped_at TIMESTAMPTZ,delivered_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS shipment_items(id UUID PRIMARY KEY,shipment_id UUID NOT NULL,order_item_id UUID NOT NULL,variant_id UUID,sku TEXT,quantity INTEGER NOT NULL CHECK(quantity>0));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS tracking_events(id UUID PRIMARY KEY,shipment_id UUID NOT NULL,status TEXT NOT NULL,location TEXT,message TEXT NOT NULL,occurred_at TIMESTAMPTZ NOT NULL);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS returns(id UUID PRIMARY KEY,order_id UUID NOT NULL,return_number TEXT UNIQUE NOT NULL,status return_status NOT NULL,reason TEXT NOT NULL,refund_amount INTEGER NOT NULL DEFAULT 0,requested_at TIMESTAMPTZ DEFAULT now(),completed_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS return_items(id UUID PRIMARY KEY,return_id UUID NOT NULL,order_item_id UUID NOT NULL,variant_id UUID,sku TEXT,quantity INTEGER NOT NULL CHECK(quantity>0),condition TEXT);
