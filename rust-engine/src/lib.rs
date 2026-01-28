//! Ramp Sheets Engine - High-performance spreadsheet core
//!
//! This crate provides the core calculation engine for Ramp Sheets,
//! including cell storage, formula evaluation, and dependency tracking.

mod cell;
mod formula;
mod grid;
mod renderer;
mod viewport;

use wasm_bindgen::prelude::*;

pub use cell::{Cell, CellValue, CellRef};
pub use formula::{Formula, FormulaEngine, FormulaError};
pub use grid::{Grid, GridDiff, GridPatch};
pub use renderer::CanvasRenderer;
pub use viewport::Viewport;

/// Initialize the WASM module with panic hooks for better error messages
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// The main spreadsheet engine exposed to JavaScript
#[wasm_bindgen]
pub struct SheetEngine {
    grid: Grid,
    formula_engine: FormulaEngine,
    viewport: Viewport,
    renderer: Option<CanvasRenderer>,
}

#[wasm_bindgen]
impl SheetEngine {
    /// Create a new sheet engine instance
    #[wasm_bindgen(constructor)]
    pub fn new(rows: u32, cols: u32) -> Self {
        Self {
            grid: Grid::new(rows, cols),
            formula_engine: FormulaEngine::new(),
            viewport: Viewport::new(0, 0, 100, 50),
            renderer: None,
        }
    }

    /// Attach a canvas element for rendering
    #[wasm_bindgen]
    pub fn attach_canvas(&mut self, canvas_id: &str) -> Result<(), JsValue> {
        self.renderer = Some(CanvasRenderer::new(canvas_id)?);
        Ok(())
    }

    /// Set a cell value (raw value or formula string)
    #[wasm_bindgen]
    pub fn set_cell(&mut self, row: u32, col: u32, value: &str) -> Result<JsValue, JsValue> {
        let cell_ref = CellRef::new(row, col);
        
        // Check if it's a formula
        if value.starts_with('=') {
            let formula = self.formula_engine.parse(value)?;
            self.grid.set_formula(cell_ref, formula)?;
        } else {
            let cell_value = CellValue::parse(value);
            self.grid.set_value(cell_ref, cell_value)?;
        }
        
        // Recalculate affected cells
        let affected = self.formula_engine.recalculate(&mut self.grid, cell_ref)?;
        
        // Return the diff for the UI
        let diff = GridDiff::from_cells(&self.grid, &affected);
        Ok(serde_wasm_bindgen::to_value(&diff)?)
    }

    /// Get a cell's display value
    #[wasm_bindgen]
    pub fn get_cell(&self, row: u32, col: u32) -> JsValue {
        let cell_ref = CellRef::new(row, col);
        match self.grid.get_cell(cell_ref) {
            Some(cell) => serde_wasm_bindgen::to_value(cell).unwrap_or(JsValue::NULL),
            None => JsValue::NULL,
        }
    }

    /// Get cells in the current viewport for rendering
    #[wasm_bindgen]
    pub fn get_viewport_cells(&self) -> Result<JsValue, JsValue> {
        let cells = self.grid.get_range(
            self.viewport.start_row,
            self.viewport.start_col,
            self.viewport.end_row(),
            self.viewport.end_col(),
        );
        Ok(serde_wasm_bindgen::to_value(&cells)?)
    }

    /// Update viewport position (for scrolling)
    #[wasm_bindgen]
    pub fn set_viewport(&mut self, start_row: u32, start_col: u32, visible_rows: u32, visible_cols: u32) {
        self.viewport = Viewport::new(start_row, start_col, visible_rows, visible_cols);
    }

    /// Render the current viewport to the attached canvas
    #[wasm_bindgen]
    pub fn render(&self) -> Result<(), JsValue> {
        if let Some(ref renderer) = self.renderer {
            renderer.render(&self.grid, &self.viewport)?;
        }
        Ok(())
    }

    /// Apply a batch of cell updates (for AI agent patches)
    #[wasm_bindgen]
    pub fn apply_patch(&mut self, patch_js: JsValue) -> Result<JsValue, JsValue> {
        let patch: GridPatch = serde_wasm_bindgen::from_value(patch_js)?;
        let affected = self.grid.apply_patch(patch, &mut self.formula_engine)?;
        let diff = GridDiff::from_cells(&self.grid, &affected);
        Ok(serde_wasm_bindgen::to_value(&diff)?)
    }

    /// Export grid data as JSON (for persistence)
    #[wasm_bindgen]
    pub fn export_json(&self) -> Result<String, JsValue> {
        self.grid.to_json().map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Import grid data from JSON
    #[wasm_bindgen]
    pub fn import_json(&mut self, json: &str) -> Result<(), JsValue> {
        self.grid = Grid::from_json(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(())
    }

    /// Apply formatting to selected cells
    #[wasm_bindgen]
    pub fn apply_format(&mut self, start_row: u32, start_col: u32, end_row: u32, end_col: u32, format_js: JsValue) -> Result<(), JsValue> {
        let format: cell::CellFormat = serde_wasm_bindgen::from_value(format_js)?;
        self.grid.apply_format_to_range(start_row, start_col, end_row, end_col, format)?;
        Ok(())
    }

    /// Get column width
    #[wasm_bindgen]
    pub fn get_col_width(&self, col: u32) -> f32 {
        self.grid.get_col_width(col)
    }

    /// Set column width
    #[wasm_bindgen]
    pub fn set_col_width(&mut self, col: u32, width: f32) {
        self.grid.set_col_width(col, width);
    }

    /// Get row height
    #[wasm_bindgen]
    pub fn get_row_height(&self, row: u32) -> f32 {
        self.grid.get_row_height(row)
    }

    /// Set row height
    #[wasm_bindgen]
    pub fn set_row_height(&mut self, row: u32, height: f32) {
        self.grid.set_row_height(row, height);
    }
}

