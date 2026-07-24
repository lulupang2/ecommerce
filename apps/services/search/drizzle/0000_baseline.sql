-- Adoptable baseline for the existing search database.
CREATE TABLE IF NOT EXISTS search_events (id UUID PRIMARY KEY,event_type TEXT NOT NULL,received_at TIMESTAMPTZ DEFAULT now());
