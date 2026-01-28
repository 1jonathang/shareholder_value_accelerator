//! Formula parsing and evaluation engine

use crate::cell::{CellRef, CellValue};
use crate::grid::{Grid, GridError};
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::visit::EdgeRef;
use petgraph::algo::toposort;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use thiserror::Error;
use wasm_bindgen::JsValue;

#[derive(Error, Debug)]
pub enum FormulaError {
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Circular reference detected")]
    CircularReference,
    #[error("Invalid cell reference: {0}")]
    InvalidRef(String),
    #[error("Division by zero")]
    DivisionByZero,
    #[error("Type error: expected {expected}, got {got}")]
    TypeError { expected: String, got: String },
    #[error("Unknown function: {0}")]
    UnknownFunction(String),
    #[error("Invalid argument count for {func}: expected {expected}, got {got}")]
    ArgumentCount { func: String, expected: String, got: usize },
    #[error("Grid error: {0}")]
    Grid(String),
}

impl From<GridError> for FormulaError {
    fn from(e: GridError) -> Self {
        FormulaError::Grid(e.to_string())
    }
}

impl From<FormulaError> for JsValue {
    fn from(e: FormulaError) -> Self {
        JsValue::from_str(&e.to_string())
    }
}

/// A parsed formula
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Formula {
    pub raw: String,
    pub ast: FormulaNode,
    pub dependencies: Vec<CellRef>,
}

/// AST node for formula expressions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum FormulaNode {
    Number { value: f64 },
    Text { value: String },
    Boolean { value: bool },
    CellRef { cell: CellRef },
    Range { start: CellRef, end: CellRef },
    BinaryOp { op: BinaryOp, left: Box<FormulaNode>, right: Box<FormulaNode> },
    UnaryOp { op: UnaryOp, operand: Box<FormulaNode> },
    Function { name: String, args: Vec<FormulaNode> },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum BinaryOp {
    Add,
    Sub,
    Mul,
    Div,
    Pow,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Concat,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum UnaryOp {
    Neg,
    Percent,
}

/// The formula evaluation engine
pub struct FormulaEngine {
    /// Dependency graph: edges point from dependency to dependent
    dep_graph: DiGraph<CellRef, ()>,
    /// Map from cell reference to node index
    cell_to_node: HashMap<CellRef, NodeIndex>,
    /// Parsed formulas by cell
    formulas: HashMap<CellRef, Formula>,
}

impl FormulaEngine {
    pub fn new() -> Self {
        Self {
            dep_graph: DiGraph::new(),
            cell_to_node: HashMap::new(),
            formulas: HashMap::new(),
        }
    }

    /// Parse a formula string (starting with '=')
    pub fn parse(&self, formula: &str) -> Result<Formula, FormulaError> {
        let raw = formula.to_string();
        let content = formula.strip_prefix('=').unwrap_or(formula).trim();
        
        let (ast, dependencies) = self.parse_expression(content)?;
        
        Ok(Formula {
            raw,
            ast,
            dependencies,
        })
    }

    fn parse_expression(&self, expr: &str) -> Result<(FormulaNode, Vec<CellRef>), FormulaError> {
        let expr = expr.trim();
        let mut deps = Vec::new();
        
        // Handle empty expression
        if expr.is_empty() {
            return Ok((FormulaNode::Number { value: 0.0 }, deps));
        }

        // Try to parse as number
        if let Ok(n) = expr.parse::<f64>() {
            return Ok((FormulaNode::Number { value: n }, deps));
        }

        // Try to parse as boolean
        if expr.eq_ignore_ascii_case("true") {
            return Ok((FormulaNode::Boolean { value: true }, deps));
        }
        if expr.eq_ignore_ascii_case("false") {
            return Ok((FormulaNode::Boolean { value: false }, deps));
        }

        // Try to parse as string literal
        if (expr.starts_with('"') && expr.ends_with('"')) ||
           (expr.starts_with('\'') && expr.ends_with('\'')) {
            let value = expr[1..expr.len()-1].to_string();
            return Ok((FormulaNode::Text { value }, deps));
        }

        // Try to parse as cell reference
        if let Some(cell_ref) = CellRef::parse(expr) {
            deps.push(cell_ref);
            return Ok((FormulaNode::CellRef { cell: cell_ref }, deps));
        }

        // Try to parse as range (A1:B2)
        if let Some((start, end)) = expr.split_once(':') {
            if let (Some(start_ref), Some(end_ref)) = (CellRef::parse(start), CellRef::parse(end)) {
                // Add all cells in range as dependencies
                for row in start_ref.row..=end_ref.row {
                    for col in start_ref.col..=end_ref.col {
                        deps.push(CellRef::new(row, col));
                    }
                }
                return Ok((FormulaNode::Range { start: start_ref, end: end_ref }, deps));
            }
        }

        // Try to parse as function call
        if let Some(paren_pos) = expr.find('(') {
            if expr.ends_with(')') {
                let name = expr[..paren_pos].trim().to_uppercase();
                let args_str = &expr[paren_pos+1..expr.len()-1];
                let (args, arg_deps) = self.parse_function_args(args_str)?;
                deps.extend(arg_deps);
                return Ok((FormulaNode::Function { name, args }, deps));
            }
        }

        // Try to parse binary operations (in order of precedence)
        // Addition/Subtraction (lowest precedence, parse last)
        if let Some(node) = self.try_parse_binary_op(expr, &['+', '-'], &mut deps)? {
            return Ok((node, deps));
        }

        // Multiplication/Division
        if let Some(node) = self.try_parse_binary_op(expr, &['*', '/'], &mut deps)? {
            return Ok((node, deps));
        }

        // Power
        if let Some(node) = self.try_parse_binary_op(expr, &['^'], &mut deps)? {
            return Ok((node, deps));
        }

        Err(FormulaError::Parse(format!("Cannot parse: {}", expr)))
    }

    fn try_parse_binary_op(
        &self,
        expr: &str,
        ops: &[char],
        deps: &mut Vec<CellRef>,
    ) -> Result<Option<FormulaNode>, FormulaError> {
        let mut paren_depth = 0;
        let chars: Vec<char> = expr.chars().collect();
        
        // Scan from right to left to ensure left associativity
        for i in (0..chars.len()).rev() {
            let c = chars[i];
            match c {
                ')' => paren_depth += 1,
                '(' => paren_depth -= 1,
                _ if paren_depth == 0 && ops.contains(&c) => {
                    // Don't split on negative sign at the start
                    if i == 0 {
                        continue;
                    }
                    
                    let left = &expr[..i].trim();
                    let right = &expr[i+1..].trim();
                    
                    if left.is_empty() || right.is_empty() {
                        continue;
                    }
                    
                    let (left_node, left_deps) = self.parse_expression(left)?;
                    let (right_node, right_deps) = self.parse_expression(right)?;
                    
                    deps.extend(left_deps);
                    deps.extend(right_deps);
                    
                    let op = match c {
                        '+' => BinaryOp::Add,
                        '-' => BinaryOp::Sub,
                        '*' => BinaryOp::Mul,
                        '/' => BinaryOp::Div,
                        '^' => BinaryOp::Pow,
                        _ => unreachable!(),
                    };
                    
                    return Ok(Some(FormulaNode::BinaryOp {
                        op,
                        left: Box::new(left_node),
                        right: Box::new(right_node),
                    }));
                }
                _ => {}
            }
        }
        
        Ok(None)
    }

    fn parse_function_args(&self, args_str: &str) -> Result<(Vec<FormulaNode>, Vec<CellRef>), FormulaError> {
        let mut args = Vec::new();
        let mut deps = Vec::new();
        
        if args_str.trim().is_empty() {
            return Ok((args, deps));
        }
        
        // Simple comma split (doesn't handle nested functions with commas)
        let mut current = String::new();
        let mut paren_depth = 0;
        
        for c in args_str.chars() {
            match c {
                '(' => {
                    paren_depth += 1;
                    current.push(c);
                }
                ')' => {
                    paren_depth -= 1;
                    current.push(c);
                }
                ',' if paren_depth == 0 => {
                    let (node, node_deps) = self.parse_expression(&current)?;
                    args.push(node);
                    deps.extend(node_deps);
                    current.clear();
                }
                _ => current.push(c),
            }
        }
        
        if !current.trim().is_empty() {
            let (node, node_deps) = self.parse_expression(&current)?;
            args.push(node);
            deps.extend(node_deps);
        }
        
        Ok((args, deps))
    }

    /// Evaluate a formula node against the grid
    pub fn evaluate(&self, node: &FormulaNode, grid: &Grid) -> Result<CellValue, FormulaError> {
        match node {
            FormulaNode::Number { value } => Ok(CellValue::Number(*value)),
            FormulaNode::Text { value } => Ok(CellValue::Text(value.clone())),
            FormulaNode::Boolean { value } => Ok(CellValue::Boolean(*value)),
            
            FormulaNode::CellRef { cell } => {
                Ok(grid.get_cell(*cell)
                    .map(|c| c.value.clone())
                    .unwrap_or(CellValue::Empty))
            }
            
            FormulaNode::Range { start, end } => {
                // Ranges usually need to be handled in function context
                // Return an error for now if used directly
                Err(FormulaError::TypeError {
                    expected: "single value".to_string(),
                    got: format!("range {}:{}", start, end),
                })
            }
            
            FormulaNode::BinaryOp { op, left, right } => {
                let left_val = self.evaluate(left, grid)?;
                let right_val = self.evaluate(right, grid)?;
                self.evaluate_binary_op(*op, left_val, right_val)
            }
            
            FormulaNode::UnaryOp { op, operand } => {
                let val = self.evaluate(operand, grid)?;
                self.evaluate_unary_op(*op, val)
            }
            
            FormulaNode::Function { name, args } => {
                self.evaluate_function(name, args, grid)
            }
        }
    }

    fn evaluate_binary_op(&self, op: BinaryOp, left: CellValue, right: CellValue) -> Result<CellValue, FormulaError> {
        let left_num = left.to_number();
        let right_num = right.to_number();
        
        match op {
            BinaryOp::Add => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Number(l + r)),
                    _ => Err(FormulaError::TypeError {
                        expected: "number".to_string(),
                        got: "non-numeric".to_string(),
                    }),
                }
            }
            BinaryOp::Sub => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Number(l - r)),
                    _ => Err(FormulaError::TypeError {
                        expected: "number".to_string(),
                        got: "non-numeric".to_string(),
                    }),
                }
            }
            BinaryOp::Mul => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Number(l * r)),
                    _ => Err(FormulaError::TypeError {
                        expected: "number".to_string(),
                        got: "non-numeric".to_string(),
                    }),
                }
            }
            BinaryOp::Div => {
                match (left_num, right_num) {
                    (Some(_), Some(r)) if r == 0.0 => Err(FormulaError::DivisionByZero),
                    (Some(l), Some(r)) => Ok(CellValue::Number(l / r)),
                    _ => Err(FormulaError::TypeError {
                        expected: "number".to_string(),
                        got: "non-numeric".to_string(),
                    }),
                }
            }
            BinaryOp::Pow => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Number(l.powf(r))),
                    _ => Err(FormulaError::TypeError {
                        expected: "number".to_string(),
                        got: "non-numeric".to_string(),
                    }),
                }
            }
            BinaryOp::Eq => Ok(CellValue::Boolean(left == right)),
            BinaryOp::Ne => Ok(CellValue::Boolean(left != right)),
            BinaryOp::Lt => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Boolean(l < r)),
                    _ => Ok(CellValue::Boolean(false)),
                }
            }
            BinaryOp::Le => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Boolean(l <= r)),
                    _ => Ok(CellValue::Boolean(false)),
                }
            }
            BinaryOp::Gt => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Boolean(l > r)),
                    _ => Ok(CellValue::Boolean(false)),
                }
            }
            BinaryOp::Ge => {
                match (left_num, right_num) {
                    (Some(l), Some(r)) => Ok(CellValue::Boolean(l >= r)),
                    _ => Ok(CellValue::Boolean(false)),
                }
            }
            BinaryOp::Concat => {
                Ok(CellValue::Text(format!("{}{}", left.display(), right.display())))
            }
        }
    }

    fn evaluate_unary_op(&self, op: UnaryOp, val: CellValue) -> Result<CellValue, FormulaError> {
        match op {
            UnaryOp::Neg => {
                val.to_number()
                    .map(|n| CellValue::Number(-n))
                    .ok_or_else(|| FormulaError::TypeError {
                        expected: "number".to_string(),
                        got: "non-numeric".to_string(),
                    })
            }
            UnaryOp::Percent => {
                val.to_number()
                    .map(|n| CellValue::Number(n / 100.0))
                    .ok_or_else(|| FormulaError::TypeError {
                        expected: "number".to_string(),
                        got: "non-numeric".to_string(),
                    })
            }
        }
    }

    fn evaluate_function(&self, name: &str, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        match name {
            "SUM" => self.fn_sum(args, grid),
            "AVERAGE" | "AVG" => self.fn_average(args, grid),
            "MIN" => self.fn_min(args, grid),
            "MAX" => self.fn_max(args, grid),
            "COUNT" => self.fn_count(args, grid),
            "IF" => self.fn_if(args, grid),
            "ABS" => self.fn_abs(args, grid),
            "ROUND" => self.fn_round(args, grid),
            "SQRT" => self.fn_sqrt(args, grid),
            "POWER" | "POW" => self.fn_power(args, grid),
            _ => Err(FormulaError::UnknownFunction(name.to_string())),
        }
    }

    fn collect_numbers(&self, args: &[FormulaNode], grid: &Grid) -> Vec<f64> {
        let mut numbers = Vec::new();
        for arg in args {
            match arg {
                FormulaNode::Range { start, end } => {
                    for row in start.row..=end.row {
                        for col in start.col..=end.col {
                            if let Some(cell) = grid.get_cell(CellRef::new(row, col)) {
                                if let Some(n) = cell.value.to_number() {
                                    numbers.push(n);
                                }
                            }
                        }
                    }
                }
                _ => {
                    if let Ok(val) = self.evaluate(arg, grid) {
                        if let Some(n) = val.to_number() {
                            numbers.push(n);
                        }
                    }
                }
            }
        }
        numbers
    }

    fn fn_sum(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        let numbers = self.collect_numbers(args, grid);
        Ok(CellValue::Number(numbers.iter().sum()))
    }

    fn fn_average(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        let numbers = self.collect_numbers(args, grid);
        if numbers.is_empty() {
            return Ok(CellValue::Error("DIV/0".to_string()));
        }
        Ok(CellValue::Number(numbers.iter().sum::<f64>() / numbers.len() as f64))
    }

    fn fn_min(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        let numbers = self.collect_numbers(args, grid);
        numbers.iter().copied().reduce(f64::min)
            .map(CellValue::Number)
            .ok_or_else(|| FormulaError::ArgumentCount {
                func: "MIN".to_string(),
                expected: "at least 1".to_string(),
                got: 0,
            })
    }

    fn fn_max(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        let numbers = self.collect_numbers(args, grid);
        numbers.iter().copied().reduce(f64::max)
            .map(CellValue::Number)
            .ok_or_else(|| FormulaError::ArgumentCount {
                func: "MAX".to_string(),
                expected: "at least 1".to_string(),
                got: 0,
            })
    }

    fn fn_count(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        let numbers = self.collect_numbers(args, grid);
        Ok(CellValue::Number(numbers.len() as f64))
    }

    fn fn_if(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        if args.len() < 2 || args.len() > 3 {
            return Err(FormulaError::ArgumentCount {
                func: "IF".to_string(),
                expected: "2 or 3".to_string(),
                got: args.len(),
            });
        }
        
        let condition = self.evaluate(&args[0], grid)?;
        if condition.is_truthy() {
            self.evaluate(&args[1], grid)
        } else if args.len() > 2 {
            self.evaluate(&args[2], grid)
        } else {
            Ok(CellValue::Boolean(false))
        }
    }

    fn fn_abs(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        if args.len() != 1 {
            return Err(FormulaError::ArgumentCount {
                func: "ABS".to_string(),
                expected: "1".to_string(),
                got: args.len(),
            });
        }
        let val = self.evaluate(&args[0], grid)?;
        val.to_number()
            .map(|n| CellValue::Number(n.abs()))
            .ok_or_else(|| FormulaError::TypeError {
                expected: "number".to_string(),
                got: "non-numeric".to_string(),
            })
    }

    fn fn_round(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        if args.is_empty() || args.len() > 2 {
            return Err(FormulaError::ArgumentCount {
                func: "ROUND".to_string(),
                expected: "1 or 2".to_string(),
                got: args.len(),
            });
        }
        let val = self.evaluate(&args[0], grid)?;
        let decimals = if args.len() > 1 {
            self.evaluate(&args[1], grid)?.to_number().unwrap_or(0.0) as i32
        } else {
            0
        };
        
        val.to_number()
            .map(|n| {
                let multiplier = 10_f64.powi(decimals);
                CellValue::Number((n * multiplier).round() / multiplier)
            })
            .ok_or_else(|| FormulaError::TypeError {
                expected: "number".to_string(),
                got: "non-numeric".to_string(),
            })
    }

    fn fn_sqrt(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        if args.len() != 1 {
            return Err(FormulaError::ArgumentCount {
                func: "SQRT".to_string(),
                expected: "1".to_string(),
                got: args.len(),
            });
        }
        let val = self.evaluate(&args[0], grid)?;
        val.to_number()
            .map(|n| CellValue::Number(n.sqrt()))
            .ok_or_else(|| FormulaError::TypeError {
                expected: "number".to_string(),
                got: "non-numeric".to_string(),
            })
    }

    fn fn_power(&self, args: &[FormulaNode], grid: &Grid) -> Result<CellValue, FormulaError> {
        if args.len() != 2 {
            return Err(FormulaError::ArgumentCount {
                func: "POWER".to_string(),
                expected: "2".to_string(),
                got: args.len(),
            });
        }
        let base = self.evaluate(&args[0], grid)?;
        let exp = self.evaluate(&args[1], grid)?;
        
        match (base.to_number(), exp.to_number()) {
            (Some(b), Some(e)) => Ok(CellValue::Number(b.powf(e))),
            _ => Err(FormulaError::TypeError {
                expected: "number".to_string(),
                got: "non-numeric".to_string(),
            }),
        }
    }

    /// Register a formula for a cell and update the dependency graph
    pub fn register_formula(&mut self, cell: CellRef, formula: Formula) {
        // Get or create node for this cell
        let cell_node = *self.cell_to_node.entry(cell).or_insert_with(|| {
            self.dep_graph.add_node(cell)
        });
        
        // Remove old dependencies
        let old_edges: Vec<_> = self.dep_graph.edges_directed(cell_node, petgraph::Direction::Incoming)
            .map(|e| e.id())
            .collect();
        for edge in old_edges {
            self.dep_graph.remove_edge(edge);
        }
        
        // Add new dependencies
        for dep in &formula.dependencies {
            let dep_node = *self.cell_to_node.entry(*dep).or_insert_with(|| {
                self.dep_graph.add_node(*dep)
            });
            self.dep_graph.add_edge(dep_node, cell_node, ());
        }
        
        self.formulas.insert(cell, formula);
    }

    /// Recalculate a cell and all its dependents
    pub fn recalculate(&mut self, grid: &mut Grid, changed: CellRef) -> Result<Vec<CellRef>, FormulaError> {
        let mut affected = vec![changed];
        
        // Get all cells that depend on this one (transitively)
        if let Some(&node) = self.cell_to_node.get(&changed) {
            let mut to_visit = vec![node];
            let mut visited = HashSet::new();
            visited.insert(node);
            
            while let Some(current) = to_visit.pop() {
                for neighbor in self.dep_graph.neighbors(current) {
                    if visited.insert(neighbor) {
                        to_visit.push(neighbor);
                        affected.push(self.dep_graph[neighbor]);
                    }
                }
            }
        }
        
        // Sort by dependency order
        if let Ok(sorted) = toposort(&self.dep_graph, None) {
            let sorted_cells: Vec<CellRef> = sorted.into_iter()
                .map(|idx| self.dep_graph[idx])
                .filter(|cell| affected.contains(cell))
                .collect();
            
            // Recalculate in order
            for cell in &sorted_cells {
                if let Some(formula) = self.formulas.get(cell).cloned() {
                    let value = self.evaluate(&formula.ast, grid)?;
                    grid.set_computed_value(*cell, value)?;
                }
            }
            
            Ok(sorted_cells)
        } else {
            Err(FormulaError::CircularReference)
        }
    }
}

impl Default for FormulaEngine {
    fn default() -> Self {
        Self::new()
    }
}
