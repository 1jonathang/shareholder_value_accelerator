'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SheetCanvas, type Selection } from './components/grid/SheetCanvas';
import { CommandPalette } from './components/CommandPalette';
import { ChatPanel, type ChatMessage } from './components/ChatPanel';
import { FormulaBar } from './components/FormulaBar';
import { Toolbar, type FormatAction } from './components/Toolbar';
import type { AgentPlan, SheetPatch } from '@/lib/claude/types';
import { useSheetEngine } from './components/grid/useSheetEngine';

export default function Home() {
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAgentExecuting, setIsAgentExecuting] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [cellValue, setCellValue] = useState('');
  const [cellFormula, setCellFormula] = useState<string | null>(null);
  const [history, setHistory] = useState<{ past: unknown[]; future: unknown[] }>({ past: [], future: [] });
  const engineRef = useRef<any>(null);
  const triggerRenderRef = useRef<(() => void) | null>(null);

  // Stable callback for engine ready
  const handleEngineReady = useCallback((engine: any, triggerRender: () => void) => {
    console.log('page.tsx: Engine ready callback called', { engine, hasApplyFormat: engine?.apply_format });
    engineRef.current = engine;
    triggerRenderRef.current = triggerRender;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectionChange = useCallback((sel: Selection) => {
    setSelection(sel);
    // TODO: Get cell value from engine
    setCellValue('');
    setCellFormula(null);
  }, []);

  const handleCellEdit = useCallback((row: number, col: number, value: string) => {
    // TODO: Update history for undo/redo
    console.log('Cell edit:', row, col, value);
  }, []);

  const handleApplyPatch = useCallback((patch: SheetPatch) => {
    const engine = engineRef.current;
    if (!engine) {
      console.warn('Cannot apply patch: engine not ready');
      return;
    }

    switch (patch.type) {
      case 'UPDATE_CELLS': {
        const { updates } = patch.payload;
        for (const update of updates) {
          const value = update.formula || (update.value !== undefined ? String(update.value) : '');
          engine.set_cell(update.row, update.col, value);
        }
        break;
      }
      case 'FORMAT_RANGE': {
        const { range, format } = patch.payload;
        const engineFormat: any = {};
        if (format.fontBold !== undefined) engineFormat.font_bold = format.fontBold;
        if (format.fontItalic !== undefined) engineFormat.font_italic = format.fontItalic;
        if (format.fontSize !== undefined) engineFormat.font_size = format.fontSize;
        if (format.fontColor !== undefined) engineFormat.font_color = format.fontColor;
        if (format.bgColor !== undefined) engineFormat.bg_color = format.bgColor;
        if (format.alignH !== undefined) engineFormat.align_h = format.alignH;
        if (format.numberFormat !== undefined) engineFormat.number_format = format.numberFormat;
        engine.apply_format(range.startRow, range.startCol, range.endRow, range.endCol, engineFormat);
        break;
      }
      case 'CREATE_TAB':
        // TODO: Tab creation not yet supported by engine
        break;
    }

    triggerRenderRef.current?.();
  }, []);

  const handleCommandSubmit = useCallback(async (query: string) => {
    setIsCommandOpen(false);
    setIsChatOpen(true);
    setIsAgentExecuting(true);

    // Add user message to chat
    setChatMessages(prev => [...prev, { type: 'user', text: query, timestamp: new Date().toISOString() }]);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          context: {
            sheetId: 'default',
            tabId: 'tab1',
            selectedRange: selection ? {
              startRow: selection.startRow,
              startCol: selection.startCol,
              endRow: selection.endRow,
              endCol: selection.endCol,
            } : undefined,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || body?.error || `Agent request failed (${response.status})`);
      }

      const data = await response.json();

      // Apply patches to the engine
      if (data.patches && Array.isArray(data.patches)) {
        for (const patch of data.patches) {
          handleApplyPatch(patch);
        }
      }

      // Add plan message to chat
      setChatMessages(prev => [...prev, { type: 'plan', plan: data.plan, patches: data.patches || [] }]);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? (error.name === 'AbortError' ? 'Request timed out' : error.message)
        : 'Unknown error';
      setChatMessages(prev => [...prev, { type: 'error', text: errorMessage, timestamp: new Date().toISOString() }]);
    } finally {
      setIsAgentExecuting(false);
    }
  }, [selection, handleApplyPatch]);

  const handleFormulaChange = useCallback((value: string) => {
    setCellValue(value);
    if (value.startsWith('=')) {
      setCellFormula(value);
    } else {
      setCellFormula(null);
    }
  }, []);

  const handleFormulaSubmit = useCallback(() => {
    if (selection) {
      handleCellEdit(selection.startRow, selection.startCol, cellValue);
    }
  }, [selection, cellValue, handleCellEdit]);

  const handleFormat = useCallback((action: FormatAction) => {
    console.log('handleFormat called:', { action, selection, engine: engineRef.current, triggerRender: triggerRenderRef.current });

    if (!selection) {
      console.warn('Cannot apply format: no selection');
      return;
    }

    if (!engineRef.current) {
      console.warn('Cannot apply format: engine not ready. Waiting for engine...');
      // Try to wait a bit for the engine to be ready
      setTimeout(() => {
        if (engineRef.current) {
          console.log('Engine ready after delay, retrying format');
          handleFormat(action);
        } else {
          console.error('Engine still not ready after delay');
        }
      }, 100);
      return;
    }

    const engine = engineRef.current as any;

    // For toggle formats (bold, italic, underline), check current state
    let shouldToggle = false;
    let currentValue: boolean | undefined = undefined;

    if (action.type === 'bold' || action.type === 'italic' || action.type === 'underline') {
      // Check the format of the first selected cell to determine toggle state
      const firstCell = engine.get_cell?.(selection.startRow, selection.startCol);
      if (firstCell) {
        const cellFormat = (firstCell as any).format;
        if (action.type === 'bold') {
          currentValue = cellFormat?.font_bold;
        } else if (action.type === 'italic') {
          currentValue = cellFormat?.font_italic;
        } else if (action.type === 'underline') {
          currentValue = cellFormat?.font_underline;
        }
        // Toggle: if currently true, set to false; if false or undefined, set to true
        shouldToggle = currentValue === true;
      }
    }

    // Convert FormatAction to CellFormat
    const format: any = {};

    switch (action.type) {
      case 'bold':
        format.font_bold = shouldToggle ? false : true;
        break;
      case 'italic':
        format.font_italic = shouldToggle ? false : true;
        break;
      case 'underline':
        format.font_underline = shouldToggle ? false : true;
        break;
      case 'fontFamily':
        format.font_family = action.value;
        break;
      case 'fontSize':
        format.font_size = action.value;
        break;
      case 'textColor':
        format.font_color = action.value;
        break;
      case 'bgColor':
        format.bg_color = action.value;
        break;
      case 'align':
        format.align_h = action.value;
        break;
      case 'numberFormat':
        format.number_format = action.value;
        break;
    }

    try {
      console.log('Applying format:', { action, format, selection, engine, hasApplyFormat: engine?.apply_format });
      // Apply format to the selected range
      if (engine && engine.apply_format) {
        engine.apply_format(
          selection.startRow,
          selection.startCol,
          selection.endRow,
          selection.endCol,
          format
        );
        console.log('Format applied, triggering render');
        // Trigger a re-render to show the formatting changes
        if (triggerRenderRef.current) {
          triggerRenderRef.current();
        } else {
          console.warn('triggerRenderRef not set');
        }
      } else {
        console.warn('Engine not ready or apply_format not available', { engine, hasApplyFormat: engine?.apply_format });
      }
    } catch (error) {
      console.error('Failed to apply format:', error);
    }
  }, [selection]);

  const handleUndo = useCallback(() => {
    // TODO: Implement undo
  }, []);

  const handleRedo = useCallback(() => {
    // TODO: Implement redo
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="flex items-center h-12 px-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Ramp Sheets</h1>
        </div>

        <div className="flex-1" />

        {/* AI Button */}
        <button
          onClick={() => setIsChatOpen(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-all shadow-sm ${
            isChatOpen
              ? 'text-indigo-700 bg-indigo-100 hover:bg-indigo-200'
              : 'text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Ask Claude
          <kbd className="hidden sm:inline px-1.5 py-0.5 text-xs bg-white/20 rounded">⌘K</kbd>
        </button>
      </header>

      {/* Toolbar */}
      <Toolbar
        onFormat={handleFormat}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
      />

      {/* Formula Bar */}
      <FormulaBar
        selectedCell={selection ? { row: selection.startRow, col: selection.startCol } : null}
        cellValue={cellValue}
        cellFormula={cellFormula}
        onFormulaChange={handleFormulaChange}
        onFormulaSubmit={handleFormulaSubmit}
      />

      {/* Main Content — flex row with sheet + optional chat panel */}
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          <SheetCanvas
            sheetId="default"
            tabId="tab1"
            onSelectionChange={handleSelectionChange}
            onCellEdit={handleCellEdit}
            onEngineReady={handleEngineReady}
          />
        </div>
        {isChatOpen && (
          <ChatPanel
            onSubmit={handleCommandSubmit}
            messages={chatMessages}
            isExecuting={isAgentExecuting}
          />
        )}
      </main>

      {/* Tab Bar */}
      <footer className="flex items-center h-8 px-2 bg-white border-t border-slate-200">
        <button className="flex items-center justify-center w-6 h-6 hover:bg-slate-100 rounded transition-colors">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="flex items-center gap-1 ml-2">
          <button className="px-3 py-1 text-sm font-medium text-slate-700 bg-slate-100 rounded-t border-b-2 border-emerald-500">
            Sheet1
          </button>
        </div>
      </footer>

      {/* Command Palette (Cmd+K shortcut) */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onSubmit={handleCommandSubmit}
      />
    </div>
  );
}
