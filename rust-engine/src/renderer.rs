//! Canvas rendering engine using WebGL

use crate::grid::Grid;
use crate::viewport::Viewport;
use wasm_bindgen::prelude::*;
use web_sys::{HtmlCanvasElement, WebGl2RenderingContext};

/// Canvas renderer using WebGL for high-performance rendering
pub struct CanvasRenderer {
    canvas: HtmlCanvasElement,
    gl: WebGl2RenderingContext,
    width: u32,
    height: u32,
}

impl CanvasRenderer {
    pub fn new(canvas_id: &str) -> Result<Self, JsValue> {
        let window = web_sys::window().ok_or("no window")?;
        let document = window.document().ok_or("no document")?;
        
        let canvas = document
            .get_element_by_id(canvas_id)
            .ok_or(format!("Canvas '{}' not found", canvas_id))?
            .dyn_into::<HtmlCanvasElement>()?;
        
        let gl = canvas
            .get_context("webgl2")?
            .ok_or("WebGL2 not supported")?
            .dyn_into::<WebGl2RenderingContext>()?;
        
        let width = canvas.width();
        let height = canvas.height();
        
        // Set up WebGL state
        gl.viewport(0, 0, width as i32, height as i32);
        gl.clear_color(1.0, 1.0, 1.0, 1.0);
        
        Ok(Self {
            canvas,
            gl,
            width,
            height,
        })
    }

    /// Render the current viewport to the canvas
    pub fn render(&self, grid: &Grid, viewport: &Viewport) -> Result<(), JsValue> {
        // Clear the canvas
        self.gl.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);
        
        // Get cells in viewport
        let cells = grid.get_range(
            viewport.start_row,
            viewport.start_col,
            viewport.end_row(),
            viewport.end_col(),
        );
        
        // For now, we'll use 2D canvas for text rendering
        // In a full implementation, this would use WebGL shaders for grid lines
        // and a texture atlas for text
        let ctx_2d = self.canvas
            .get_context("2d")?
            .ok_or("2D context not available")?
            .dyn_into::<web_sys::CanvasRenderingContext2d>()?;
        
        // Clear
        ctx_2d.set_fill_style_str("#ffffff");
        ctx_2d.fill_rect(0.0, 0.0, self.width as f64, self.height as f64);
        
        // Draw grid lines
        self.draw_grid_lines(&ctx_2d, grid, viewport)?;
        
        // Draw cells
        self.draw_cells(&ctx_2d, grid, viewport, &cells)?;
        
        // Draw headers
        self.draw_headers(&ctx_2d, grid, viewport)?;
        
        Ok(())
    }

    fn draw_grid_lines(
        &self,
        ctx: &web_sys::CanvasRenderingContext2d,
        grid: &Grid,
        viewport: &Viewport,
    ) -> Result<(), JsValue> {
        let zoom = viewport.zoom as f64;
        let header_width = 50.0 * zoom;
        let header_height = 24.0 * zoom;
        
        ctx.set_stroke_style_str("#e0e0e0");
        ctx.set_line_width(1.0);
        
        // Vertical lines (columns)
        let mut x = header_width - (viewport.offset_x as f64 * zoom);
        for col in viewport.start_col..viewport.end_col() {
            let col_width = grid.get_col_width(col) as f64 * zoom;
            ctx.begin_path();
            ctx.move_to(x, 0.0);
            ctx.line_to(x, self.height as f64);
            ctx.stroke();
            x += col_width;
        }
        
        // Horizontal lines (rows)
        let mut y = header_height - (viewport.offset_y as f64 * zoom);
        for row in viewport.start_row..viewport.end_row() {
            let row_height = grid.get_row_height(row) as f64 * zoom;
            ctx.begin_path();
            ctx.move_to(0.0, y);
            ctx.line_to(self.width as f64, y);
            ctx.stroke();
            y += row_height;
        }
        
        Ok(())
    }

    fn draw_cells(
        &self,
        ctx: &web_sys::CanvasRenderingContext2d,
        grid: &Grid,
        viewport: &Viewport,
        cells: &[crate::grid::CellData],
    ) -> Result<(), JsValue> {
        let zoom = viewport.zoom as f64;
        let header_width = 50.0 * zoom;
        let header_height = 24.0 * zoom;
        
        ctx.set_fill_style_str("#1a1a1a");
        let font_size = (13.0 * zoom).max(8.0);
        ctx.set_font(&format!("{}px -apple-system, BlinkMacSystemFont, sans-serif", font_size));
        ctx.set_text_baseline("middle");
        
        for cell in cells {
            // Calculate cell position
            let mut x = header_width - (viewport.offset_x as f64 * zoom);
            for col in viewport.start_col..cell.col {
                x += grid.get_col_width(col) as f64 * zoom;
            }
            
            let mut y = header_height - (viewport.offset_y as f64 * zoom);
            for row in viewport.start_row..cell.row {
                y += grid.get_row_height(row) as f64 * zoom;
            }
            
            let cell_width = grid.get_col_width(cell.col) as f64 * zoom;
            let cell_height = grid.get_row_height(cell.row) as f64 * zoom;
            
            // Draw cell text with padding
            let padding = 4.0 * zoom;
            ctx.set_text_align("left");
            
            // Clip to cell bounds
            ctx.save();
            ctx.begin_path();
            ctx.rect(x, y, cell_width, cell_height);
            ctx.clip();
            
            ctx.fill_text(&cell.value, x + padding, y + cell_height / 2.0)?;
            
            ctx.restore();
        }
        
        Ok(())
    }

    fn draw_headers(
        &self,
        ctx: &web_sys::CanvasRenderingContext2d,
        grid: &Grid,
        viewport: &Viewport,
    ) -> Result<(), JsValue> {
        let zoom = viewport.zoom as f64;
        let header_width = 50.0 * zoom;
        let header_height = 24.0 * zoom;
        
        // Header background
        ctx.set_fill_style_str("#f8f9fa");
        ctx.fill_rect(0.0, 0.0, self.width as f64, header_height);
        ctx.fill_rect(0.0, 0.0, header_width, self.height as f64);
        
        // Corner
        ctx.set_fill_style_str("#f0f1f2");
        ctx.fill_rect(0.0, 0.0, header_width, header_height);
        
        // Column headers
        ctx.set_fill_style_str("#606770");
        let font_size = (12.0 * zoom).max(8.0);
        ctx.set_font(&format!("500 {}px -apple-system, BlinkMacSystemFont, sans-serif", font_size));
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");
        
        let mut x = header_width - (viewport.offset_x as f64 * zoom);
        for col in viewport.start_col..viewport.end_col() {
            let col_width = grid.get_col_width(col) as f64 * zoom;
            let label = crate::cell::CellRef::col_to_letter(col);
            ctx.fill_text(&label, x + col_width / 2.0, header_height / 2.0)?;
            x += col_width;
        }
        
        // Row headers
        ctx.set_text_align("center");
        let mut y = header_height - (viewport.offset_y as f64 * zoom);
        for row in viewport.start_row..viewport.end_row() {
            let row_height = grid.get_row_height(row) as f64 * zoom;
            let label = (row + 1).to_string();
            ctx.fill_text(&label, header_width / 2.0, y + row_height / 2.0)?;
            y += row_height;
        }
        
        // Header borders
        ctx.set_stroke_style_str("#dadce0");
        ctx.set_line_width(1.0);
        
        // Bottom border of column header
        ctx.begin_path();
        ctx.move_to(0.0, header_height);
        ctx.line_to(self.width as f64, header_height);
        ctx.stroke();
        
        // Right border of row header
        ctx.begin_path();
        ctx.move_to(header_width, 0.0);
        ctx.line_to(header_width, self.height as f64);
        ctx.stroke();
        
        Ok(())
    }

    /// Resize the canvas
    pub fn resize(&mut self, width: u32, height: u32) {
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.width = width;
        self.height = height;
        self.gl.viewport(0, 0, width as i32, height as i32);
    }
}

