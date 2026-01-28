'use client';

import type { CollaboratorCursor } from '@/app/hooks/useCollaboration';

interface CollaboratorCursorsProps {
  cursors: CollaboratorCursor[];
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

export function CollaboratorCursors({
  cursors,
  viewport,
  headerWidth,
  headerHeight,
  defaultColWidth,
  defaultRowHeight,
}: CollaboratorCursorsProps) {
  const zoom = viewport.zoom;
  const scaledHeaderWidth = headerWidth * zoom;
  const scaledHeaderHeight = headerHeight * zoom;
  const scaledColWidth = defaultColWidth * zoom;
  const scaledRowHeight = defaultRowHeight * zoom;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {cursors.map((cursor) => {
        // Calculate position
        const x = scaledHeaderWidth + 
          (cursor.col - viewport.startCol) * scaledColWidth - 
          viewport.offsetX;
        const y = scaledHeaderHeight + 
          (cursor.row - viewport.startRow) * scaledRowHeight - 
          viewport.offsetY;

        // Don't render if outside viewport
        if (x < scaledHeaderWidth || y < scaledHeaderHeight) {
          return null;
        }

        return (
          <div
            key={cursor.userId}
            className="absolute transition-all duration-100 ease-out"
            style={{
              left: x,
              top: y,
              width: scaledColWidth,
              height: scaledRowHeight,
            }}
          >
            {/* Cursor outline */}
            <div
              className="absolute inset-0 border-2"
              style={{ borderColor: cursor.color }}
            />

            {/* User name tag */}
            <div
              className="absolute -top-6 left-0 px-2 py-0.5 text-xs font-medium text-white rounded-t whitespace-nowrap"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.userName}
            </div>

            {/* Caret indicator */}
            <div
              className="absolute -top-0.5 -left-0.5 w-0 h-0"
              style={{
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: `6px solid ${cursor.color}`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

