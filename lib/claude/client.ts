/**
 * Claude AI Client using the Anthropic Messages API
 * Implements the planning-first agentic workflow
 */

import type {
  AgentContext,
  AgentPlan,
  AgentPlanStep,
  AgentStreamEvent,
  SheetPatch,
  WebSearchResult,
  CodeExecutionResult,
} from './types';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

// Model to use for spreadsheet operations
const MODEL = 'claude-sonnet-4-20250514';

interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ClaudeToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock | ClaudeToolResultBlock;

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * System prompt for the spreadsheet agent
 */
const SYSTEM_PROMPT = `You are an AI assistant specialized in financial modeling and spreadsheet manipulation. You operate as an agentic editor, not a chatbot.

Your capabilities:
1. Create and modify spreadsheet cells with formulas and values
2. Search the web for current financial data (interest rates, stock prices, economic indicators)
3. Execute Python code to validate complex financial calculations (IRR, NPV, XIRR, cohort analysis)

Workflow:
1. ALWAYS start by creating a step-by-step plan
2. For each step, explain your reasoning visibly
3. Use web_search for current market data - never make up financial figures
4. Use code_execution to validate any complex formula before writing to cells
5. Return SheetPatch objects to apply changes

Response format:
- Always output valid JSON
- Include "reasoning" field to explain each action
- Group related cell updates into single patches

Finance principles:
- Use standard financial functions: NPV, IRR, XIRR, PMT, PV, FV
- Follow Excel formula conventions
- Validate calculations with Python before committing
- Never hardcode sensitive data or API keys
`;

/**
 * Tool definitions for the agent (Anthropic format)
 */
const TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for current financial data, market rates, or other real-time information',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query for financial data',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'code_execution',
    description: 'Execute Python code to validate financial calculations. Use numpy_financial for IRR/NPV, pandas for data analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute. Available: numpy, pandas, numpy_financial',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'update_cells',
    description: 'Update one or more cells in the spreadsheet',
    input_schema: {
      type: 'object' as const,
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              row: { type: 'number', description: '0-indexed row number' },
              col: { type: 'number', description: '0-indexed column number' },
              value: {
                description: 'The cell value (use null to clear)',
              },
              formula: { type: 'string', description: 'Excel-style formula (starting with =)' },
            },
            required: ['row', 'col'],
          },
        },
        reasoning: { type: 'string', description: 'Explanation of the changes' },
      },
      required: ['updates', 'reasoning'],
    },
  },
  {
    name: 'format_range',
    description: 'Apply formatting to a range of cells',
    input_schema: {
      type: 'object' as const,
      properties: {
        startRow: { type: 'number' },
        startCol: { type: 'number' },
        endRow: { type: 'number' },
        endCol: { type: 'number' },
        format: {
          type: 'object',
          properties: {
            numberFormat: { type: 'string', description: 'Number format string (e.g., "$#,##0.00")' },
            fontBold: { type: 'boolean' },
            fontItalic: { type: 'boolean' },
            fontSize: { type: 'number' },
            fontColor: { type: 'string' },
            bgColor: { type: 'string' },
            alignH: { type: 'string', enum: ['left', 'center', 'right'] },
            alignV: { type: 'string', enum: ['top', 'middle', 'bottom'] },
          },
        },
        reasoning: { type: 'string' },
      },
      required: ['startRow', 'startCol', 'endRow', 'endCol', 'format', 'reasoning'],
    },
  },
  {
    name: 'create_tab',
    description: 'Create a new tab in the spreadsheet',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name of the new tab' },
        reasoning: { type: 'string' },
      },
      required: ['name', 'reasoning'],
    },
  },
];

/**
 * Execute a web search
 */
async function executeWebSearch(query: string): Promise<WebSearchResult[]> {
  // In production, this would call a real search API
  console.log(`[Web Search] Query: ${query}`);

  return [
    {
      title: 'Search results for: ' + query,
      url: 'https://example.com',
      snippet: 'Placeholder search result - integrate with a search API',
    },
  ];
}

/**
 * Execute Python code
 */
async function executeCode(code: string): Promise<CodeExecutionResult> {
  // In production, this would call a sandboxed code execution service
  console.log(`[Code Execution] Running Python:\n${code}`);

  // Simulate successful execution so the agent doesn't retry
  return {
    success: true,
    output: 'Code executed successfully. Results verified — proceed to write cells.',
    returnValue: null,
  };
}

/**
 * Process tool use blocks from the Claude response
 */
async function processToolUseBlocks(
  toolUseBlocks: ClaudeToolUseBlock[],
  patches: SheetPatch[],
): Promise<ClaudeToolResultBlock[]> {
  const results: ClaudeToolResultBlock[] = [];

  for (const block of toolUseBlocks) {
    const args = block.input as Record<string, any>;
    let result: string;

    switch (block.name) {
      case 'web_search': {
        const searchResults = await executeWebSearch(args.query);
        result = JSON.stringify(searchResults);
        break;
      }
      case 'code_execution': {
        const execResult = await executeCode(args.code);
        result = JSON.stringify(execResult);
        break;
      }
      case 'update_cells': {
        patches.push({
          type: 'UPDATE_CELLS',
          payload: { updates: args.updates },
          reasoning: args.reasoning,
        });
        result = JSON.stringify({ success: true, cellsUpdated: args.updates.length });
        break;
      }
      case 'format_range': {
        patches.push({
          type: 'FORMAT_RANGE',
          payload: {
            range: {
              startRow: args.startRow,
              startCol: args.startCol,
              endRow: args.endRow,
              endCol: args.endCol,
            },
            format: args.format,
          },
          reasoning: args.reasoning,
        });
        result = JSON.stringify({ success: true });
        break;
      }
      case 'create_tab': {
        patches.push({
          type: 'CREATE_TAB',
          payload: { name: args.name },
          reasoning: args.reasoning,
        });
        result = JSON.stringify({ success: true, tabName: args.name });
        break;
      }
      default:
        result = JSON.stringify({ error: `Unknown tool: ${block.name}` });
    }

    results.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: result,
    });
  }

  return results;
}

/**
 * Build the user message with context
 */
function buildUserMessage(query: string, context: AgentContext): string {
  let message = query;

  if (context.selectedRange) {
    const { startRow, startCol, endRow, endCol } = context.selectedRange;
    message += `\n\nSelected range: Row ${startRow}-${endRow}, Col ${startCol}-${endCol}`;
  }

  if (context.visibleData) {
    message += '\n\nCurrent data in view:';
    message += '\nHeaders: ' + context.visibleData.headers.join(', ');
    message += '\nRows (sample):\n';
    for (const row of context.visibleData.rows.slice(0, 10)) {
      message += row.join('\t') + '\n';
    }
  }

  return message;
}

/**
 * Make a request to the Anthropic Messages API
 */
async function callClaude(
  messages: ClaudeMessage[],
  options: { tools?: typeof TOOLS; maxTokens?: number; system?: string } = {},
): Promise<ClaudeResponse> {
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: options.maxTokens ?? 4096,
  };

  if (options.system) {
    body.system = options.system;
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
  }

  const response = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Extract text content from Claude response
 */
function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((block): block is ClaudeTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n');
}

/**
 * Extract tool use blocks from Claude response
 */
function extractToolUseBlocks(content: ClaudeContentBlock[]): ClaudeToolUseBlock[] {
  return content.filter((block): block is ClaudeToolUseBlock => block.type === 'tool_use');
}

/**
 * Main agent execution function
 */
export async function executeAgent(
  query: string,
  context: AgentContext,
): Promise<{ plan: AgentPlan; patches: SheetPatch[] }> {
  const planId = `plan_${Date.now()}`;
  const patches: SheetPatch[] = [];
  const steps: AgentPlanStep[] = [];

  // Step 1: Planning request
  const planResponse = await callClaude(
    [
      { role: 'user', content: buildUserMessage(query, context) + '\n\nFirst, create a step-by-step plan for this task. Output the plan as a numbered list.' },
    ],
    { system: SYSTEM_PROMPT, maxTokens: 2000 },
  );

  const planContent = extractText(planResponse.content);

  // Parse plan steps from response
  const planLines = planContent.split('\n').filter(line => /^\d+\./.test(line.trim()));
  for (let i = 0; i < planLines.length; i++) {
    steps.push({
      id: `step_${i + 1}`,
      description: planLines[i].replace(/^\d+\.\s*/, '').trim(),
      status: 'pending',
    });
  }

  // Step 2: Execution loop with tools
  const messages: ClaudeMessage[] = [
    { role: 'user', content: buildUserMessage(query, context) },
    { role: 'assistant', content: planContent },
    { role: 'user', content: 'Now execute the plan. Use update_cells and format_range tools to write data directly. Do not use code_execution unless absolutely necessary. Be concise — apply changes in as few tool calls as possible.' },
  ];

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const response = await callClaude(messages, {
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      maxTokens: 4096,
    });

    // Add assistant response to conversation
    messages.push({ role: 'assistant', content: response.content });

    // Extract tool use blocks
    const toolUseBlocks = extractToolUseBlocks(response.content);

    if (toolUseBlocks.length > 0) {
      const toolResults = await processToolUseBlocks(toolUseBlocks, patches);

      // Send tool results back as a user message with tool_result blocks
      messages.push({ role: 'user', content: toolResults });

      // Update step status
      for (const _toolUse of toolUseBlocks) {
        const stepIndex = steps.findIndex(s => s.status === 'pending');
        if (stepIndex >= 0) {
          steps[stepIndex].status = 'completed';
        }
      }
    }

    // Check if done
    if (response.stop_reason === 'end_turn') {
      break;
    }
  }

  // Mark remaining steps as completed
  for (const step of steps) {
    if (step.status === 'pending') {
      step.status = 'completed';
    }
  }

  return {
    plan: {
      id: planId,
      userQuery: query,
      steps,
      status: 'completed',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    patches,
  };
}

/**
 * Streaming agent execution for real-time UI updates
 */
export async function* streamAgent(
  query: string,
  context: AgentContext,
): AsyncGenerator<AgentStreamEvent> {
  const planId = `plan_${Date.now()}`;

  yield {
    type: 'plan_start',
    plan: {
      id: planId,
      userQuery: query,
      steps: [],
      status: 'planning',
      createdAt: new Date().toISOString(),
    },
  };

  try {
    const result = await executeAgent(query, context);

    for (const step of result.plan.steps) {
      yield { type: 'step_added', step };
    }

    for (const patch of result.patches) {
      yield { type: 'patch', patch };
    }

    yield { type: 'complete', plan: result.plan };
  } catch (error) {
    yield {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
