//! Grid data structure for cell storage

use crate::cell::{Cell, CellRef, CellValue};
use crate::formula::{Formula, FormulaEngine, FormulaError};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::JsValue;

/// Error type for grid operations
#[derive(Debug, thiserror::Error)]
pub enum GridError {
    #[error("Cell reference out of bounds: {0}")]
    OutOfBounds(CellRef),
    #[error("Serialization error: {0}")]
    Serialization(String),
    #[error("Formula error: {0}")]
    Formula(String),
}

impl From<FormulaError> for GridError {
    fn from(e: FormulaError) -> Self {
        GridError::Formula(e.to_string())
    }
}

impl From<GridError> for JsValue {
    fn from(e: GridError) -> Self {
        JsValue::from_str(&e.to_string())
    }
}

/// The main grid data structure using sparse columnar storage
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Grid {
    /// Maximum dimensions
    pub rows: u32,
    pub cols: u32,
    
    /// Sparse cell storage: column -> row -> cell
    /// Using columnar layout for better cache performance on column operations
    #[serde(default)]
    columns: HashMap<u32, IndexMap<u32, Cell>>,
    
    /// Column widths (in pixels)
    #[serde(default)]
    col_widths: HashMap<u32, f32>,
    
    /// Row heights (in pixels)
    #[serde(default)]
    row_heights: HashMap<u32, f32>,
    
    /// Default column width
    #[serde(default = "default_col_width")]
    default_col_width: f32,
    
    /// Default row height
    #[serde(default = "default_row_height")]
    default_row_height: f32,
}

fn default_col_width() -> f32 { 100.0 }
fn default_row_height() -> f32 { 24.0 }

impl Grid {
    pub fn new(rows: u32, cols: u32) -> Self {
        Self {
            rows,
            cols,
            columns: HashMap::new(),
            col_widths: HashMap::new(),
            row_heights: HashMap::new(),
            default_col_width: default_col_width(),
            default_row_height: default_row_height(),
        }
    }

    /// Get a cell by reference
    pub fn get_cell(&self, cell_ref: CellRef) -> Option<&Cell> {
        self.columns.get(&cell_ref.col)?.get(&cell_ref.row)
    }

    /// Get a mutable cell by reference
    pub fn get_cell_mut(&mut self, cell_ref: CellRef) -> Option<&mut Cell> {
        self.columns.get_mut(&cell_ref.col)?.get_mut(&cell_ref.row)
    }

    /// Set a raw value (not a formula)
    pub fn set_value(&mut self, cell_ref: CellRef, value: CellValue) -> Result<(), GridError> {
        self.check_bounds(cell_ref)?;
        
        let column = self.columns.entry(cell_ref.col).or_insert_with(IndexMap::new);
        
        if matches!(value, CellValue::Empty) {
            column.shift_remove(&cell_ref.row);
            if column.is_empty() {
                self.columns.remove(&cell_ref.col);
            }
        } else {
            column.insert(cell_ref.row, Cell::new(value));
        }
        
        Ok(())
    }

    /// Set a formula on a cell
    pub fn set_formula(&mut self, cell_ref: CellRef, formula: Formula) -> Result<(), GridError> {
        self.check_bounds(cell_ref)?;
        
        let column = self.columns.entry(cell_ref.col).or_insert_with(IndexMap::new);
        column.insert(cell_ref.row, Cell::with_formula(CellValue::Empty, formula.raw.clone()));
        
        Ok(())
    }

    /// Set a computed value (from formula evaluation)
    pub fn set_computed_value(&mut self, cell_ref: CellRef, value: CellValue) -> Result<(), GridError> {
        self.check_bounds(cell_ref)?;
        
        if let Some(cell) = self.get_cell_mut(cell_ref) {
            cell.value = value;
        }
        
        Ok(())
    }

    /// Set formatting for a cell (merges with existing format)
    pub fn set_format(&mut self, cell_ref: CellRef, format: crate::cell::CellFormat) -> Result<(), GridError> {
        self.check_bounds(cell_ref)?;
        
        let column = self.columns.entry(cell_ref.col).or_insert_with(IndexMap::new);
        let cell = column.entry(cell_ref.row).or_insert_with(|| Cell::new(CellValue::Empty));
        
        // Merge with existing format
        if let Some(existing_format) = &mut cell.format {
            if format.number_format.is_some() {
                existing_format.number_format = format.number_format;
            }
            if format.font_bold.is_some() {
                existing_format.font_bold = format.font_bold;
            }
            if format.font_italic.is_some() {
                existing_format.font_italic = format.font_italic;
            }
            if format.font_underline.is_some() {
                existing_format.font_underline = format.font_underline;
            }
            if format.font_family.is_some() {
                existing_format.font_family = format.font_family;
            }
            if format.font_size.is_some() {
                existing_format.font_size = format.font_size;
            }
            if format.font_color.is_some() {
                existing_format.font_color = format.font_color;
            }
            if format.bg_color.is_some() {
                existing_format.bg_color = format.bg_color;
            }
            if format.align_h.is_some() {
                existing_format.align_h = format.align_h;
            }
            if format.align_v.is_some() {
                existing_format.align_v = format.align_v;
            }
        } else {
            cell.format = Some(format);
        }
        
        Ok(())
    }

    /// Apply formatting to a range of cells
    pub fn apply_format_to_range(&mut self, start_row: u32, start_col: u32, end_row: u32, end_col: u32, format: crate::cell::CellFormat) -> Result<(), GridError> {
        for row in start_row..=end_row.min(self.rows - 1) {
            for col in start_col..=end_col.min(self.cols - 1) {
                self.set_format(CellRef::new(row, col), format.clone())?;
            }
        }
        Ok(())
    }

    /// Check if a cell reference is within bounds
    fn check_bounds(&self, cell_ref: CellRef) -> Result<(), GridError> {
        if cell_ref.row >= self.rows || cell_ref.col >= self.cols {
            return Err(GridError::OutOfBounds(cell_ref));
        }
        Ok(())
    }

    /// Get cells in a range (inclusive)
    pub fn get_range(&self, start_row: u32, start_col: u32, end_row: u32, end_col: u32) -> Vec<CellData> {
        let mut cells = Vec::new();
        
        for col in start_col..=end_col.min(self.cols - 1) {
            if let Some(column) = self.columns.get(&col) {
                for (&row, cell) in column.iter() {
                    if row >= start_row && row <= end_row {
                        cells.push(CellData {
                            row,
                            col,
                            value: cell.value.display(),
                            formula: cell.formula.clone(),
                            format: cell.format.clone(),
                        });
                    }
                }
            }
        }
        
        cells
    }

    /// Get column width
    pub fn get_col_width(&self, col: u32) -> f32 {
        *self.col_widths.get(&col).unwrap_or(&self.default_col_width)
    }

    /// Set column width
    pub fn set_col_width(&mut self, col: u32, width: f32) {
        if (width - self.default_col_width).abs() < 0.01 {
            self.col_widths.remove(&col);
        } else {
            self.col_widths.insert(col, width);
        }
    }

    /// Get row height
    pub fn get_row_height(&self, row: u32) -> f32 {
        *self.row_heights.get(&row).unwrap_or(&self.default_row_height)
    }

    /// Set row height
    pub fn set_row_height(&mut self, row: u32, height: f32) {
        if (height - self.default_row_height).abs() < 0.01 {
            self.row_heights.remove(&row);
        } else {
            self.row_heights.insert(row, height);
        }
    }

    /// Apply a batch patch of updates
    pub fn apply_patch(&mut self, patch: GridPatch, formula_engine: &mut FormulaEngine) -> Result<Vec<CellRef>, GridError> {
        let mut affected = Vec::new();
        
        for update in patch.updates {
            let cell_ref = CellRef::new(update.row, update.col);
            affected.push(cell_ref);
            
            if let Some(formula) = update.formula {
                let parsed = formula_engine.parse(&formula)?;
                formula_engine.register_formula(cell_ref, parsed.clone());
                self.set_formula(cell_ref, parsed)?;
            } else if let Some(value) = update.value {
                self.set_value(cell_ref, CellValue::parse(&value))?;
            }
        }
        
        // Collect cells to recalculate (copy to avoid borrow issues)
        let cells_to_recalc: Vec<CellRef> = affected.clone();
        
        // Recalculate all affected cells
        for cell_ref in cells_to_recalc {
            let recalc_affected = formula_engine.recalculate(self, cell_ref)?;
            for a in recalc_affected {
                if !affected.contains(&a) {
                    affected.push(a);
                }
            }
        }
        
        Ok(affected)
    }

    /// Export to JSON
    pub fn to_json(&self) -> Result<String, GridError> {
        serde_json::to_string(self).map_err(|e| GridError::Serialization(e.to_string()))
    }

    /// Import from JSON
    pub fn from_json(json: &str) -> Result<Self, GridError> {
        serde_json::from_str(json).map_err(|e| GridError::Serialization(e.to_string()))
    }

    /// Get total number of non-empty cells
    pub fn cell_count(&self) -> usize {
        self.columns.values().map(|col| col.len()).sum()
    }
}

/// Simplified cell data for transfer to JS
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellData {
    pub row: u32,
    pub col: u32,
    pub value: String,
    pub formula: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<crate::cell::CellFormat>,
}

/// A batch update to apply to the grid
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridPatch {
    pub updates: Vec<CellUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellUpdate {
    pub row: u32,
    pub col: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
}

/// A diff representing changes to the grid (for efficient UI updates)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridDiff {
    pub cells: Vec<CellData>,
}

impl GridDiff {
    pub fn from_cells(grid: &Grid, cells: &[CellRef]) -> Self {
        Self {
            cells: cells.iter()
                .filter_map(|cell_ref| {
                    grid.get_cell(*cell_ref).map(|cell| CellData {
                        row: cell_ref.row,
                        col: cell_ref.col,
                        value: cell.value.display(),
                        formula: cell.formula.clone(),
                        format: cell.format.clone(),
                    })
                })
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_basics() {
        let mut grid = Grid::new(1000, 100);
        
        grid.set_value(CellRef::new(0, 0), CellValue::Number(42.0)).unwrap();
        grid.set_value(CellRef::new(0, 1), CellValue::Text("Hello".to_string())).unwrap();
        
        assert_eq!(grid.cell_count(), 2);
        
        let cell = grid.get_cell(CellRef::new(0, 0)).unwrap();
        assert_eq!(cell.value, CellValue::Number(42.0));
    }

    #[test]
    fn test_sparse_storage() {
        let mut grid = Grid::new(1_000_000, 1000);
        
        // Even with huge dimensions, empty grid uses minimal memory
        assert_eq!(grid.cell_count(), 0);
        
        grid.set_value(CellRef::new(999_999, 999), CellValue::Number(1.0)).unwrap();
        assert_eq!(grid.cell_count(), 1);
    }

    #[test]
    fn test_serialization() {
        let mut grid = Grid::new(100, 100);
        grid.set_value(CellRef::new(0, 0), CellValue::Number(42.0)).unwrap();
        
        let json = grid.to_json().unwrap();
        let restored = Grid::from_json(&json).unwrap();
        
        assert_eq!(restored.cell_count(), 1);
        assert_eq!(
            restored.get_cell(CellRef::new(0, 0)).unwrap().value,
            CellValue::Number(42.0)
        );
    }
}
