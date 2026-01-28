'use client';

import { useEffect, useRef, useState } from 'react';

interface CellEditorProps {
  initialValue: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  zoom?: number;
  onComplete: (value: string, moveDown?: boolean) => void;
  onCancel: () => void;
}

export function CellEditor({ initialValue, position, zoom = 1, onComplete, onCancel }: CellEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const ignoreNextInputRef = useRef(initialValue.length === 1);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      // Use requestAnimationFrame to ensure the input is fully mounted
      requestAnimationFrame(() => {
        input.focus();
        // If starting with a single character (from keypress), put cursor at end
        // Otherwise select all for editing existing values
        if (initialValue.length === 1 && ignoreNextInputRef.current) {
          // Single character from keypress - cursor at end
          input.setSelectionRange(1, 1);
        } else if (initialValue.length > 1) {
          // Existing value - select all
          input.select();
        } else {
          // Empty - cursor at start
          input.setSelectionRange(0, 0);
        }
      });
    }
  }, [initialValue]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    // If we're ignoring the next input (because it's the keypress that started editing),
    // and the new value is just the initial value repeated, skip it
    if (ignoreNextInputRef.current && initialValue.length === 1) {
      const newValue = e.target.value;
      // If the new value is the initial character duplicated (e.g., 'a' -> 'aa'),
      // use just the initial value instead
      if (newValue === initialValue + initialValue) {
        setValue(initialValue);
        ignoreNextInputRef.current = false;
        // Set cursor position
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.setSelectionRange(1, 1);
          }
        });
        return;
      }
      ignoreNextInputRef.current = false;
    }
    setValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        e.stopPropagation();
        onComplete(value, true); // Move down on Enter
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        break;
      case 'Tab':
        e.preventDefault();
        e.stopPropagation();
        onComplete(value, false); // Don't move down on Tab
        break;
    }
  };

  const handleBlur = () => {
    // Don't move selection on blur
    onComplete(value, false);
  };

  // Calculate font size based on zoom (base size 13px, same as canvas rendering)
  const fontSize = Math.max(8, 13 * zoom);
  const padding = 4 * zoom;
  const borderWidth = Math.max(1, 2 * zoom);

  return (
    <input
      ref={inputRef}
      data-testid="cell-editor"
      type="text"
      value={value}
      onChange={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="absolute border-blue-500 bg-white font-sans outline-none"
      style={{
        left: position.x,
        top: position.y,
        width: Math.max(position.width, 100 * zoom),
        height: position.height,
        minWidth: 100 * zoom,
        fontSize: `${fontSize}px`,
        paddingLeft: `${padding}px`,
        paddingRight: `${padding}px`,
        borderWidth: `${borderWidth}px`,
        borderStyle: 'solid',
        zIndex: 100,
      }}
    />
  );
}

