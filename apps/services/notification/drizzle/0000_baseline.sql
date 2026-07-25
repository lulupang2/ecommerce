-- Adoptable baseline for the existing notification database.
CREATE TABLE IF NOT EXISTS notifications (id UUID PRIMARY KEY,user_id UUID NOT NULL,type TEXT NOT NULL,message TEXT NOT NULL,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ DEFAULT now());
