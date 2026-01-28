//! Viewport management for virtual scrolling

use serde::{Deserialize, Serialize};

/// Represents the visible area of the grid
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Viewport {
    /// First visible row
    pub start_row: u32,
    /// First visible column
    pub start_col: u32,
    /// Number of visible rows
    pub visible_rows: u32,
    /// Number of visible columns
    pub visible_cols: u32,
    /// Scroll offset X in pixels (for smooth scrolling)
    pub offset_x: f32,
    /// Scroll offset Y in pixels (for smooth scrolling)
    pub offset_y: f32,
    /// Current zoom level (1.0 = 100%)
    pub zoom: f32,
}

impl Viewport {
    pub fn new(start_row: u32, start_col: u32, visible_rows: u32, visible_cols: u32) -> Self {
        Self {
            start_row,
            start_col,
            visible_rows,
            visible_cols,
            offset_x: 0.0,
            offset_y: 0.0,
            zoom: 1.0,
        }
    }

    /// Calculate the end row (exclusive)
    pub fn end_row(&self) -> u32 {
        self.start_row + self.visible_rows
    }

    /// Calculate the end column (exclusive)
    pub fn end_col(&self) -> u32 {
        self.start_col + self.visible_cols
    }

    /// Update viewport for scrolling
    pub fn scroll(&mut self, delta_x: f32, delta_y: f32, row_height: f32, col_width: f32) {
        self.offset_x += delta_x;
        self.offset_y += delta_y;
        
        // Convert pixel scroll to row/col changes
        while self.offset_y >= row_height {
            self.offset_y -= row_height;
            self.start_row += 1;
        }
        while self.offset_y < 0.0 && self.start_row > 0 {
            self.offset_y += row_height;
            self.start_row -= 1;
        }
        
        while self.offset_x >= col_width {
            self.offset_x -= col_width;
            self.start_col += 1;
        }
        while self.offset_x < 0.0 && self.start_col > 0 {
            self.offset_x += col_width;
            self.start_col -= 1;
        }
        
        // Clamp offset
        self.offset_x = self.offset_x.max(0.0);
        self.offset_y = self.offset_y.max(0.0);
    }

    /// Update zoom level
    pub fn set_zoom(&mut self, zoom: f32) {
        self.zoom = zoom.clamp(0.25, 4.0);
    }

    /// Apply zoom (pinch-to-zoom)
    pub fn zoom_by(&mut self, factor: f32, center_x: f32, center_y: f32, row_height: f32, col_width: f32) {
        let old_zoom = self.zoom;
        self.set_zoom(self.zoom * factor);
        
        // Adjust scroll position to keep the center point stable
        let zoom_ratio = self.zoom / old_zoom;
        let dx = center_x * (1.0 - zoom_ratio);
        let dy = center_y * (1.0 - zoom_ratio);
        
        self.scroll(-dx, -dy, row_height, col_width);
    }

    /// Get the cell at a screen coordinate
    pub fn cell_at_point(&self, x: f32, y: f32, row_heights: &dyn Fn(u32) -> f32, col_widths: &dyn Fn(u32) -> f32) -> (u32, u32) {
        let x = x / self.zoom + self.offset_x;
        let y = y / self.zoom + self.offset_y;
        
        // Find column
        let mut col = self.start_col;
        let mut acc_x = 0.0;
        while acc_x < x {
            acc_x += col_widths(col);
            if acc_x < x {
                col += 1;
            }
        }
        
        // Find row
        let mut row = self.start_row;
        let mut acc_y = 0.0;
        while acc_y < y {
            acc_y += row_heights(row);
            if acc_y < y {
                row += 1;
            }
        }
        
        (row, col)
    }
}

impl Default for Viewport {
    fn default() -> Self {
        Self::new(0, 0, 50, 20)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scroll() {
        let mut vp = Viewport::new(0, 0, 50, 20);
        
        vp.scroll(0.0, 30.0, 24.0, 100.0);
        assert_eq!(vp.start_row, 1);
        assert_eq!(vp.offset_y, 6.0);
        
        vp.scroll(150.0, 0.0, 24.0, 100.0);
        assert_eq!(vp.start_col, 1);
        assert_eq!(vp.offset_x, 50.0);
    }

    #[test]
    fn test_zoom() {
        let mut vp = Viewport::new(0, 0, 50, 20);
        
        vp.set_zoom(2.0);
        assert_eq!(vp.zoom, 2.0);
        
        vp.set_zoom(10.0);
        assert_eq!(vp.zoom, 4.0); // Clamped
        
        vp.set_zoom(0.1);
        assert_eq!(vp.zoom, 0.25); // Clamped
    }
}

