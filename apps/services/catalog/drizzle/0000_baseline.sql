-- Adoptable baseline for the existing catalog database.
DO $$ BEGIN CREATE TYPE product_status AS ENUM ('draft','published','hidden','archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS brands(id UUID PRIMARY KEY,name TEXT UNIQUE NOT NULL,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'active');

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS categories(id UUID PRIMARY KEY,parent_id UUID,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,display_order INTEGER NOT NULL DEFAULT 0);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS products(id UUID PRIMARY KEY,brand_id UUID,category_id UUID,slug TEXT UNIQUE,name TEXT NOT NULL,brand TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),note TEXT,color TEXT,image TEXT,stock INTEGER NOT NULL DEFAULT 0,status product_status NOT NULL DEFAULT 'published',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS product_variants(id UUID PRIMARY KEY,product_id UUID NOT NULL,sku TEXT UNIQUE NOT NULL,model_number TEXT NOT NULL,barcode TEXT UNIQUE,option_values JSONB NOT NULL DEFAULT '{}',list_price INTEGER NOT NULL CHECK(list_price>=0),sale_price INTEGER NOT NULL CHECK(sale_price>=0),cost_price INTEGER NOT NULL CHECK(cost_price>=0),weight_gram INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS product_images(id UUID PRIMARY KEY,product_id UUID NOT NULL,variant_id UUID,url TEXT NOT NULL,alt TEXT,display_order INTEGER NOT NULL DEFAULT 0,is_primary BOOLEAN NOT NULL DEFAULT false);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS product_specs(id UUID PRIMARY KEY,product_id UUID NOT NULL,spec_key TEXT NOT NULL,spec_value TEXT NOT NULL,display_order INTEGER NOT NULL DEFAULT 0);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS reviews(id UUID PRIMARY KEY,product_id UUID NOT NULL,user_id UUID,user_name TEXT NOT NULL,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS product_questions(id UUID PRIMARY KEY,product_id UUID NOT NULL,user_id UUID NOT NULL,user_name TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'published',created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS product_answers(id UUID PRIMARY KEY,question_id UUID NOT NULL,body TEXT NOT NULL,answered_by UUID,created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS wishlists(owner_id UUID NOT NULL,product_id UUID NOT NULL,created_at TIMESTAMPTZ DEFAULT now(),PRIMARY KEY(owner_id,product_id));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS storefront_sections(id UUID PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,subtitle TEXT,slug TEXT UNIQUE NOT NULL,status TEXT NOT NULL DEFAULT 'published',display_order INTEGER NOT NULL DEFAULT 0,starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,config JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS storefront_section_products(section_id UUID NOT NULL,product_id UUID NOT NULL,display_order INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(section_id,product_id));
