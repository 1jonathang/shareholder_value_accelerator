/**
 * Agent API Route
 * Server-side endpoint for Grok AI agent interactions
 * All AI requests go through the server for security
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeAgent, streamAgent } from '@/lib/grok';
import type { AgentContext, AgentRequest, AgentStreamEvent } from '@/lib/grok/types';
import { z } from 'zod';

// Request validation schema
const AgentRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  context: z.object({
    sheetId: z.string(),
    tabId: z.string(),
    selectedRange: z.object({
      startRow: z.number(),
      startCol: z.number(),
      endRow: z.number(),
      endCol: z.number(),
    }).optional(),
    visibleData: z.object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
    }).optional(),
  }),
  stream: z.boolean().optional(),
});

/**
 * Rate limiting (simple in-memory implementation)
 * In production, use Redis or similar
 */
const rateLimits = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(userId);
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(userId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (limit.count >= 30) { // 30 requests per minute
    return false;
  }
  
  limit.count++;
  return true;
}

/**
 * POST /api/agent
 * Execute an agent request (non-streaming)
 */
export async function POST(request: NextRequest) {
  try {
    // TODO: Get user ID from auth session
    const userId = 'anonymous';
    
    // Rate limiting
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before making more requests.' },
        { status: 429 }
      );
    }
    
    // Parse and validate request
    const body = await request.json();
    const validationResult = AgentRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }
    
    const { query, context, stream } = validationResult.data;
    
    // Handle streaming requests
    if (stream) {
      return handleStreamingRequest(query, context);
    }
    
    // Execute agent
    const result = await executeAgent(query, context);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Agent API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Handle streaming response using Server-Sent Events
 */
function handleStreamingRequest(query: string, context: AgentContext): Response {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = streamAgent(query, context);
        
        for await (const event of generator) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
        
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        const errorEvent: AgentStreamEvent = {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * GET /api/agent
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    model: 'grok-4-1-fast-reasoning',
    tools: ['web_search', 'code_execution', 'update_cells', 'format_range', 'create_tab'],
  });
}

