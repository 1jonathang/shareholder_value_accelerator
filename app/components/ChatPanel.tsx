'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { AgentPlan, AgentPlanStep, SheetPatch } from '@/lib/claude/types';

export type ChatMessage =
  | { type: 'user'; text: string; timestamp: string }
  | { type: 'plan'; plan: AgentPlan; patches: SheetPatch[] }
  | { type: 'error'; text: string; timestamp: string };

interface ChatPanelProps {
  onSubmit: (query: string) => void;
  messages: ChatMessage[];
  isExecuting: boolean;
}

function StepStatusIcon({ status }: { status: AgentPlanStep['status'] }) {
  switch (status) {
    case 'pending':
      return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
    case 'in_progress':
      return <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />;
    case 'completed':
      return (
        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case 'failed':
      return (
        <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
  }
}

function PlanMessage({ plan, patches }: { plan: AgentPlan; patches: SheetPatch[] }) {
  return (
    <div className="space-y-2">
      {plan.steps.map((step, index) => (
        <div
          key={step.id}
          className={`rounded-lg border p-2.5 text-sm ${
            step.status === 'in_progress'
              ? 'border-blue-200 bg-blue-50'
              : step.status === 'failed'
              ? 'border-red-200 bg-red-50'
              : step.status === 'completed'
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-start gap-2">
            <StepStatusIcon status={step.status} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-slate-400">Step {index + 1}</span>
              <p className="text-slate-700 mt-0.5">{step.description}</p>
              {step.result && (
                <p className="text-xs text-slate-500 mt-1">{step.result}</p>
              )}
              {step.patch && (
                <div className="mt-2 p-2 bg-slate-900 rounded text-xs">
                  <span className="text-slate-400 font-medium">{step.patch.type}</span>
                  <p className="text-emerald-400 font-mono mt-1">{step.patch.reasoning}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {plan.status === 'completed' && (
        <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium pt-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Completed — {patches.length} patch{patches.length !== 1 ? 'es' : ''} applied
        </div>
      )}
      {plan.status === 'failed' && (
        <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium pt-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Failed
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ onSubmit, messages, isExecuting }: ChatPanelProps) {
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isExecuting) {
      onSubmit(query.trim());
      setQuery('');
    }
  }, [query, isExecuting, onSubmit]);

  return (
    <div className="w-96 flex flex-col bg-white border-l border-slate-200 h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Claude</span>
        {isExecuting && (
          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            Executing
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-sm text-slate-400 mt-8">
            <p className="font-medium text-slate-500">Ask Claude anything</p>
            <p className="mt-2">"Put the numbers 1-10 in column A"</p>
            <p>"Create a revenue projection"</p>
            <p>"Calculate IRR for these cash flows"</p>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.type === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm">
                  {msg.text}
                </div>
              </div>
            );
          }
          if (msg.type === 'plan') {
            return (
              <div key={i} className="max-w-[95%]">
                <PlanMessage plan={msg.plan} patches={msg.patches} />
              </div>
            );
          }
          if (msg.type === 'error') {
            return (
              <div key={i} className="max-w-[85%] px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {msg.text}
              </div>
            );
          }
          return null;
        })}
        {isExecuting && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask Claude..."
            disabled={isExecuting}
            className="flex-1 px-3 py-2 text-sm bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all disabled:opacity-50 placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!query.trim() || isExecuting}
            className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
