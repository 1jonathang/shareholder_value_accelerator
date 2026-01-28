# Ramp Sheets

> The "Cursor for Excel" — A high-performance, AI-powered spreadsheet for financial modeling.

## Overview

Ramp Sheets is a next-generation spreadsheet application that combines the performance of native applications with the intelligence of modern AI. Built on a Rust/WASM engine for blazing-fast calculations and WebGL rendering, it uses Grok 4.1 as an agentic AI partner for financial analysis and modeling.
Got free credits for Grok, can easily switch out for other models.

## Key Features

- **High-Performance Grid**: Canvas-based rendering with WebGL acceleration, supporting 1M+ cells at 60fps
- **Rust/WASM Engine**: Formula evaluation, dependency tracking, and cell storage in Rust for near-native performance
- **AI-Powered Agent**: Grok 4.1 acts as an intelligent editor with visible planning, not just a chatbot
- **Finance-First**: Built-in financial functions (IRR, NPV, XIRR, cohort analysis) with Python validation
- **Real-Time Collaboration**: Supabase-powered sync with CRDT conflict resolution
- **Excel Compatible**: Full import/export support for .xlsx files

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.1.1 (App Router, Server Actions) |
| Engine | Rust + WASM + WebGL/WebGPU |
| AI Brain | Grok 4.1 Fast (xAI SDK) |
| Database | Supabase (Postgres + Realtime) |
| Testing | Vitest + Playwright |

## Getting Started

### Prerequisites

- Node.js 20+
- Rust (stable) with `wasm-pack`
- Supabase account (or local instance)
- xAI API key for Grok

### Installation

```bash
# Clone the repository
git clone https://github.com/ramp/sheets.git
cd sheets

# Install dependencies
npm install

# Build the WASM engine
npm run wasm:build

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Run database migrations
npx supabase db push

# Start development server
npm run dev
```

### Environment Variables

```env
# xAI Grok API
XAI_API_KEY=your_xai_api_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Next.js App                            │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │  Canvas Grid   │  │  Command       │  │  Agent Panel   │  │
│  │  (WebGL)       │  │  Palette       │  │  (Plan View)   │  │
│  └────────┬───────┘  └────────────────┘  └────────────────┘  │
│           │                                                   │
│  ┌────────▼───────────────────────────────────────────────┐  │
│  │              WASM Bridge (wasm-bindgen)                 │  │
│  └────────┬───────────────────────────────────────────────┘  │
│           │                                                   │
├───────────▼──────────────────────────────────────────────────┤
│                      Rust Engine                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Cell     │  │ Formula      │  │ Dependency Graph     │   │
│  │ Storage  │  │ Parser/Eval  │  │ (petgraph)           │   │
│  └──────────┘  └──────────────┘  └──────────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│                    Server Actions                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Agent API    │  │ web_search   │  │ code_execution   │   │
│  │ (Grok 4.1)   │  │ (xAI Tool)   │  │ (Python)         │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
├──────────────────────────────────────────────────────────────┤
│                      Supabase                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Postgres     │  │ Realtime     │  │ Auth             │   │
│  │ (RLS)        │  │ Channels     │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

## Project Structure

```
sheets/
├── app/                    # Next.js App Router
│   ├── api/agent/         # Grok agent API routes
│   ├── components/        # React components
│   │   └── grid/          # Canvas grid components
│   ├── page.tsx           # Main spreadsheet page
│   └── layout.tsx         # Root layout
├── lib/                   # Shared libraries
│   ├── finance/           # Financial functions (TS)
│   ├── grok/              # Grok AI client
│   ├── supabase/          # Supabase client & types
│   └── wasm/              # Built WASM output
├── rust-engine/           # Rust spreadsheet engine
│   └── src/
│       ├── cell.rs        # Cell types & references
│       ├── formula.rs     # Formula parsing & eval
│       ├── grid.rs        # Grid data structure
│       ├── renderer.rs    # Canvas rendering
│       └── viewport.rs    # Virtual scrolling
├── supabase/              # Database config
│   └── migrations/        # SQL migrations
├── tests/                 # Unit tests
└── e2e/                   # E2E Playwright tests
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run wasm:build` | Build Rust/WASM engine |
| `npm run wasm:dev` | Build WASM in dev mode |

## Agent Workflow

The AI agent follows a planning-first approach:

1. **Planning Phase**: Grok creates a multi-step plan before execution
2. **Visible Reasoning**: Each step shows the AI's reasoning
3. **Tool Use**: 
   - `web_search` for real-time market data
   - `code_execution` for Python validation of complex formulas
   - `update_cells` to modify the spreadsheet
4. **Validation**: Financial calculations are verified in Python sandbox before committing

Example agent query:
```
"Create a 5-year DCF model for a SaaS company with $10M ARR growing at 40%"
```

## Performance Targets

- **Grid Rendering**: 60fps scrolling with 1M+ cells
- **Formula Recalc**: < 100ms for typical dependency chains
- **Agent Response**: < 3s for simple queries, streaming for complex
- **File Import**: < 5s for 50MB Excel files

## Security

- **No Client-Side Data Fetch**: All external APIs called server-side
- **RLS Policies**: Row-level security in Supabase
- **Audit Trail**: All changes logged with user attribution
- **Secret Handling**: Never hardcode keys in cells

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request