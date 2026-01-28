-- Ramp Sheets Database Schema
-- Initial migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sheets table
CREATE TABLE sheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data JSONB NOT NULL DEFAULT '{"version": 1, "tabs": []}',
    settings JSONB NOT NULL DEFAULT '{}'
);

-- Index for owner lookup
CREATE INDEX idx_sheets_owner ON sheets(owner_id);

-- Tabs table
CREATE TABLE tabs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sheet_id UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data JSONB NOT NULL DEFAULT '{"rows": 1000, "cols": 26}'
);

-- Index for sheet lookup
CREATE INDEX idx_tabs_sheet ON tabs(sheet_id);

-- Cell blocks table (for efficient storage of cell ranges)
CREATE TABLE cell_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tab_id UUID NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    start_row INTEGER NOT NULL,
    start_col INTEGER NOT NULL,
    end_row INTEGER NOT NULL,
    end_col INTEGER NOT NULL,
    data JSONB NOT NULL DEFAULT '{"cells": []}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for range queries
CREATE INDEX idx_cell_blocks_tab ON cell_blocks(tab_id);
CREATE INDEX idx_cell_blocks_range ON cell_blocks(tab_id, start_row, start_col, end_row, end_col);

-- Change log table (for audit trail and CRDT replay)
CREATE TABLE change_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sheet_id UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
    tab_id UUID REFERENCES tabs(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    operation TEXT NOT NULL,
    data JSONB NOT NULL
);

-- Index for replay queries
CREATE INDEX idx_change_log_sheet ON change_log(sheet_id, timestamp);
CREATE INDEX idx_change_log_user ON change_log(user_id, timestamp);

-- Collaborators table
CREATE TABLE collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sheet_id UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sheet_id, user_id)
);

-- Index for access control
CREATE INDEX idx_collaborators_user ON collaborators(user_id);
CREATE INDEX idx_collaborators_sheet ON collaborators(sheet_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER sheets_updated_at
    BEFORE UPDATE ON sheets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER cell_blocks_updated_at
    BEFORE UPDATE ON cell_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Row Level Security (RLS) policies

-- Enable RLS
ALTER TABLE sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;

-- Sheets policies
CREATE POLICY sheets_select ON sheets FOR SELECT USING (
    owner_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid())
);

CREATE POLICY sheets_insert ON sheets FOR INSERT WITH CHECK (
    owner_id = auth.uid()
);

CREATE POLICY sheets_update ON sheets FOR UPDATE USING (
    owner_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
);

CREATE POLICY sheets_delete ON sheets FOR DELETE USING (
    owner_id = auth.uid()
);

-- Tabs policies
CREATE POLICY tabs_select ON tabs FOR SELECT USING (
    EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
        owner_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid())
    ))
);

CREATE POLICY tabs_insert ON tabs FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
        owner_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
    ))
);

CREATE POLICY tabs_update ON tabs FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
        owner_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
    ))
);

CREATE POLICY tabs_delete ON tabs FOR DELETE USING (
    EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
        owner_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
    ))
);

-- Cell blocks policies (similar pattern)
CREATE POLICY cell_blocks_select ON cell_blocks FOR SELECT USING (
    EXISTS (SELECT 1 FROM tabs WHERE id = cell_blocks.tab_id AND
        EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
            owner_id = auth.uid() OR 
            EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid())
        ))
    )
);

CREATE POLICY cell_blocks_insert ON cell_blocks FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM tabs WHERE id = cell_blocks.tab_id AND
        EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
            owner_id = auth.uid() OR 
            EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
        ))
    )
);

CREATE POLICY cell_blocks_update ON cell_blocks FOR UPDATE USING (
    EXISTS (SELECT 1 FROM tabs WHERE id = cell_blocks.tab_id AND
        EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
            owner_id = auth.uid() OR 
            EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
        ))
    )
);

CREATE POLICY cell_blocks_delete ON cell_blocks FOR DELETE USING (
    EXISTS (SELECT 1 FROM tabs WHERE id = cell_blocks.tab_id AND
        EXISTS (SELECT 1 FROM sheets WHERE id = tabs.sheet_id AND (
            owner_id = auth.uid() OR 
            EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
        ))
    )
);

-- Change log policies
CREATE POLICY change_log_select ON change_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM sheets WHERE id = change_log.sheet_id AND (
        owner_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid())
    ))
);

CREATE POLICY change_log_insert ON change_log FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM sheets WHERE id = change_log.sheet_id AND (
        owner_id = auth.uid() OR 
        EXISTS (SELECT 1 FROM collaborators WHERE sheet_id = sheets.id AND user_id = auth.uid() AND role IN ('owner', 'editor'))
    ))
);

-- Collaborators policies
CREATE POLICY collaborators_select ON collaborators FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM sheets WHERE id = collaborators.sheet_id AND owner_id = auth.uid())
);

CREATE POLICY collaborators_insert ON collaborators FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM sheets WHERE id = collaborators.sheet_id AND owner_id = auth.uid())
);

CREATE POLICY collaborators_update ON collaborators FOR UPDATE USING (
    EXISTS (SELECT 1 FROM sheets WHERE id = collaborators.sheet_id AND owner_id = auth.uid())
);

CREATE POLICY collaborators_delete ON collaborators FOR DELETE USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM sheets WHERE id = collaborators.sheet_id AND owner_id = auth.uid())
);

-- Function to apply changes (for batch updates)
CREATE OR REPLACE FUNCTION apply_changes(
    p_sheet_id UUID,
    p_changes JSONB[]
)
RETURNS JSONB AS $$
DECLARE
    v_change JSONB;
    v_count INTEGER := 0;
BEGIN
    FOREACH v_change IN ARRAY p_changes
    LOOP
        -- Insert change log entry
        INSERT INTO change_log (sheet_id, user_id, operation, data)
        VALUES (p_sheet_id, auth.uid(), v_change->>'operation', v_change);
        
        v_count := v_count + 1;
    END LOOP;
    
    -- Update sheet timestamp
    UPDATE sheets SET updated_at = NOW() WHERE id = p_sheet_id;
    
    RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

