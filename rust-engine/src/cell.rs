//! Cell types and cell reference handling

use serde::{Deserialize, Serialize};
use std::fmt;

/// Reference to a cell by row and column
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CellRef {
    pub row: u32,
    pub col: u32,
}

impl CellRef {
    pub fn new(row: u32, col: u32) -> Self {
        Self { row, col }
    }

    /// Convert column index to Excel-style letter (0 -> A, 25 -> Z, 26 -> AA)
    pub fn col_to_letter(col: u32) -> String {
        let mut result = String::new();
        let mut n = col;
        loop {
            result.insert(0, (b'A' + (n % 26) as u8) as char);
            if n < 26 {
                break;
            }
            n = n / 26 - 1;
        }
        result
    }

    /// Convert Excel-style column letter to index (A -> 0, Z -> 25, AA -> 26)
    pub fn letter_to_col(letter: &str) -> Option<u32> {
        let mut col = 0u32;
        for c in letter.chars() {
            if !c.is_ascii_alphabetic() {
                return None;
            }
            col = col * 26 + (c.to_ascii_uppercase() as u32 - 'A' as u32 + 1);
        }
        Some(col.saturating_sub(1))
    }

    /// Parse a cell reference like "A1" or "BC42"
    pub fn parse(s: &str) -> Option<Self> {
        let s = s.trim().to_uppercase();
        let col_end = s.chars().take_while(|c| c.is_ascii_alphabetic()).count();
        if col_end == 0 {
            return None;
        }
        let col = Self::letter_to_col(&s[..col_end])?;
        let row: u32 = s[col_end..].parse().ok()?;
        Some(Self::new(row.saturating_sub(1), col))
    }

    /// Format as Excel-style reference (e.g., "A1")
    pub fn to_a1(&self) -> String {
        format!("{}{}", Self::col_to_letter(self.col), self.row + 1)
    }
}

impl fmt::Display for CellRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_a1())
    }
}

/// The value stored in a cell
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum CellValue {
    Empty,
    Text(String),
    Number(f64),
    Boolean(bool),
    Error(String),
}

impl CellValue {
    /// Parse a string into a cell value
    pub fn parse(s: &str) -> Self {
        let trimmed = s.trim();
        
        if trimmed.is_empty() {
            return Self::Empty;
        }
        
        // Try parsing as boolean
        if trimmed.eq_ignore_ascii_case("true") {
            return Self::Boolean(true);
        }
        if trimmed.eq_ignore_ascii_case("false") {
            return Self::Boolean(false);
        }
        
        // Try parsing as number
        if let Ok(n) = trimmed.parse::<f64>() {
            return Self::Number(n);
        }
        
        // Try parsing percentage
        if trimmed.ends_with('%') {
            if let Ok(n) = trimmed[..trimmed.len()-1].parse::<f64>() {
                return Self::Number(n / 100.0);
            }
        }
        
        // Try parsing currency
        if trimmed.starts_with('$') || trimmed.starts_with('-') && trimmed.chars().nth(1) == Some('$') {
            let cleaned: String = trimmed.chars()
                .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
                .collect();
            if let Ok(n) = cleaned.parse::<f64>() {
                return Self::Number(n);
            }
        }
        
        Self::Text(s.to_string())
    }

    /// Get the display string for this value
    pub fn display(&self) -> String {
        match self {
            Self::Empty => String::new(),
            Self::Text(s) => s.clone(),
            Self::Number(n) => {
                if n.fract() == 0.0 && n.abs() < 1e15 {
                    format!("{}", *n as i64)
                } else {
                    format!("{}", n)
                }
            }
            Self::Boolean(b) => if *b { "TRUE" } else { "FALSE" }.to_string(),
            Self::Error(e) => format!("#{}", e),
        }
    }

    /// Check if the value is truthy
    pub fn is_truthy(&self) -> bool {
        match self {
            Self::Empty => false,
            Self::Text(s) => !s.is_empty(),
            Self::Number(n) => *n != 0.0,
            Self::Boolean(b) => *b,
            Self::Error(_) => false,
        }
    }

    /// Convert to number if possible
    pub fn to_number(&self) -> Option<f64> {
        match self {
            Self::Number(n) => Some(*n),
            Self::Boolean(true) => Some(1.0),
            Self::Boolean(false) => Some(0.0),
            Self::Text(s) => s.trim().parse().ok(),
            _ => None,
        }
    }
}

impl Default for CellValue {
    fn default() -> Self {
        Self::Empty
    }
}

/// A complete cell with value, formula, and formatting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cell {
    pub value: CellValue,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<CellFormat>,
}

impl Cell {
    pub fn new(value: CellValue) -> Self {
        Self {
            value,
            formula: None,
            format: None,
        }
    }

    pub fn with_formula(value: CellValue, formula: String) -> Self {
        Self {
            value,
            formula: Some(formula),
            format: None,
        }
    }

    pub fn display(&self) -> String {
        self.value.display()
    }
}

impl Default for Cell {
    fn default() -> Self {
        Self::new(CellValue::Empty)
    }
}

/// Cell formatting options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellFormat {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number_format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_bold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_italic: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_underline: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub align_h: Option<HorizontalAlign>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub align_v: Option<VerticalAlign>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HorizontalAlign {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    Top,
    Middle,
    Bottom,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cell_ref_parsing() {
        assert_eq!(CellRef::parse("A1"), Some(CellRef::new(0, 0)));
        assert_eq!(CellRef::parse("B2"), Some(CellRef::new(1, 1)));
        assert_eq!(CellRef::parse("Z26"), Some(CellRef::new(25, 25)));
        assert_eq!(CellRef::parse("AA1"), Some(CellRef::new(0, 26)));
    }

    #[test]
    fn test_col_to_letter() {
        assert_eq!(CellRef::col_to_letter(0), "A");
        assert_eq!(CellRef::col_to_letter(25), "Z");
        assert_eq!(CellRef::col_to_letter(26), "AA");
        assert_eq!(CellRef::col_to_letter(27), "AB");
    }

    #[test]
    fn test_cell_value_parsing() {
        assert_eq!(CellValue::parse(""), CellValue::Empty);
        assert_eq!(CellValue::parse("42"), CellValue::Number(42.0));
        assert_eq!(CellValue::parse("3.14"), CellValue::Number(3.14));
        assert_eq!(CellValue::parse("true"), CellValue::Boolean(true));
        assert_eq!(CellValue::parse("Hello"), CellValue::Text("Hello".to_string()));
        assert_eq!(CellValue::parse("50%"), CellValue::Number(0.5));
        assert_eq!(CellValue::parse("$100"), CellValue::Number(100.0));
    }
}

