'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { 
  SheetCollaboration, 
  CellOperationTransformer,
  type CollaborationState 
} from '@/lib/supabase/realtime';
import type { RealtimePresence, RealtimeCellUpdate } from '@/lib/supabase/types';

interface UseCollaborationOptions {
  sheetId: string;
  userId: string;
  userName: string;
  enabled?: boolean;
}

interface UseCollaborationReturn {
  collaborators: RealtimePresence[];
  isConnected: boolean;
  broadcastCursor: (row: number, col: number) => void;
  broadcastSelection: (selection: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  broadcastCellUpdate: (tabId: string, row: number, col: number, value: string | number | boolean | null, formula?: string) => void;
}

/**
 * React hook for real-time collaboration
 */
export function useCollaboration(
  options: UseCollaborationOptions,
  callbacks: {
    onCellUpdate?: (update: RealtimeCellUpdate) => void;
    onCursorMove?: (userId: string, cursor: { row: number; col: number }) => void;
  } = {}
): UseCollaborationReturn {
  const { sheetId, userId, userName, enabled = true } = options;
  const [collaborators, setCollaborators] = useState<RealtimePresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const collaborationRef = useRef<SheetCollaboration | null>(null);
  const transformerRef = useRef(new CellOperationTransformer());

  // Update collaborators list
  const updateCollaborators = useCallback(() => {
    if (collaborationRef.current) {
      setCollaborators(collaborationRef.current.getCollaborators());
    }
  }, []);

  // Handle incoming cell updates with CRDT transformation
  const handleCellUpdate = useCallback((update: RealtimeCellUpdate) => {
    const transformed = transformerRef.current.transform(update);
    if (transformed) {
      callbacks.onCellUpdate?.(transformed);
    }
  }, [callbacks]);

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (!enabled) {
      if (collaborationRef.current) {
        collaborationRef.current.leave();
        collaborationRef.current = null;
        setIsConnected(false);
        setCollaborators([]);
      }
      return;
    }

    const collaboration = new SheetCollaboration(sheetId, userId, userName, {
      onUserJoin: (user) => {
        updateCollaborators();
      },
      onUserLeave: (leftUserId) => {
        updateCollaborators();
      },
      onCursorMove: callbacks.onCursorMove,
      onCellUpdate: handleCellUpdate,
    });

    collaborationRef.current = collaboration;

    collaboration.join()
      .then(() => {
        setIsConnected(true);
        updateCollaborators();
      })
      .catch((error) => {
        console.error('Failed to join collaboration:', error);
        setIsConnected(false);
      });

    return () => {
      collaboration.leave();
      collaborationRef.current = null;
      setIsConnected(false);
    };
  }, [sheetId, userId, userName, enabled, updateCollaborators, handleCellUpdate, callbacks.onCursorMove]);

  // Broadcast cursor position
  const broadcastCursor = useCallback((row: number, col: number) => {
    collaborationRef.current?.broadcastCursor(row, col);
  }, []);

  // Broadcast selection
  const broadcastSelection = useCallback((selection: { startRow: number; startCol: number; endRow: number; endCol: number }) => {
    collaborationRef.current?.broadcastSelection(selection);
  }, []);

  // Broadcast cell update with local recording
  const broadcastCellUpdate = useCallback((
    tabId: string, 
    row: number, 
    col: number, 
    value: string | number | boolean | null, 
    formula?: string
  ) => {
    const timestamp = new Date().toISOString();
    transformerRef.current.recordLocal(tabId, row, col, timestamp);
    collaborationRef.current?.broadcastCellUpdate(tabId, row, col, value, formula);
  }, []);

  return {
    collaborators,
    isConnected,
    broadcastCursor,
    broadcastSelection,
    broadcastCellUpdate,
  };
}

/**
 * Collaborator cursors overlay component props
 */
export interface CollaboratorCursor {
  userId: string;
  userName: string;
  color: string;
  row: number;
  col: number;
}

/**
 * Hook to track collaborator cursors
 */
export function useCollaboratorCursors(
  collaborators: RealtimePresence[]
): CollaboratorCursor[] {
  return collaborators
    .filter(c => c.cursor)
    .map(c => ({
      userId: c.odor_id,
      userName: c.user_name,
      color: c.user_color,
      row: c.cursor!.row,
      col: c.cursor!.col,
    }));
}

