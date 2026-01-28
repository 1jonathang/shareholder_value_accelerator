'use client';

import { useState, useEffect, useCallback } from 'react';

interface FormulaBarProps {
  selectedCell: { row: number; col: number } | null;
  cellValue: string;
  cellFormula: string | null;
  onFormulaChange: (value: string) => void;
  onFormulaSubmit: () => void;
}

function colToLetter(col: number): string {
  let result = '';
  let n = col;
  do {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
}

export function FormulaBar({ 
  selectedCell, 
  cellValue, 
  cellFormula, 
  onFormulaChange,
  onFormulaSubmit 
}: FormulaBarProps) {
  const [localValue, setLocalValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(cellFormula || cellValue);
    }
  }, [cellFormula, cellValue, isFocused]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onFormulaChange(localValue);
      onFormulaSubmit();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setLocalValue(cellFormula || cellValue);
      (e.target as HTMLInputElement).blur();
    }
  }, [localValue, cellFormula, cellValue, onFormulaChange, onFormulaSubmit]);

  const cellRef = selectedCell 
    ? `${colToLetter(selectedCell.col)}${selectedCell.row + 1}`
    : '';

  return (
    <div 
      className="flex items-center h-9 px-2 gap-2 bg-white border-b border-slate-200"
      data-testid="formula-bar"
    >
      {/* Cell reference */}
      <div className="flex items-center justify-center w-16 h-7 px-2 bg-slate-100 rounded text-sm font-mono text-slate-700">
        {cellRef}
      </div>

      {/* Function button */}
      <button className="flex items-center justify-center w-7 h-7 hover:bg-slate-100 rounded transition-colors">
        <span className="text-slate-500 font-serif italic text-sm">fx</span>
      </button>

      {/* Divider */}
      <div className="w-px h-5 bg-slate-200" />

      {/* Formula input */}
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          if (localValue !== (cellFormula || cellValue)) {
            onFormulaChange(localValue);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder="Enter value or formula"
        className="flex-1 h-7 px-2 text-sm bg-transparent outline-none placeholder:text-slate-400"
      />

      {/* Show formula indicator */}
      {cellFormula && (
        <div className="px-2 py-1 text-xs font-medium text-violet-600 bg-violet-50 rounded">
          Formula
        </div>
      )}
    </div>
  );
}

