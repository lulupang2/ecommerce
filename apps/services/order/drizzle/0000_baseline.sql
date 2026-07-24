-- Adoptable baseline for the existing order database.
DO $$ BEGIN CREATE TYPE order_status AS ENUM ('pending','confirmed','preparing','shipped','delivered','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','approved','partially_refunded','refunded','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

DO $$ BEGIN CREATE TYPE fulfillment_status AS ENUM ('unfulfilled','ready','shipped','delivered','returned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS orders(id UUID PRIMARY KEY,user_id UUID NOT NULL,order_number TEXT UNIQUE NOT NULL,status order_status NOT NULL,payment_status payment_status NOT NULL DEFAULT 'pending',fulfillment_status fulfillment_status NOT NULL DEFAULT 'unfulfilled',subtotal_amount INTEGER NOT NULL DEFAULT 0,discount_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,total_amount INTEGER NOT NULL CHECK(total_amount>=0),recipient TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,memo TEXT,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS order_items(id UUID PRIMARY KEY,order_id UUID NOT NULL REFERENCES orders(id),product_id UUID NOT NULL,variant_id UUID,sku TEXT,name TEXT NOT NULL,brand TEXT NOT NULL,image TEXT,unit_price INTEGER NOT NULL,discount_amount INTEGER NOT NULL DEFAULT 0,tax_amount INTEGER NOT NULL DEFAULT 0,quantity INTEGER NOT NULL CHECK(quantity>0));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS order_addresses(id UUID PRIMARY KEY,order_id UUID NOT NULL,type TEXT NOT NULL,recipient TEXT NOT NULL,phone TEXT NOT NULL,postal_code TEXT,address1 TEXT NOT NULL,address2 TEXT);

-- statement-breakpoint

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee INTEGER NOT NULL DEFAULT 0;

-- statement-breakpoint

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- statement-breakpoint

ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_order BOOLEAN NOT NULL DEFAULT false;

-- statement-breakpoint

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS coupons(id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,type TEXT NOT NULL,value INTEGER NOT NULL,min_order_amount INTEGER NOT NULL DEFAULT 0,max_discount_amount INTEGER,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,status TEXT NOT NULL DEFAULT 'active',usage_limit INTEGER,per_customer_limit INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS coupon_redemptions(id UUID PRIMARY KEY,coupon_id UUID NOT NULL,order_id UUID NOT NULL,owner_id UUID NOT NULL,discount_amount INTEGER NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(coupon_id,owner_id));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS order_saga_steps(id UUID PRIMARY KEY,order_id UUID NOT NULL,step TEXT NOT NULL,status TEXT NOT NULL,event_id UUID,error_code TEXT,error_message TEXT,compensation_status TEXT,metadata JSONB NOT NULL DEFAULT '{}',started_at TIMESTAMPTZ NOT NULL DEFAULT now(),completed_at TIMESTAMPTZ);
