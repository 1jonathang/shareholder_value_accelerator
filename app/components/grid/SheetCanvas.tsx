'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSheetEngine } from './useSheetEngine';
import { CellEditor } from './CellEditor';
import { SelectionOverlay } from './SelectionOverlay';

interface SheetCanvasProps {
  sheetId: string;
  tabId: string;
  onSelectionChange?: (selection: Selection) => void;
  onCellEdit?: (row: number, col: number, value: string) => void;
  onEngineReady?: (engine: any, triggerRender: () => void) => void;
}

export interface Selection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface EditingState {
  row: number;
  col: number;
  initialValue: string;
}

const HEADER_WIDTH = 50;
const HEADER_HEIGHT = 24;
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 24;

export function SheetCanvas({ 
  sheetId, 
  tabId, 
  onSelectionChange,
  onCellEdit,
  onEngineReady
}: SheetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine, isLoading, error } = useSheetEngine(sheetId, tabId);
  const triggerRenderRef = useRef<(() => void) | null>(null);
  
  const [selection, setSelection] = useState<Selection>({
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 0,
  });
  
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [viewport, setViewport] = useState({
    startRow: 0,
    startCol: 0,
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
  });
  
  // Resize state
  const [resizeState, setResizeState] = useState<{
    type: 'col' | 'row' | null;
    index: number;
    startPos: number;
    startSize: number;
  } | null>(null);
  
  // Column and row sizes (cached from engine)
  const [colSizes, setColSizes] = useState<Map<number, number>>(new Map());
  const [rowSizes, setRowSizes] = useState<Map<number, number>>(new Map());
  
  // Selection drag state
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionStartRef = useRef<{ row: number; col: number } | null>(null);

  // Keep a ref to the latest viewport for click calculations
  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Reset viewport offsets on mount to ensure they start at 0
  useEffect(() => {
    setViewport(v => ({
      ...v,
      offsetX: 0,
      offsetY: 0,
    }));
  }, []);

  // Render the grid
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Always use the latest viewport state
    const currentViewport = viewportRef.current;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const zoom = currentViewport.zoom;
    const headerWidth = HEADER_WIDTH * zoom;
    const headerHeight = HEADER_HEIGHT * zoom;

    // Helper to get column width (from engine or default)
    const getColWidth = (col: number): number => {
      if (engine && (engine as any).get_col_width) {
        const width = (engine as any).get_col_width(col);
        return width * zoom;
      }
      return colSizes.get(col) ? colSizes.get(col)! * zoom : DEFAULT_COL_WIDTH * zoom;
    };

    // Helper to get row height (from engine or default)
    const getRowHeight = (row: number): number => {
      if (engine && (engine as any).get_row_height) {
        const height = (engine as any).get_row_height(row);
        return height * zoom;
      }
      return rowSizes.get(row) ? rowSizes.get(row)! * zoom : DEFAULT_ROW_HEIGHT * zoom;
    };

    // Draw grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    // Vertical lines
    let x = headerWidth - currentViewport.offsetX;
    for (let col = currentViewport.startCol; x < width; col++) {
      const colWidth = getColWidth(col);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      x += colWidth;
    }

    // Horizontal lines
    let y = headerHeight - currentViewport.offsetY;
    for (let row = currentViewport.startRow; y < height; row++) {
      const rowHeight = getRowHeight(row);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      y += rowHeight;
    }

    // Clip to grid area (exclude headers) before drawing cells and selection
    ctx.save();
    ctx.beginPath();
    ctx.rect(headerWidth, headerHeight, width - headerWidth, height - headerHeight);
    ctx.clip();

    // Draw cell contents from engine
    if (engine) {
      const cells = engine.get_viewport_cells();
      if (cells) {
        ctx.fillStyle = '#1e293b';
        ctx.font = `${13 * zoom}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        for (const cell of cells) {
          // Calculate cumulative positions
          let cellX = headerWidth - currentViewport.offsetX;
          for (let c = currentViewport.startCol; c < cell.col; c++) {
            cellX += getColWidth(c);
          }
          
          let cellY = headerHeight - currentViewport.offsetY;
          for (let r = currentViewport.startRow; r < cell.row; r++) {
            cellY += getRowHeight(r);
          }
          
          const cellWidth = getColWidth(cell.col);
          const cellHeight = getRowHeight(cell.row);

          // Apply formatting if present
          const format = (cell as any).format;
          if (format && (cell.row === 0 && cell.col === 0)) {
            console.log('Cell 0,0 format:', format, 'cell:', cell);
          }
          const fontSize = format?.font_size ? format.font_size * zoom : 13 * zoom;
          const fontFamily = format?.font_family || 'Inter, system-ui, sans-serif';
          const fontWeight = format?.font_bold ? 'bold' : 'normal';
          const fontStyle = format?.font_italic ? 'italic' : 'normal';
          const fontColor = format?.font_color || '#1e293b';
          const bgColor = format?.bg_color;
          const textAlign = format?.align_h === 'center' ? 'center' : format?.align_h === 'right' ? 'right' : 'left';
          const underline = format?.font_underline;

          // Draw background color if present
          if (bgColor) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
          }

          // Clip to cell bounds
          ctx.save();
          ctx.beginPath();
          ctx.rect(cellX, cellY, cellWidth, cellHeight);
          ctx.clip();

          // Set font properties
          ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
          ctx.fillStyle = fontColor;
          ctx.textAlign = textAlign;
          ctx.textBaseline = 'middle';

          // Calculate text position based on alignment
          let textX = cellX + 4 * zoom;
          if (textAlign === 'center') {
            textX = cellX + cellWidth / 2;
          } else if (textAlign === 'right') {
            textX = cellX + cellWidth - 4 * zoom;
          }

          ctx.fillText(cell.value, textX, cellY + cellHeight / 2);

          // Draw underline if present
          if (underline) {
            const textMetrics = ctx.measureText(cell.value);
            const underlineY = cellY + cellHeight / 2 + fontSize / 2 - 2;
            ctx.strokeStyle = fontColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (textAlign === 'center') {
              ctx.moveTo(textX - textMetrics.width / 2, underlineY);
              ctx.lineTo(textX + textMetrics.width / 2, underlineY);
            } else if (textAlign === 'right') {
              ctx.moveTo(textX - textMetrics.width, underlineY);
              ctx.lineTo(textX, underlineY);
            } else {
              ctx.moveTo(textX, underlineY);
              ctx.lineTo(textX + textMetrics.width, underlineY);
            }
            ctx.stroke();
          }

          ctx.restore();
        }
      }
    }

    // Draw selection
    if (!editing) {
      // Calculate selection position using actual column/row sizes
      let selX = headerWidth - currentViewport.offsetX;
      for (let c = currentViewport.startCol; c < selection.startCol; c++) {
        selX += getColWidth(c);
      }
      
      let selY = headerHeight - currentViewport.offsetY;
      for (let r = currentViewport.startRow; r < selection.startRow; r++) {
        selY += getRowHeight(r);
      }
      
      let selWidth = 0;
      for (let c = selection.startCol; c <= selection.endCol; c++) {
        selWidth += getColWidth(c);
      }
      
      let selHeight = 0;
      for (let r = selection.startRow; r <= selection.endRow; r++) {
        selHeight += getRowHeight(r);
      }

      // Selection fill
      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.fillRect(selX, selY, selWidth, selHeight);

      // Selection border - scale width with zoom
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = Math.max(1, 2 * zoom);
      ctx.strokeRect(selX, selY, selWidth, selHeight);
    }

    ctx.restore(); // Restore clipping

    // Re-draw headers on top to ensure they're always visible
    // Draw headers background (on top)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillRect(0, 0, headerWidth, height);

    // Corner (on top)
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, headerWidth, headerHeight);

    // Draw column headers (on top)
    ctx.fillStyle = '#64748b';
    ctx.font = `500 ${12 * zoom}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    x = headerWidth - currentViewport.offsetX;
    for (let col = currentViewport.startCol; x < width; col++) {
      const colWidth = getColWidth(col);
      const label = colToLetter(col);
      ctx.fillText(label, x + colWidth / 2, headerHeight / 2);
      x += colWidth;
    }

    // Draw row headers (on top)
    y = headerHeight - currentViewport.offsetY;
    for (let row = currentViewport.startRow; y < height; row++) {
      const rowHeight = getRowHeight(row);
      const label = String(row + 1);
      ctx.fillText(label, headerWidth / 2, y + rowHeight / 2);
      y += rowHeight;
    }
    
    // Draw resize handles and resize line if resizing
    if (resizeState) {
      if (resizeState.type === 'col') {
        // Draw resize line for column
        const resizeX = headerWidth - currentViewport.offsetX;
        let xPos = resizeX;
        for (let c = currentViewport.startCol; c < resizeState.index; c++) {
          xPos += getColWidth(c);
        }
        xPos += getColWidth(resizeState.index);
        
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, height);
        ctx.stroke();
      } else if (resizeState.type === 'row') {
        // Draw resize line for row
        const resizeY = headerHeight - currentViewport.offsetY;
        let yPos = resizeY;
        for (let r = currentViewport.startRow; r < resizeState.index; r++) {
          yPos += getRowHeight(r);
        }
        yPos += getRowHeight(resizeState.index);
        
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, yPos);
        ctx.lineTo(width, yPos);
        ctx.stroke();
      }
    }

    // Draw header borders (on top)
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(width, headerHeight);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(headerWidth, 0);
    ctx.lineTo(headerWidth, height);
    ctx.stroke();
    
    // Draw visual resize handles (subtle indicators at column/row borders)
    // Make them visible so users know where to hover
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    
    // Draw column resize handles (vertical lines at column borders in header)
    let xPos = headerWidth - currentViewport.offsetX;
    for (let col = currentViewport.startCol; xPos < width && col < 1000; col++) {
      const colWidth = getColWidth(col);
      const handleX = xPos + colWidth;
      if (handleX >= headerWidth && handleX <= width) {
        // Draw a subtle line in the header area
        ctx.beginPath();
        ctx.moveTo(handleX, 0);
        ctx.lineTo(handleX, headerHeight);
        ctx.stroke();
      }
      xPos += colWidth;
      if (xPos > width) break;
    }
    
    // Draw row resize handles (horizontal lines at row borders in header)
    let yPos = headerHeight - currentViewport.offsetY;
    for (let row = currentViewport.startRow; yPos < height && row < 1000; row++) {
      const rowHeight = getRowHeight(row);
      const handleY = yPos + rowHeight;
      if (handleY >= headerHeight && handleY <= height) {
        // Draw a subtle line in the header area
        ctx.beginPath();
        ctx.moveTo(0, handleY);
        ctx.lineTo(headerWidth, handleY);
        ctx.stroke();
      }
      yPos += rowHeight;
      if (yPos > height) break;
    }
  }, [engine, viewport, selection, editing, resizeState, colSizes, rowSizes]);
  
  // Expose a method to trigger re-render from parent
  const triggerRender = useCallback(() => {
    render();
  }, [render]);
  
  useEffect(() => {
    triggerRenderRef.current = triggerRender;
  }, [triggerRender]);
  
  // Expose engine and render trigger to parent component
  useEffect(() => {
    if (engine && onEngineReady) {
      console.log('SheetCanvas: Exposing engine to parent', { engine, hasApplyFormat: (engine as any).apply_format });
      onEngineReady(engine, triggerRender);
    }
  }, [engine, onEngineReady, triggerRender]);

  // Trigger re-render when engine changes (for formatting updates)
  useEffect(() => {
    render();
  }, [engine, render]);


  // Set up canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
        
        render();
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [render]);

  // Re-render on state changes (viewport, selection, editing, engine)
  useEffect(() => {
    render();
  }, [render, viewport, selection, editing, engine]);

  // Convert column index to letter (0 -> A, 25 -> Z, 26 -> AA)
  function colToLetter(col: number): string {
    let result = '';
    let n = col;
    do {
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return result;
  }

  // Check if mouse is over a resize handle
  const getResizeHandleAtPoint = useCallback((clientX: number, clientY: number): { type: 'col' | 'row' | null; index: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = canvas.width / dpr;
    const canvasHeight = canvas.height / dpr;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const vp = viewportRef.current;
    const zoom = vp.zoom;
    const headerWidth = HEADER_WIDTH * zoom;
    const headerHeight = HEADER_HEIGHT * zoom;
    const RESIZE_HANDLE_WIDTH = 8; // Increased for easier detection (8px tolerance)

    // Helper to get column width
    const getColWidth = (col: number): number => {
      if (engine && (engine as any).get_col_width) {
        return (engine as any).get_col_width(col) * zoom;
      }
      return colSizes.get(col) ? colSizes.get(col)! * zoom : DEFAULT_COL_WIDTH * zoom;
    };

    // Helper to get row height
    const getRowHeight = (row: number): number => {
      if (engine && (engine as any).get_row_height) {
        return (engine as any).get_row_height(row) * zoom;
      }
      return rowSizes.get(row) ? rowSizes.get(row)! * zoom : DEFAULT_ROW_HEIGHT * zoom;
    };

    // Check column resize handles (vertical line between columns in header area)
    // The resize handle is at the RIGHT edge of each column header
    if (y >= 0 && y <= headerHeight && x >= headerWidth) {
      let xPos = headerWidth - vp.offsetX;
      for (let col = vp.startCol; xPos <= canvasWidth + RESIZE_HANDLE_WIDTH && col < 1000; col++) {
        const colWidth = getColWidth(col);
        const handleX = xPos + colWidth; // Right edge of column
        const distance = Math.abs(x - handleX);
        
        // Check if mouse is near the right edge of this column
        if (distance < RESIZE_HANDLE_WIDTH) {
          console.log('Column resize handle detected:', { 
            col, 
            x, 
            y,
            handleX, 
            distance, 
            xPos, 
            colWidth,
            headerWidth,
            headerHeight,
            RESIZE_HANDLE_WIDTH,
            note: 'mouse is near right edge of column'
          });
          return { type: 'col', index: col };
        }
        xPos += colWidth;
        if (xPos > canvasWidth + RESIZE_HANDLE_WIDTH) break;
      }
    }

    // Check row resize handles (horizontal line between rows in header area)
    // The resize handle is at the BOTTOM edge of each row header
    if (x >= 0 && x <= headerWidth && y >= headerHeight) {
      let yPos = headerHeight - vp.offsetY;
      for (let row = vp.startRow; yPos <= canvasHeight + RESIZE_HANDLE_WIDTH && row < 1000; row++) {
        const rowHeight = getRowHeight(row);
        const handleY = yPos + rowHeight; // Bottom edge of row
        const distance = Math.abs(y - handleY);
        
        // Check if mouse is near the bottom edge of this row
        if (distance < RESIZE_HANDLE_WIDTH) {
          console.log('Row resize handle detected:', { 
            row, 
            x,
            y, 
            handleY, 
            distance, 
            yPos, 
            rowHeight,
            headerWidth,
            headerHeight,
            RESIZE_HANDLE_WIDTH,
            note: 'mouse is near bottom edge of row'
          });
          return { type: 'row', index: row };
        }
        yPos += rowHeight;
        if (yPos > canvasHeight + RESIZE_HANDLE_WIDTH) break;
      }
    }

    return null;
  }, [engine, colSizes, rowSizes]);

  // Get cell at screen coordinates
  const getCellAtPoint = useCallback((clientX: number, clientY: number): { row: number; col: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    // Get coordinates relative to canvas (in CSS pixels)
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Use ref to get latest viewport (avoids stale closure issues)
    const vp = viewportRef.current;
    const zoom = vp.zoom;
    const headerWidth = HEADER_WIDTH * zoom;
    const headerHeight = HEADER_HEIGHT * zoom;

    if (x < headerWidth || y < headerHeight) {
      return null; // Clicked on headers
    }

    // Calculate cell position - must match rendering logic exactly
    // Rendering: cellY = headerHeight + (cell.row - startRow) * rowHeight - offsetY
    // Solving: row = startRow + (clickY - headerHeight + offsetY) / rowHeight
    const gridX = x - headerWidth;
    const gridY = y - headerHeight;
    
    const rowHeight = DEFAULT_ROW_HEIGHT * zoom;
    const colWidth = DEFAULT_COL_WIDTH * zoom;
    
    // Get viewport values
    const startRow = vp.startRow;
    const startCol = vp.startCol;
    const offsetX = vp.offsetX;
    const offsetY = vp.offsetY;
    
    // Reverse the rendering formula exactly
    // Rendering subtracts offsetY, so we add it back to find which cell was clicked
    const col = startCol + Math.floor((gridX + offsetX) / colWidth);
    const row = startRow + Math.floor((gridY + offsetY) / rowHeight);

    // Debug logging
    console.log('Click calculation:', {
      clientX,
      clientY,
      x,
      y,
      gridX,
      gridY,
      headerWidth,
      headerHeight,
      startRow,
      startCol,
      offsetX,
      offsetY,
      rowHeight,
      colWidth,
      calculatedRow: row,
      calculatedCol: col,
      viewport: vp,
    });

    return { row: Math.max(0, row), col: Math.max(0, col) };
  }, []);

  // Helper function to safely extract string value from cell
  const getCellValueString = useCallback((cell: { value: string | any; formula?: string } | null): string => {
    if (!cell) return '';
    
    if (cell.formula) {
      return String(cell.formula);
    }
    
    if (cell.value === undefined || cell.value === null) {
      return '';
    }
    
    // Handle string values
    if (typeof cell.value === 'string') {
      return cell.value;
    }
    
    // Handle object values (from WASM engine)
    if (typeof cell.value === 'object') {
      // Check if it's a CellValue-like object with a nested value property
      // e.g., {type: 'Text', value: 'fff'}
      if ('value' in cell.value) {
        const nestedValue = (cell.value as any).value;
        if (typeof nestedValue === 'string') {
          return nestedValue;
        }
        if (typeof nestedValue === 'number') {
          return String(nestedValue);
        }
        if (typeof nestedValue === 'boolean') {
          return String(nestedValue);
        }
      }
      
      // Check if it has a display method
      if ('display' in cell.value && typeof (cell.value as any).display === 'function') {
        return String((cell.value as any).display());
      }
      
      // Check if it has a toString method
      if ('toString' in cell.value && typeof (cell.value as any).toString === 'function') {
        return String((cell.value as any).toString());
      }
      
      // Fallback to JSON stringify for objects
      try {
        return JSON.stringify(cell.value);
      } catch {
        return String(cell.value);
      }
    }
    
    return String(cell.value);
  }, []);

  // Track the last clicked cell to detect double-clicks
  const lastClickRef = useRef<{ row: number; col: number; time: number } | null>(null);

  // Handle mouse click for selection or resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Check if clicking on a resize handle first
    const resizeHandle = getResizeHandleAtPoint(e.clientX, e.clientY);
    if (resizeHandle && resizeHandle.type && engine) {
      e.preventDefault();
      e.stopPropagation();
      
      console.log('Resize handle clicked:', resizeHandle);
      
      // Get current size
      let currentSize = 0;
      if (resizeHandle.type === 'col') {
        currentSize = (engine as any).get_col_width?.(resizeHandle.index) || DEFAULT_COL_WIDTH;
      } else {
        currentSize = (engine as any).get_row_height?.(resizeHandle.index) || DEFAULT_ROW_HEIGHT;
      }
      
      // Get initial mouse position
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const initialPos = resizeHandle.type === 'col' 
        ? e.clientX - rect.left 
        : e.clientY - rect.top;
      
      console.log('Starting resize:', {
        type: resizeHandle.type,
        index: resizeHandle.index,
        currentSize,
        initialPos,
      });
      
      setResizeState({
        type: resizeHandle.type,
        index: resizeHandle.index,
        startPos: initialPos,
        startSize: currentSize,
      });
      
      return;
    }
    
    const cell = getCellAtPoint(e.clientX, e.clientY);
    if (!cell) return;

    console.log('handleMouseDown - setting selection to:', cell);

    const now = Date.now();
    const lastClick = lastClickRef.current;

    // Check if this is a double-click (within 300ms and same cell)
    if (lastClick && 
        lastClick.row === cell.row && 
        lastClick.col === cell.col && 
        now - lastClick.time < 300) {
      // This is a double-click - handle it immediately
      lastClickRef.current = null;
      const currentValue = engine?.get_cell(cell.row, cell.col);
      console.log('Double-click - starting edit at:', cell, 'value:', currentValue);
      
      setEditing({
        row: cell.row,
        col: cell.col,
        initialValue: getCellValueString(currentValue || null),
      });
      return;
    }

    // Single click - start selection (may become drag-to-select)
    lastClickRef.current = { ...cell, time: now };
    setEditing(null);
    selectionStartRef.current = { row: cell.row, col: cell.col };
    setIsSelecting(true);
    setSelection({
      startRow: cell.row,
      startCol: cell.col,
      endRow: cell.row,
      endCol: cell.col,
    });
    onSelectionChange?.({
      startRow: cell.row,
      startCol: cell.col,
      endRow: cell.row,
      endCol: cell.col,
    });
  }, [onSelectionChange, viewport, engine, getCellAtPoint, getResizeHandleAtPoint]);

  // Handle mouse move for resize and selection drag (global handler)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Handle resize
      if (resizeState && engine) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const currentPos = resizeState.type === 'col'
          ? e.clientX - rect.left
          : e.clientY - rect.top;
        
        const delta = (currentPos - resizeState.startPos) / viewport.zoom;
        const newSize = Math.max(20, resizeState.startSize + delta); // Minimum size 20px
        
        // Update engine
        if (resizeState.type === 'col') {
          (engine as any).set_col_width?.(resizeState.index, newSize);
          setColSizes(prev => {
            const next = new Map(prev);
            next.set(resizeState.index, newSize);
            return next;
          });
        } else {
          (engine as any).set_row_height?.(resizeState.index, newSize);
          setRowSizes(prev => {
            const next = new Map(prev);
            next.set(resizeState.index, newSize);
            return next;
          });
        }
        
        render();
        return;
      }
      
      // Handle selection drag
      if (isSelecting && selectionStartRef.current) {
        const cell = getCellAtPoint(e.clientX, e.clientY);
        if (cell) {
          const start = selectionStartRef.current;
          setSelection({
            startRow: Math.min(start.row, cell.row),
            startCol: Math.min(start.col, cell.col),
            endRow: Math.max(start.row, cell.row),
            endCol: Math.max(start.col, cell.col),
          });
          onSelectionChange?.({
            startRow: Math.min(start.row, cell.row),
            startCol: Math.min(start.col, cell.col),
            endRow: Math.max(start.row, cell.row),
            endCol: Math.max(start.col, cell.col),
          });
          render();
        }
      }
    };

    const handleMouseUp = () => {
      if (resizeState) {
        setResizeState(null);
      }
      if (isSelecting) {
        setIsSelecting(false);
        selectionStartRef.current = null;
      }
    };

    if (resizeState || isSelecting) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizeState, isSelecting, engine, viewport.zoom, render, getCellAtPoint, onSelectionChange]);

  // Handle mouse up to end resize/selection (canvas-level handler)
  const handleMouseUp = useCallback(() => {
    if (resizeState) {
      setResizeState(null);
    }
    if (isSelecting) {
      setIsSelecting(false);
      selectionStartRef.current = null;
    }
  }, [resizeState, isSelecting]);

  // Update cursor style based on resize handle hover
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (resizeState) {
        // Keep resize cursor during resize
        canvas.style.cursor = resizeState.type === 'col' ? 'col-resize' : 'row-resize';
        return;
      }
      
      // Only check for resize handles if we're in the header area
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const zoom = viewportRef.current.zoom;
      const headerWidth = HEADER_WIDTH * zoom;
      const headerHeight = HEADER_HEIGHT * zoom;
      
      // Check if we're in a position where resize handles could be detected
      const inColumnHeaderArea = y >= 0 && y <= headerHeight && x >= headerWidth;
      const inRowHeaderArea = x >= 0 && x <= headerWidth && y >= headerHeight;
      
      if (inColumnHeaderArea || inRowHeaderArea) {
        const resizeHandle = getResizeHandleAtPoint(e.clientX, e.clientY);
        if (resizeHandle && resizeHandle.type) {
          console.log('Resize handle hover detected:', resizeHandle, { x, y, headerWidth, headerHeight });
          canvas.style.cursor = resizeHandle.type === 'col' ? 'col-resize' : 'row-resize';
        } else {
          canvas.style.cursor = 'default';
        }
      } else {
        canvas.style.cursor = 'default';
      }
    };
    
    canvas.addEventListener('mousemove', handleMouseMove);
    return () => canvas.removeEventListener('mousemove', handleMouseMove);
  }, [getResizeHandleAtPoint, resizeState]);

  // Handle double-click for editing (backup handler)
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const cell = getCellAtPoint(e.clientX, e.clientY);
    if (!cell) return;

    const currentValue = engine?.get_cell(cell.row, cell.col);
    setEditing({
      row: cell.row,
      col: cell.col,
      initialValue: currentValue?.formula || currentValue?.value || '',
    });
  }, [engine, viewport]);

  // Handle wheel for scrolling
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Zoom - adjust viewport to keep selection cell visible
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setViewport(v => {
        const newZoom = Math.max(0.25, Math.min(4, v.zoom * delta));
        
        // Calculate the visual position of the selected cell before zoom
        const oldRowHeight = DEFAULT_ROW_HEIGHT * v.zoom;
        const oldColWidth = DEFAULT_COL_WIDTH * v.zoom;
        const oldSelY = HEADER_HEIGHT * v.zoom + (selection.startRow - v.startRow) * oldRowHeight - v.offsetY;
        const oldSelX = HEADER_WIDTH * v.zoom + (selection.startCol - v.startCol) * oldColWidth - v.offsetX;
        
        // Calculate what the new offsets should be to keep the selection in the same visual position
        const newRowHeight = DEFAULT_ROW_HEIGHT * newZoom;
        const newColWidth = DEFAULT_COL_WIDTH * newZoom;
        const newHeaderHeight = HEADER_HEIGHT * newZoom;
        const newHeaderWidth = HEADER_WIDTH * newZoom;
        
        // Keep the same startRow/startCol, but adjust offsets to maintain visual position
        const newOffsetY = newHeaderHeight + (selection.startRow - v.startRow) * newRowHeight - oldSelY;
        const newOffsetX = newHeaderWidth + (selection.startCol - v.startCol) * newColWidth - oldSelX;
        
        return {
          ...v,
          zoom: newZoom,
          offsetX: Math.max(0, newOffsetX),
          offsetY: Math.max(0, newOffsetY),
        };
      });
    } else {
      // Scroll
      setViewport(v => {
        let newOffsetX = v.offsetX + e.deltaX;
        let newOffsetY = v.offsetY + e.deltaY;
        let newStartRow = v.startRow;
        let newStartCol = v.startCol;

        const rowHeight = DEFAULT_ROW_HEIGHT * v.zoom;
        const colWidth = DEFAULT_COL_WIDTH * v.zoom;

        while (newOffsetY >= rowHeight) {
          newOffsetY -= rowHeight;
          newStartRow++;
        }
        while (newOffsetY < 0 && newStartRow > 0) {
          newOffsetY += rowHeight;
          newStartRow--;
        }

        while (newOffsetX >= colWidth) {
          newOffsetX -= colWidth;
          newStartCol++;
        }
        while (newOffsetX < 0 && newStartCol > 0) {
          newOffsetX += colWidth;
          newStartCol--;
        }

        return {
          ...v,
          startRow: newStartRow,
          startCol: newStartCol,
          offsetX: Math.max(0, newOffsetX),
          offsetY: Math.max(0, newOffsetY),
        };
      });
    }
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editing) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelection(s => ({
          ...s,
          startRow: Math.max(0, s.startRow - 1),
          endRow: Math.max(0, s.endRow - 1),
        }));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelection(s => ({
          ...s,
          startRow: s.startRow + 1,
          endRow: s.endRow + 1,
        }));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setSelection(s => ({
          ...s,
          startCol: Math.max(0, s.startCol - 1),
          endCol: Math.max(0, s.endCol - 1),
        }));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setSelection(s => ({
          ...s,
          startCol: s.startCol + 1,
          endCol: s.endCol + 1,
        }));
        break;
      case 'Enter':
        e.preventDefault();
        const currentValue = engine?.get_cell(selection.startRow, selection.startCol);
        setEditing({
          row: selection.startRow,
          col: selection.startCol,
          initialValue: getCellValueString(currentValue || null),
        });
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        engine?.set_cell(selection.startRow, selection.startCol, '');
        onCellEdit?.(selection.startRow, selection.startCol, '');
        render();
        break;
      default:
        // Start editing on any printable character
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          console.log('handleKeyDown - starting edit at:', {
            key: e.key,
            selection,
            editingRow: selection.startRow,
            editingCol: selection.startCol,
          });
          setEditing({
            row: selection.startRow,
            col: selection.startCol,
            initialValue: e.key,
          });
        }
    }
  }, [editing, selection, engine, onCellEdit, render]);

  // Handle cell edit completion
  const handleEditComplete = useCallback((value: string, moveDown?: boolean) => {
    if (!editing) return;

    const editedRow = editing.row;
    const editedCol = editing.col;

    engine?.set_cell(editedRow, editedCol, value);
    onCellEdit?.(editedRow, editedCol, value);
    setEditing(null);
    
    // Move to next row only if Enter was pressed
    if (moveDown) {
      setSelection({
        startRow: editedRow + 1,
        startCol: editedCol,
        endRow: editedRow + 1,
        endCol: editedCol,
      });
    } else {
      setSelection({
        startRow: editedRow,
        startCol: editedCol,
        endRow: editedRow,
        endCol: editedCol,
      });
    }
    
    render();
  }, [editing, engine, onCellEdit, render]);

  const handleEditCancel = useCallback(() => {
    setEditing(null);
  }, []);

  // Calculate cell editor position
  const getCellEditorPosition = useCallback(() => {
    if (!editing || !containerRef.current) return null;

    // Use container ref since CellEditor is positioned relative to the container div
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    // Use ref to get latest viewport (avoids stale closure issues)
    const vp = viewportRef.current;
    const zoom = vp.zoom;

    // Match the exact rendering formula for cell position
    // Rendering: cellY = headerHeight + (cell.row - startRow) * rowHeight - offsetY
    const headerWidth = HEADER_WIDTH * zoom;
    const headerHeight = HEADER_HEIGHT * zoom;
    const rowHeight = DEFAULT_ROW_HEIGHT * zoom;
    const colWidth = DEFAULT_COL_WIDTH * zoom;

    // Calculate cell position within the canvas (same as rendering)
    const cellX = headerWidth + (editing.col - vp.startCol) * colWidth - vp.offsetX;
    const cellY = headerHeight + (editing.row - vp.startRow) * rowHeight - vp.offsetY;

    // Position relative to container (which is the parent of both canvas and editor)
    const x = cellX;
    const y = cellY;
    const width = colWidth;
    const height = rowHeight;

    console.log('getCellEditorPosition:', {
      editing,
      viewport: vp,
      cellX,
      cellY,
      containerRectTop: containerRect.top,
      finalX: x,
      finalY: y,
      headerWidth,
      headerHeight,
    });

    return { x, y, width, height };
  }, [editing]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="animate-pulse text-slate-500">Loading spreadsheet...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-red-50">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  const editorPosition = getCellEditorPosition();

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full overflow-hidden focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        id="sheet-canvas"
        className="block w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
      
      {editing && editorPosition && (
        <CellEditor
          initialValue={editing.initialValue}
          position={editorPosition}
          zoom={viewport.zoom}
          onComplete={handleEditComplete}
          onCancel={handleEditCancel}
        />
      )}

      {/* Selection info for testing */}
      <div 
        data-testid="selection-info"
        className="absolute bottom-2 left-2 px-2 py-1 bg-white/90 border border-slate-200 rounded text-xs text-slate-600"
      >
        {colToLetter(selection.startCol)}{selection.startRow + 1}
        {(selection.startRow !== selection.endRow || selection.startCol !== selection.endCol) && 
          `:${colToLetter(selection.endCol)}${selection.endRow + 1}`
        }
      </div>

      {/* Scroll position for testing */}
      <div 
        data-testid="scroll-position"
        className="absolute bottom-2 right-2 px-2 py-1 bg-white/90 border border-slate-200 rounded text-xs text-slate-600"
      >
        Row: {viewport.startRow + 1} | Zoom: {Math.round(viewport.zoom * 100)}%
      </div>
    </div>
  );
}

