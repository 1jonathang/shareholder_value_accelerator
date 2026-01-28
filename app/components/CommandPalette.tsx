'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (query: string) => void;
}

export function CommandPalette({ isOpen, onClose, onSubmit }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSubmit(query.trim());
      setQuery('');
    }
  }, [query, onSubmit]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      data-testid="command-palette"
    >
      <div 
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <input
              ref={inputRef}
              data-testid="command-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask Grok to analyze, model, or edit your spreadsheet..."
              className="flex-1 text-lg bg-transparent outline-none placeholder:text-slate-400"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 bg-slate-100 rounded">
              <span>⌘</span>
              <span>K</span>
            </kbd>
          </div>
        </form>
        
        <div className="px-4 py-3 bg-slate-50">
          <p className="text-xs text-slate-500">
            <span className="font-medium">Examples:</span>{' '}
            "Create a 3-year revenue projection" • 
            "Calculate IRR for these cash flows" • 
            "Build a SaaS metrics dashboard"
          </p>
        </div>

        <div className="px-4 py-2 border-t border-slate-100 bg-white">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">↵</kbd>
              Submit
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">esc</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

