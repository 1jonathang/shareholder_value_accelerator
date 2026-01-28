/**
 * Types for Grok AI Agent integration
 * Following the xAI SDK patterns for tool use
 */

import { z } from 'zod';

// SheetPatch schema - the response format from the agent
export const SheetPatchSchema = z.object({
  type: z.enum(['UPDATE_CELLS', 'CREATE_TAB', 'FORMAT_RANGE', 'DELETE_TAB', 'RENAME_TAB']),
  payload: z.any(),
  reasoning: z.string().describe('The visible reasoning step explaining the action'),
});

export type SheetPatch = z.infer<typeof SheetPatchSchema>;

// Specific payload types
export const UpdateCellsPayloadSchema = z.object({
  tabId: z.string().optional(),
  updates: z.array(z.object({
    row: z.number(),
    col: z.number(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    formula: z.string().optional(),
  })),
});

export type UpdateCellsPayload = z.infer<typeof UpdateCellsPayloadSchema>;

export const FormatRangePayloadSchema = z.object({
  tabId: z.string().optional(),
  range: z.object({
    startRow: z.number(),
    startCol: z.number(),
    endRow: z.number(),
    endCol: z.number(),
  }),
  format: z.object({
    numberFormat: z.string().optional(),
    fontBold: z.boolean().optional(),
    fontItalic: z.boolean().optional(),
    fontSize: z.number().optional(),
    fontColor: z.string().optional(),
    bgColor: z.string().optional(),
    alignH: z.enum(['left', 'center', 'right']).optional(),
    alignV: z.enum(['top', 'middle', 'bottom']).optional(),
  }),
});

export type FormatRangePayload = z.infer<typeof FormatRangePayloadSchema>;

export const CreateTabPayloadSchema = z.object({
  name: z.string(),
  rows: z.number().default(1000),
  cols: z.number().default(26),
});

export type CreateTabPayload = z.infer<typeof CreateTabPayloadSchema>;

// Agent plan types
export const AgentPlanStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  result: z.string().optional(),
  patch: SheetPatchSchema.optional(),
});

export type AgentPlanStep = z.infer<typeof AgentPlanStepSchema>;

export const AgentPlanSchema = z.object({
  id: z.string(),
  userQuery: z.string(),
  steps: z.array(AgentPlanStepSchema),
  status: z.enum(['planning', 'executing', 'completed', 'failed']),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

export type AgentPlan = z.infer<typeof AgentPlanSchema>;

// Tool definitions for Grok
export interface GrokTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Web search result type
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

// Code execution result type
export interface CodeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  returnValue?: unknown;
}

// Agent context passed to each request
export interface AgentContext {
  sheetId: string;
  tabId: string;
  selectedRange?: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
  visibleData?: {
    headers: string[];
    rows: (string | number | boolean | null)[][];
  };
  recentChanges?: SheetPatch[];
}

// Agent request/response types
export interface AgentRequest {
  query: string;
  context: AgentContext;
  stream?: boolean;
}

export interface AgentResponse {
  plan: AgentPlan;
  patches: SheetPatch[];
}

// Streaming event types
export type AgentStreamEvent = 
  | { type: 'plan_start'; plan: Omit<AgentPlan, 'steps'> & { steps: [] } }
  | { type: 'step_added'; step: AgentPlanStep }
  | { type: 'step_update'; stepId: string; status: AgentPlanStep['status']; result?: string }
  | { type: 'patch'; patch: SheetPatch }
  | { type: 'reasoning'; text: string }
  | { type: 'error'; message: string }
  | { type: 'complete'; plan: AgentPlan };

