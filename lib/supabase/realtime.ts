/**
 * Supabase Realtime integration for collaborative editing
 * Implements presence, cursor tracking, and cell change broadcasting
 */

import { supabase } from './client';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import type { RealtimePresence, RealtimeCellUpdate } from './types';

// Generate a random user color
function generateUserColor(): string {
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export interface CollaborationState {
  users: Map<string, RealtimePresence>;
  onUserJoin?: (user: RealtimePresence) => void;
  onUserLeave?: (userId: string) => void;
  onCursorMove?: (userId: string, cursor: { row: number; col: number }) => void;
  onCellUpdate?: (update: RealtimeCellUpdate) => void;
}

/**
 * Collaboration manager for a single sheet
 */
export class SheetCollaboration {
  private channel: RealtimeChannel | null = null;
  private sheetId: string;
  private userId: string;
  private userName: string;
  private userColor: string;
  private state: CollaborationState;

  constructor(
    sheetId: string,
    userId: string,
    userName: string,
    callbacks: Partial<Pick<CollaborationState, 'onUserJoin' | 'onUserLeave' | 'onCursorMove' | 'onCellUpdate'>> = {}
  ) {
    this.sheetId = sheetId;
    this.userId = userId;
    this.userName = userName;
    this.userColor = generateUserColor();
    this.state = {
      users: new Map(),
      ...callbacks,
    };
  }

  /**
   * Join the collaboration session
   */
  async join(): Promise<void> {
    if (this.channel) {
      await this.leave();
    }

    this.channel = supabase.channel(`sheet:${this.sheetId}`, {
      config: {
        presence: {
          key: this.userId,
        },
      },
    });

    // Handle presence sync
    this.channel.on('presence', { event: 'sync' }, () => {
      const presenceState = this.channel!.presenceState() as RealtimePresenceState<RealtimePresence>;
      
      this.state.users.clear();
      for (const [userId, presences] of Object.entries(presenceState)) {
        if (presences.length > 0) {
          this.state.users.set(userId, presences[0] as unknown as RealtimePresence);
        }
      }
    });

    // Handle user join
    this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      if (newPresences.length > 0 && key !== this.userId) {
        const user = newPresences[0] as unknown as RealtimePresence;
        this.state.users.set(key, user);
        this.state.onUserJoin?.(user);
      }
    });

    // Handle user leave
    this.channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key !== this.userId) {
        this.state.users.delete(key);
        this.state.onUserLeave?.(key);
      }
    });

    // Handle cursor movements
    this.channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      const { userId, cursor } = payload as { userId: string; cursor: { row: number; col: number } };
      if (userId !== this.userId) {
        const user = this.state.users.get(userId);
        if (user) {
          user.cursor = cursor;
          this.state.onCursorMove?.(userId, cursor);
        }
      }
    });

    // Handle cell updates
    this.channel.on('broadcast', { event: 'cell_update' }, ({ payload }) => {
      const update = payload as RealtimeCellUpdate;
      if (update.user_id !== this.userId) {
        this.state.onCellUpdate?.(update);
      }
    });

    // Subscribe and track presence
    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.channel!.track({
          odor_id: this.userId,
          user_name: this.userName,
          user_color: this.userColor,
        } as RealtimePresence);
      }
    });
  }

  /**
   * Leave the collaboration session
   */
  async leave(): Promise<void> {
    if (this.channel) {
      await this.channel.untrack();
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  /**
   * Broadcast cursor position
   */
  broadcastCursor(row: number, col: number): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'cursor',
      payload: {
        userId: this.userId,
        cursor: { row, col },
      },
    });
  }

  /**
   * Broadcast selection change
   */
  broadcastSelection(selection: { startRow: number; startCol: number; endRow: number; endCol: number }): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'selection',
      payload: {
        userId: this.userId,
        selection,
      },
    });
  }

  /**
   * Broadcast cell update
   */
  broadcastCellUpdate(tabId: string, row: number, col: number, value: string | number | boolean | null, formula?: string): void {
    const update: RealtimeCellUpdate = {
      tab_id: tabId,
      row,
      col,
      value,
      formula,
      user_id: this.userId,
      timestamp: new Date().toISOString(),
    };

    this.channel?.send({
      type: 'broadcast',
      event: 'cell_update',
      payload: update,
    });
  }

  /**
   * Get current collaborators
   */
  getCollaborators(): RealtimePresence[] {
    return Array.from(this.state.users.values()).filter(u => u.odor_id !== this.userId);
  }

  /**
   * Get collaborator by ID
   */
  getCollaborator(userId: string): RealtimePresence | undefined {
    return this.state.users.get(userId);
  }
}

/**
 * Hook for using collaboration in React components
 */
export function createCollaborationHooks() {
  let collaboration: SheetCollaboration | null = null;

  return {
    async connect(
      sheetId: string,
      userId: string,
      userName: string,
      callbacks: Partial<Pick<CollaborationState, 'onUserJoin' | 'onUserLeave' | 'onCursorMove' | 'onCellUpdate'>>
    ): Promise<SheetCollaboration> {
      if (collaboration) {
        await collaboration.leave();
      }
      collaboration = new SheetCollaboration(sheetId, userId, userName, callbacks);
      await collaboration.join();
      return collaboration;
    },

    async disconnect(): Promise<void> {
      if (collaboration) {
        await collaboration.leave();
        collaboration = null;
      }
    },

    getCollaboration(): SheetCollaboration | null {
      return collaboration;
    },
  };
}

/**
 * CRDT-like operation transformer for cell updates
 * Handles concurrent edits with last-writer-wins semantics
 */
export class CellOperationTransformer {
  private pendingOps: Map<string, RealtimeCellUpdate[]> = new Map();
  private lastApplied: Map<string, string> = new Map(); // cell key -> timestamp

  private cellKey(tabId: string, row: number, col: number): string {
    return `${tabId}:${row}:${col}`;
  }

  /**
   * Transform an incoming operation against pending local operations
   * Returns the operation to apply, or null if it should be discarded
   */
  transform(incoming: RealtimeCellUpdate): RealtimeCellUpdate | null {
    const key = this.cellKey(incoming.tab_id, incoming.row, incoming.col);
    const lastAppliedTime = this.lastApplied.get(key);

    // If we have a more recent operation, discard this one
    if (lastAppliedTime && incoming.timestamp < lastAppliedTime) {
      return null;
    }

    return incoming;
  }

  /**
   * Record a locally applied operation
   */
  recordLocal(tabId: string, row: number, col: number, timestamp: string): void {
    const key = this.cellKey(tabId, row, col);
    this.lastApplied.set(key, timestamp);
  }

  /**
   * Clear state for a cell
   */
  clear(tabId: string, row: number, col: number): void {
    const key = this.cellKey(tabId, row, col);
    this.pendingOps.delete(key);
    this.lastApplied.delete(key);
  }

  /**
   * Clear all state
   */
  clearAll(): void {
    this.pendingOps.clear();
    this.lastApplied.clear();
  }
}

