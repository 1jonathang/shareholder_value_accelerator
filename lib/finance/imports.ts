/**
 * Excel file import/export utilities
 * Converts between Excel format and internal columnar representation
 */

import type { CellData, CellFormat } from '@/lib/supabase/types';

// Types for Excel parsing
interface ExcelCell {
  value: string | number | boolean | Date | null;
  formula?: string;
  style?: ExcelStyle;
}

interface ExcelStyle {
  font?: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    color?: { argb?: string };
  };
  fill?: {
    fgColor?: { argb?: string };
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
  };
  numFmt?: string;
}

interface ExcelWorksheet {
  name: string;
  rowCount: number;
  columnCount: number;
  getCell(row: number, col: number): ExcelCell;
  getColumn(col: number): { width?: number };
  getRow(row: number): { height?: number };
}

interface ExcelWorkbook {
  worksheets: ExcelWorksheet[];
}

/**
 * Parse an Excel file buffer into internal format
 * Uses ExcelJS under the hood
 */
export async function parseExcelFile(buffer: ArrayBuffer): Promise<{
  sheets: Array<{
    name: string;
    rows: number;
    cols: number;
    cells: CellData[];
    colWidths: Record<number, number>;
    rowHeights: Record<number, number>;
  }>;
}> {
  // Dynamic import to reduce bundle size
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: Array<{
    name: string;
    rows: number;
    cols: number;
    cells: CellData[];
    colWidths: Record<number, number>;
    rowHeights: Record<number, number>;
  }> = [];

  for (const worksheet of workbook.worksheets) {
    const cells: CellData[] = [];
    const colWidths: Record<number, number> = {};
    const rowHeights: Record<number, number> = {};

    // Get column widths
    for (let col = 1; col <= worksheet.columnCount; col++) {
      const column = worksheet.getColumn(col);
      if (column.width && column.width !== 8.43) {
        // 8.43 is default width
        colWidths[col - 1] = column.width * 7; // Convert to pixels approximately
      }
    }

    // Get row heights
    for (let row = 1; row <= worksheet.rowCount; row++) {
      const rowObj = worksheet.getRow(row);
      if (rowObj.height && rowObj.height !== 15) {
        // 15 is default height
        rowHeights[row - 1] = rowObj.height;
      }
    }

    // Get cell data
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const cellData: CellData = {
          row: rowNumber - 1,
          col: colNumber - 1,
        };

        // Handle value
        if (cell.formula) {
          cellData.formula = `=${cell.formula}`;
          cellData.value = cell.result as string | number | boolean | null;
        } else if (cell.value !== null && cell.value !== undefined) {
          if (cell.value instanceof Date) {
            cellData.value = cell.value.toISOString();
          } else if (typeof cell.value === 'object' && 'richText' in cell.value) {
            // Rich text - extract plain text
            cellData.value = (cell.value as { richText: Array<{ text: string }> }).richText
              .map((rt) => rt.text)
              .join('');
          } else {
            cellData.value = cell.value as string | number | boolean | null;
          }
        }

        // Handle formatting
        const format = extractFormat(cell);
        if (format) {
          cellData.format = format;
        }

        cells.push(cellData);
      });
    });

    sheets.push({
      name: worksheet.name,
      rows: Math.max(worksheet.rowCount, 1000),
      cols: Math.max(worksheet.columnCount, 26),
      cells,
      colWidths,
      rowHeights,
    });
  }

  return { sheets };
}

/**
 * Extract formatting from an Excel cell
 */
function extractFormat(cell: {
  style?: {
    font?: {
      bold?: boolean;
      italic?: boolean;
      size?: number;
      color?: { argb?: string };
    };
    fill?: {
      fgColor?: { argb?: string };
    };
    alignment?: {
      horizontal?: 'left' | 'center' | 'right';
      vertical?: 'top' | 'middle' | 'bottom';
    };
    numFmt?: string;
  };
}): CellFormat | undefined {
  const style = cell.style;
  if (!style) return undefined;

  const format: CellFormat = {};
  let hasFormat = false;

  if (style.font?.bold) {
    format.fontBold = true;
    hasFormat = true;
  }
  if (style.font?.italic) {
    format.fontItalic = true;
    hasFormat = true;
  }
  if (style.font?.size) {
    format.fontSize = style.font.size;
    hasFormat = true;
  }
  if (style.font?.color?.argb) {
    format.fontColor = `#${style.font.color.argb.slice(2)}`;
    hasFormat = true;
  }
  if (style.fill?.fgColor?.argb) {
    format.bgColor = `#${style.fill.fgColor.argb.slice(2)}`;
    hasFormat = true;
  }
  if (style.alignment?.horizontal) {
    format.alignH = style.alignment.horizontal;
    hasFormat = true;
  }
  if (style.alignment?.vertical) {
    format.alignV = style.alignment.vertical;
    hasFormat = true;
  }
  if (style.numFmt) {
    format.numberFormat = style.numFmt;
    hasFormat = true;
  }

  return hasFormat ? format : undefined;
}

/**
 * Export internal data to Excel format
 */
export async function exportToExcel(sheets: Array<{
  name: string;
  cells: CellData[];
  colWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
}>): Promise<Blob> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);

    // Set column widths
    if (sheet.colWidths) {
      for (const [col, width] of Object.entries(sheet.colWidths)) {
        worksheet.getColumn(parseInt(col) + 1).width = width / 7;
      }
    }

    // Set row heights
    if (sheet.rowHeights) {
      for (const [row, height] of Object.entries(sheet.rowHeights)) {
        worksheet.getRow(parseInt(row) + 1).height = height;
      }
    }

    // Add cells
    for (const cellData of sheet.cells) {
      const cell = worksheet.getCell(cellData.row + 1, cellData.col + 1);

      if (cellData.formula) {
        cell.value = {
          formula: cellData.formula.replace(/^=/, ''),
          result: cellData.value,
        } as ExcelJS.CellFormulaValue;
      } else {
        cell.value = cellData.value;
      }

      // Apply formatting
      if (cellData.format) {
        applyFormat(cell, cellData.format);
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Apply formatting to an Excel cell
 */
function applyFormat(
  cell: {
    font?: {
      bold?: boolean;
      italic?: boolean;
      size?: number;
      color?: { argb?: string };
    };
    fill?: {
      type?: string;
      fgColor?: { argb?: string };
    };
    alignment?: {
      horizontal?: 'left' | 'center' | 'right';
      vertical?: 'top' | 'middle' | 'bottom';
    };
    numFmt?: string;
  },
  format: CellFormat
): void {
  if (format.fontBold || format.fontItalic || format.fontSize || format.fontColor) {
    cell.font = {
      bold: format.fontBold,
      italic: format.fontItalic,
      size: format.fontSize,
      color: format.fontColor ? { argb: `FF${format.fontColor.slice(1)}` } : undefined,
    };
  }

  if (format.bgColor) {
    cell.fill = {
      type: 'pattern',
      fgColor: { argb: `FF${format.bgColor.slice(1)}` },
    };
  }

  if (format.alignH || format.alignV) {
    cell.alignment = {
      horizontal: format.alignH,
      vertical: format.alignV,
    };
  }

  if (format.numberFormat) {
    cell.numFmt = format.numberFormat;
  }
}

/**
 * Export to CSV format
 */
export function exportToCSV(cells: CellData[], rows: number, cols: number): string {
  // Build a 2D array
  const grid: (string | number | boolean | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = new Array(cols).fill('');
  }

  for (const cell of cells) {
    if (cell.row < rows && cell.col < cols) {
      grid[cell.row][cell.col] = cell.value ?? '';
    }
  }

  // Convert to CSV
  return grid
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          const str = String(cell);
          // Quote if contains comma, quote, or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');
}

/**
 * Parse CSV to internal format
 */
export function parseCSV(csv: string): CellData[] {
  const cells: CellData[] = [];
  const lines = csv.split(/\r?\n/);

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row];
    if (!line.trim()) continue;

    // Simple CSV parsing (doesn't handle all edge cases)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }
    values.push(current);

    for (let col = 0; col < values.length; col++) {
      const value = values[col].trim();
      if (value) {
        // Try to parse as number
        const num = parseFloat(value);
        cells.push({
          row,
          col,
          value: !isNaN(num) && isFinite(num) ? num : value,
        });
      }
    }
  }

  return cells;
}

