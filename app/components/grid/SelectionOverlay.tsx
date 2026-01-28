'use client';

interface SelectionOverlayProps {
  selection: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
  viewport: {
    startRow: number;
    startCol: number;
    offsetX: number;
    offsetY: number;
    zoom: number;
  };
  headerWidth: number;
  headerHeight: number;
  defaultColWidth: number;
  defaultRowHeight: number;
}

export function SelectionOverlay({
  selection,
  viewport,
  headerWidth,
  headerHeight,
  defaultColWidth,
  defaultRowHeight,
}: SelectionOverlayProps) {
  const zoom = viewport.zoom;
  const scaledHeaderWidth = headerWidth * zoom;
  const scaledHeaderHeight = headerHeight * zoom;
  const scaledColWidth = defaultColWidth * zoom;
  const scaledRowHeight = defaultRowHeight * zoom;

  const x = scaledHeaderWidth + 
    (selection.startCol - viewport.startCol) * scaledColWidth - 
    viewport.offsetX;
  const y = scaledHeaderHeight + 
    (selection.startRow - viewport.startRow) * scaledRowHeight - 
    viewport.offsetY;
  const width = (selection.endCol - selection.startCol + 1) * scaledColWidth;
  const height = (selection.endRow - selection.startRow + 1) * scaledRowHeight;

  return (
    <div
      className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/10"
      style={{
        left: x,
        top: y,
        width,
        height,
      }}
    >
      {/* Corner handle for drag-fill */}
      <div 
        className="absolute -bottom-1 -right-1 h-2 w-2 bg-blue-500 cursor-crosshair pointer-events-auto"
      />
    </div>
  );
}

