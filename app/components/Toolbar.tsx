'use client';

interface ToolbarProps {
  onFormat: (format: FormatAction) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export type FormatAction = 
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'align'; value: 'left' | 'center' | 'right' }
  | { type: 'numberFormat'; value: string }
  | { type: 'fontFamily'; value: string }
  | { type: 'fontSize'; value: number }
  | { type: 'textColor'; value: string }
  | { type: 'bgColor'; value: string };

function ToolbarButton({ 
  onClick, 
  disabled, 
  title, 
  children 
}: { 
  onClick: () => void; 
  disabled?: boolean; 
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-slate-200 mx-1" />;
}

export function Toolbar({ onFormat, onUndo, onRedo, canUndo, canRedo }: ToolbarProps) {
  return (
    <div className="flex items-center h-10 px-2 gap-0.5 bg-white border-b border-slate-200">
      {/* Undo/Redo */}
      <ToolbarButton onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)">
        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)">
        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Font controls */}
      <select 
        className="h-7 px-2 text-sm border border-slate-200 rounded bg-white outline-none hover:border-slate-300"
        onChange={(e) => onFormat({ type: 'fontFamily', value: e.target.value })}
        defaultValue="Inter"
      >
        <option value="Inter">Inter</option>
        <option value="Arial">Arial</option>
        <option value="Helvetica">Helvetica</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Courier New">Courier New</option>
      </select>

      <select 
        className="h-7 w-14 px-2 text-sm border border-slate-200 rounded bg-white outline-none hover:border-slate-300 ml-1"
        onChange={(e) => onFormat({ type: 'fontSize', value: parseInt(e.target.value) })}
        defaultValue="12"
      >
        {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(size => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>

      <ToolbarDivider />

      {/* Text formatting */}
      <ToolbarButton onClick={() => onFormat({ type: 'bold' })} title="Bold (⌘B)">
        <span className="font-bold text-slate-600">B</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => onFormat({ type: 'italic' })} title="Italic (⌘I)">
        <span className="italic text-slate-600">I</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => onFormat({ type: 'underline' })} title="Underline (⌘U)">
        <span className="underline text-slate-600">U</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton onClick={() => onFormat({ type: 'align', value: 'left' })} title="Align left">
        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => onFormat({ type: 'align', value: 'center' })} title="Align center">
        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M4 18h16" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => onFormat({ type: 'align', value: 'right' })} title="Align right">
        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M4 18h16" />
        </svg>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Number formatting */}
      <ToolbarButton onClick={() => onFormat({ type: 'numberFormat', value: '$#,##0.00' })} title="Currency format">
        <span className="text-slate-600 font-medium">$</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => onFormat({ type: 'numberFormat', value: '0.00%' })} title="Percent format">
        <span className="text-slate-600 font-medium">%</span>
      </ToolbarButton>
      <ToolbarButton onClick={() => onFormat({ type: 'numberFormat', value: '#,##0.00' })} title="Number format">
        <span className="text-slate-600 font-mono text-xs">.00</span>
      </ToolbarButton>

      <ToolbarDivider />

      {/* Colors */}
      <div className="relative">
        <ToolbarButton onClick={() => {}} title="Text color">
          <div className="flex flex-col items-center">
            <span className="text-slate-600 font-medium text-sm">A</span>
            <div className="w-4 h-1 bg-slate-600 -mt-0.5" />
          </div>
        </ToolbarButton>
      </div>
      <div className="relative">
        <ToolbarButton onClick={() => {}} title="Fill color">
          <svg className="w-4 h-4 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z" />
          </svg>
        </ToolbarButton>
      </div>
    </div>
  );
}

