'use client';

import { useEffect, useState, useCallback } from 'react';

// WASM engine interface (will be loaded dynamically)
interface SheetEngine {
  set_cell(row: number, col: number, value: string): unknown;
  get_cell(row: number, col: number): { value: string; formula?: string; format?: any } | null;
  get_viewport_cells(): Array<{ row: number; col: number; value: string; formula?: string; format?: any }>;
  set_viewport(startRow: number, startCol: number, visibleRows: number, visibleCols: number): void;
  apply_patch(patch: unknown): unknown;
  apply_format?(startRow: number, startCol: number, endRow: number, endCol: number, format: any): void;
  get_col_width?(col: number): number;
  set_col_width?(col: number, width: number): void;
  get_row_height?(row: number): number;
  set_row_height?(row: number, height: number): void;
  export_json(): string;
  import_json(json: string): void;
  render(): void;
}

interface UseSheetEngineResult {
  engine: SheetEngine | null;
  isLoading: boolean;
  error: string | null;
  applyPatch: (patch: unknown) => Promise<unknown>;
}

// Singleton for the WASM module
let wasmModule: unknown = null;
let wasmLoadPromise: Promise<unknown> | null = null;

async function loadWasmModule(): Promise<unknown> {
  if (wasmModule) return wasmModule;
  
  if (wasmLoadPromise) return wasmLoadPromise;
  
  wasmLoadPromise = (async () => {
    try {
      // Dynamic import of the WASM module
      const wasm = await import('@/lib/wasm/ramp_sheets_engine');
      await wasm.default();
      wasmModule = wasm;
      return wasm;
    } catch (error) {
      console.warn('WASM module not available, using fallback:', error);
      return null;
    }
  })();
  
  return wasmLoadPromise;
}

// Fallback JavaScript implementation when WASM is not available
class FallbackEngine implements SheetEngine {
  private cells: Map<string, { value: string; formula?: string }> = new Map();
  private viewportStart = { row: 0, col: 0 };
  private viewportSize = { rows: 50, cols: 20 };

  private key(row: number, col: number): string {
    return `${row},${col}`;
  }

  set_cell(row: number, col: number, value: string): unknown {
    const key = this.key(row, col);
    
    if (!value) {
      this.cells.delete(key);
      return { success: true };
    }

    // Simple formula evaluation
    let evaluatedValue = value;
    let formula: string | undefined;
    
    if (value.startsWith('=')) {
      formula = value;
      evaluatedValue = this.evaluateFormula(value);
    }

    this.cells.set(key, { value: evaluatedValue, formula });
    return { success: true, value: evaluatedValue };
  }

  private evaluateFormula(formula: string): string {
    const content = formula.substring(1).trim().toUpperCase();
    
    // Simple SUM
    const sumMatch = content.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
    if (sumMatch) {
      const [, startColLetter, startRowStr, endColLetter, endRowStr] = sumMatch;
      const startCol = this.letterToCol(startColLetter);
      const startRow = parseInt(startRowStr) - 1;
      const endCol = this.letterToCol(endColLetter);
      const endRow = parseInt(endRowStr) - 1;
      
      let sum = 0;
      for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
          const cell = this.cells.get(this.key(row, col));
          if (cell) {
            const num = parseFloat(cell.value);
            if (!isNaN(num)) sum += num;
          }
        }
      }
      return String(sum);
    }

    // Cell reference
    const refMatch = content.match(/^([A-Z]+)(\d+)$/);
    if (refMatch) {
      const [, colLetter, rowStr] = refMatch;
      const col = this.letterToCol(colLetter);
      const row = parseInt(rowStr) - 1;
      const cell = this.cells.get(this.key(row, col));
      return cell?.value || '0';
    }

    // Simple arithmetic
    try {
      // WARNING: eval is dangerous - this is just for demo
      // In production, use a proper expression parser
      const result = eval(content.replace(/[A-Z]+\d+/g, (match) => {
        const col = this.letterToCol(match.replace(/\d+/g, ''));
        const row = parseInt(match.replace(/[A-Z]+/g, '')) - 1;
        const cell = this.cells.get(this.key(row, col));
        return cell?.value || '0';
      }));
      return String(result);
    } catch {
      return '#ERROR!';
    }
  }

  private letterToCol(letter: string): number {
    let col = 0;
    for (let i = 0; i < letter.length; i++) {
      col = col * 26 + (letter.charCodeAt(i) - 64);
    }
    return col - 1;
  }

  get_cell(row: number, col: number): { value: string; formula?: string; format?: any } | null {
    const cell = this.cells.get(this.key(row, col));
    if (!cell) return null;
    return {
      value: cell.value,
      formula: cell.formula,
      format: (cell as any).format
    };
  }

  get_viewport_cells(): Array<{ row: number; col: number; value: string; formula?: string; format?: any }> {
    const result: Array<{ row: number; col: number; value: string; formula?: string; format?: any }> = [];
    
    for (const [key, cell] of this.cells) {
      const [rowStr, colStr] = key.split(',');
      const row = parseInt(rowStr);
      const col = parseInt(colStr);
      
      if (row >= this.viewportStart.row && 
          row < this.viewportStart.row + this.viewportSize.rows &&
          col >= this.viewportStart.col && 
          col < this.viewportStart.col + this.viewportSize.cols) {
        result.push({ row, col, value: cell.value, formula: cell.formula, format: (cell as any).format });
      }
    }
    
    return result;
  }

  apply_format(startRow: number, startCol: number, endRow: number, endCol: number, format: any): void {
    console.log('FallbackEngine.apply_format called:', { startRow, startCol, endRow, endCol, format });
    // Fallback implementation - store format in cells
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const key = this.key(row, col);
        const cell = this.cells.get(key);
        if (cell) {
          // Merge format with existing format
          const existingFormat = (cell as any).format || {};
          this.cells.set(key, { 
            ...cell, 
            format: { ...existingFormat, ...format }
          });
          console.log(`Applied format to cell ${row},${col}:`, this.cells.get(key));
        } else {
          // Create empty cell with format
          this.cells.set(key, { value: '', format });
          console.log(`Created cell ${row},${col} with format:`, this.cells.get(key));
        }
      }
    }
  }

  set_viewport(startRow: number, startCol: number, visibleRows: number, visibleCols: number): void {
    this.viewportStart = { row: startRow, col: startCol };
    this.viewportSize = { rows: visibleRows, cols: visibleCols };
  }

  apply_patch(patch: unknown): unknown {
    const p = patch as { type: string; payload: { updates?: Array<{ row: number; col: number; value?: string; formula?: string }> } };
    
    if (p.type === 'UPDATE_CELLS' && p.payload.updates) {
      for (const update of p.payload.updates) {
        const value = update.formula || (update.value !== undefined ? String(update.value) : '');
        this.set_cell(update.row, update.col, value);
      }
    }
    
    return { success: true };
  }

  export_json(): string {
    const data: Record<string, { value: string; formula?: string }> = {};
    for (const [key, cell] of this.cells) {
      data[key] = cell;
    }
    return JSON.stringify(data);
  }

  import_json(json: string): void {
    const data = JSON.parse(json) as Record<string, { value: string; formula?: string }>;
    this.cells.clear();
    for (const [key, cell] of Object.entries(data)) {
      this.cells.set(key, cell);
    }
  }

  render(): void {
    // No-op for fallback - rendering is done by React
  }

  get_col_width(col: number): number {
    return DEFAULT_COL_WIDTH;
  }

  set_col_width(col: number, width: number): void {
    // Store in a map for fallback engine
    if (!(this as any).colWidths) {
      (this as any).colWidths = new Map<number, number>();
    }
    (this as any).colWidths.set(col, width);
  }

  get_row_height(row: number): number {
    return DEFAULT_ROW_HEIGHT;
  }

  set_row_height(row: number, height: number): void {
    // Store in a map for fallback engine
    if (!(this as any).rowHeights) {
      (this as any).rowHeights = new Map<number, number>();
    }
    (this as any).rowHeights.set(row, height);
  }
}

export function useSheetEngine(sheetId: string, tabId: string): UseSheetEngineResult {
  const [engine, setEngine] = useState<SheetEngine | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initEngine() {
      try {
        const wasm = await loadWasmModule();
        
        if (!mounted) return;

        if (wasm && typeof (wasm as { SheetEngine?: new (rows: number, cols: number) => SheetEngine }).SheetEngine === 'function') {
          // Use WASM engine
          const WasmSheetEngine = (wasm as { SheetEngine: new (rows: number, cols: number) => SheetEngine }).SheetEngine;
          const engineInstance = new WasmSheetEngine(1000000, 1000);
          setEngine(engineInstance);
        } else {
          // Use fallback
          console.info('Using JavaScript fallback engine');
          setEngine(new FallbackEngine());
        }
        
        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to initialize engine:', err);
        // Fallback to JS implementation
        setEngine(new FallbackEngine());
        setIsLoading(false);
      }
    }

    initEngine();

    return () => {
      mounted = false;
    };
  }, [sheetId, tabId]);

  const applyPatch = useCallback(async (patch: unknown): Promise<unknown> => {
    if (!engine) {
      throw new Error('Engine not initialized');
    }
    return engine.apply_patch(patch);
  }, [engine]);

  return { engine, isLoading, error, applyPatch };
}

