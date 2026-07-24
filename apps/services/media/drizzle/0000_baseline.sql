-- Adoptable baseline for the existing media database.
CREATE TABLE IF NOT EXISTS media_assets (id UUID PRIMARY KEY,owner_id UUID,content_type TEXT NOT NULL,object_key TEXT NOT NULL,public_url TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now());
