-- Adoptable baseline for the existing auth database.
CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'customer',phone TEXT,status TEXT NOT NULL DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS roles (id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,description TEXT);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS permissions (id UUID PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL);

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS user_roles (user_id UUID NOT NULL,role_id UUID NOT NULL,PRIMARY KEY(user_id,role_id));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS role_permissions (role_id UUID NOT NULL,permission_id UUID NOT NULL,PRIMARY KEY(role_id,permission_id));

-- statement-breakpoint

CREATE TABLE IF NOT EXISTS refresh_sessions(id UUID PRIMARY KEY,user_id UUID NOT NULL,family_id UUID NOT NULL,token_hash TEXT UNIQUE NOT NULL,client_type TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,revoked_at TIMESTAMPTZ,replaced_by UUID,ip_address TEXT,user_agent TEXT,created_at TIMESTAMPTZ DEFAULT now());

-- statement-breakpoint

CREATE INDEX IF NOT EXISTS refresh_sessions_family_idx ON refresh_sessions(family_id);
