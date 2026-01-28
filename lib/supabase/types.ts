/**
 * Database types for Supabase
 * This file should be auto-generated using `supabase gen types typescript`
 * For now, we define the expected schema manually
 */

export interface Database {
  public: {
    Tables: {
      sheets: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          created_at: string;
          updated_at: string;
          data: SheetData;
          settings: SheetSettings;
        };
        Insert: Omit<Database['public']['Tables']['sheets']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['sheets']['Insert']>;
      };
      tabs: {
        Row: {
          id: string;
          sheet_id: string;
          name: string;
          index: number;
          created_at: string;
          data: TabData;
        };
        Insert: Omit<Database['public']['Tables']['tabs']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['tabs']['Insert']>;
      };
      cell_blocks: {
        Row: {
          id: string;
          tab_id: string;
          start_row: number;
          start_col: number;
          end_row: number;
          end_col: number;
          data: CellBlockData;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['cell_blocks']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['cell_blocks']['Insert']>;
      };
      change_log: {
        Row: {
          id: string;
          sheet_id: string;
          tab_id: string;
          user_id: string;
          timestamp: string;
          operation: ChangeOperation;
          data: ChangeData;
        };
        Insert: Omit<Database['public']['Tables']['change_log']['Row'], 'id' | 'timestamp'>;
        Update: never; // Change log is append-only
      };
      collaborators: {
        Row: {
          id: string;
          sheet_id: string;
          user_id: string;
          role: 'owner' | 'editor' | 'viewer';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['collaborators']['Row'], 'id' | 'created_at'>;
        Update: Pick<Database['public']['Tables']['collaborators']['Row'], 'role'>;
      };
    };
    Functions: {
      apply_changes: {
        Args: { sheet_id: string; changes: ChangeData[] };
        Returns: { success: boolean; version: number };
      };
    };
  };
}

// Domain types

export interface SheetData {
  version: number;
  tabs: string[]; // Tab IDs in order
}

export interface SheetSettings {
  defaultFont?: string;
  defaultFontSize?: number;
  locale?: string;
  currency?: string;
}

export interface TabData {
  rows: number;
  cols: number;
  frozenRows?: number;
  frozenCols?: number;
  colWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
}

export interface CellBlockData {
  cells: CellData[];
}

export interface CellData {
  row: number;
  col: number;
  value?: string | number | boolean | null;
  formula?: string;
  format?: CellFormat;
}

export interface CellFormat {
  numberFormat?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  fontSize?: number;
  fontColor?: string;
  bgColor?: string;
  alignH?: 'left' | 'center' | 'right';
  alignV?: 'top' | 'middle' | 'bottom';
  borders?: BorderConfig;
}

export interface BorderConfig {
  top?: BorderStyle;
  right?: BorderStyle;
  bottom?: BorderStyle;
  left?: BorderStyle;
}

export interface BorderStyle {
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export type ChangeOperation = 
  | 'SET_CELL'
  | 'SET_RANGE'
  | 'INSERT_ROW'
  | 'INSERT_COL'
  | 'DELETE_ROW'
  | 'DELETE_COL'
  | 'FORMAT_RANGE'
  | 'CREATE_TAB'
  | 'DELETE_TAB'
  | 'RENAME_TAB';

export interface ChangeData {
  operation: ChangeOperation;
  tabId?: string;
  range?: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
  values?: (string | number | boolean | null)[][];
  format?: CellFormat;
  tabName?: string;
  index?: number;
}

// Realtime types

export interface RealtimePresence {
  odor_id: string;
  user_name: string;
  user_color: string;
  cursor?: {
    row: number;
    col: number;
  };
  selection?: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
}

export interface RealtimeCellUpdate {
  tab_id: string;
  row: number;
  col: number;
  value: string | number | boolean | null;
  formula?: string;
  user_id: string;
  timestamp: string;
}

