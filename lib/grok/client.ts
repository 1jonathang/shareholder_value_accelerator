/**
 * Grok AI Client using xAI SDK
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

const XAI_API_KEY = process.env.XAI_API_KEY!;
const XAI_BASE_URL = 'https://api.x.ai/v1';

// Model to use for spreadsheet operations
const MODEL = 'grok-4-1-fast-reasoning';

interface GrokMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: GrokToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface GrokToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface GrokChatResponse {
  id: string;
  choices: {
    message: GrokMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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
 * Tool definitions for the agent
 */
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web for current financial data, market rates, or other real-time information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query for financial data',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'code_execution',
      description: 'Execute Python code to validate financial calculations. Use numpy_financial for IRR/NPV, pandas for data analysis.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Python code to execute. Available: numpy, pandas, numpy_financial',
          },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_cells',
      description: 'Update one or more cells in the spreadsheet',
      parameters: {
        type: 'object',
        properties: {
          updates: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                row: { type: 'number', description: '0-indexed row number' },
                col: { type: 'number', description: '0-indexed column number' },
                value: { 
                  oneOf: [
                    { type: 'string' },
                    { type: 'number' },
                    { type: 'boolean' },
                    { type: 'null' },
                  ],
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
  },
  {
    type: 'function' as const,
    function: {
      name: 'format_range',
      description: 'Apply formatting to a range of cells',
      parameters: {
        type: 'object',
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
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_tab',
      description: 'Create a new tab in the spreadsheet',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the new tab' },
          reasoning: { type: 'string' },
        },
        required: ['name', 'reasoning'],
      },
    },
  },
];

/**
 * Execute a web search using xAI's native web_search tool
 */
async function executeWebSearch(query: string): Promise<WebSearchResult[]> {
  // In production, this would call xAI's web_search capability
  // For now, return a placeholder
  console.log(`[Web Search] Query: ${query}`);
  
  // This would be replaced with actual xAI web_search call
  return [
    {
      title: 'Search results for: ' + query,
      url: 'https://example.com',
      snippet: 'Placeholder search result - integrate with xAI web_search tool',
    },
  ];
}

/**
 * Execute Python code using xAI's code_execution tool
 */
async function executeCode(code: string): Promise<CodeExecutionResult> {
  // In production, this would call xAI's code_execution capability
  console.log(`[Code Execution] Running Python:\n${code}`);
  
  // This would be replaced with actual xAI code_execution call
  return {
    success: true,
    output: 'Code execution placeholder - integrate with xAI code_execution tool',
    returnValue: null,
  };
}

/**
 * Process tool calls from the model response
 */
async function processToolCalls(
  toolCalls: GrokToolCall[],
  patches: SheetPatch[],
): Promise<GrokMessage[]> {
  const results: GrokMessage[] = [];
  
  for (const toolCall of toolCalls) {
    const args = JSON.parse(toolCall.function.arguments);
    let result: string;
    
    switch (toolCall.function.name) {
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
        result = JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
    }
    
    results.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
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
 * Main agent execution function
 */
export async function executeAgent(
  query: string,
  context: AgentContext,
): Promise<{ plan: AgentPlan; patches: SheetPatch[] }> {
  const planId = `plan_${Date.now()}`;
  const patches: SheetPatch[] = [];
  const steps: AgentPlanStep[] = [];
  
  const messages: GrokMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(query, context) },
  ];
  
  // Initial planning request
  const planningMessages = [...messages];
  planningMessages.push({
    role: 'user',
    content: 'First, create a step-by-step plan for this task. Output the plan as a numbered list.',
  });
  
  const planResponse = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: planningMessages,
      max_tokens: 2000,
    }),
  });
  
  if (!planResponse.ok) {
    throw new Error(`Grok API error: ${planResponse.statusText}`);
  }
  
  const planData: GrokChatResponse = await planResponse.json();
  const planContent = planData.choices[0].message.content;
  
  // Parse plan steps from response
  const planLines = planContent.split('\n').filter(line => /^\d+\./.test(line.trim()));
  for (let i = 0; i < planLines.length; i++) {
    steps.push({
      id: `step_${i + 1}`,
      description: planLines[i].replace(/^\d+\.\s*/, '').trim(),
      status: 'pending',
    });
  }
  
  // Add plan to messages for context
  messages.push({ role: 'assistant', content: planContent });
  messages.push({ role: 'user', content: 'Now execute the plan step by step. Use the available tools.' });
  
  // Execution loop
  let iterations = 0;
  const maxIterations = 10;
  
  while (iterations < maxIterations) {
    iterations++;
    
    const response = await fetch(`${XAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 4000,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Grok API error: ${response.statusText}`);
    }
    
    const data: GrokChatResponse = await response.json();
    const assistantMessage = data.choices[0].message;
    messages.push(assistantMessage);
    
    // Check for tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolResults = await processToolCalls(assistantMessage.tool_calls, patches);
      messages.push(...toolResults);
      
      // Update step status based on tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const stepIndex = steps.findIndex(s => s.status === 'pending');
        if (stepIndex >= 0) {
          steps[stepIndex].status = 'completed';
        }
      }
    }
    
    // Check if done
    if (data.choices[0].finish_reason === 'stop' && !assistantMessage.tool_calls) {
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
  const patches: SheetPatch[] = [];
  const steps: AgentPlanStep[] = [];
  
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
  
  // For streaming, we would use SSE from the xAI API
  // This is a simplified implementation
  
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

