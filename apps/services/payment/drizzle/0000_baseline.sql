-- Adoptable baseline for the existing payment database.
DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','approved','partially_refunded','refunded','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS payments(id UUID PRIMARY KEY,order_id UUID UNIQUE NOT NULL,status payment_status NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK(refunded_amount>=0),provider TEXT NOT NULL,payment_key TEXT,approved_at TIMESTAMPTZ);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS payment_transactions(id UUID PRIMARY KEY,payment_id UUID NOT NULL,order_id UUID NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),reason TEXT,created_at TIMESTAMPTZ DEFAULT now());
