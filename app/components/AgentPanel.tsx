'use client';

import { useState, useEffect } from 'react';
import type { AgentPlan, AgentPlanStep, SheetPatch } from '@/lib/claude/types';

interface AgentPanelProps {
  plan: AgentPlan | null;
  isExecuting: boolean;
  onApplyPatch: (patch: SheetPatch) => void;
  onClose: () => void;
}

function StepStatusIcon({ status }: { status: AgentPlanStep['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
      );
    case 'in_progress':
      return (
        <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      );
    case 'completed':
      return (
        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case 'failed':
      return (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
  }
}

export function AgentPanel({ plan, isExecuting, onApplyPatch, onClose }: AgentPanelProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Auto-expand steps as they complete
  useEffect(() => {
    if (plan) {
      const completed = plan.steps.filter(s => s.status === 'completed' && s.patch);
      setExpandedSteps(new Set(completed.map(s => s.id)));
    }
  }, [plan]);

  if (!plan) return null;

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  return (
    <div 
      className="fixed right-4 top-4 bottom-4 w-96 bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-40"
      data-testid="agent-plan"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-semibold text-slate-900">Agent Plan</span>
          {isExecuting && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
              Executing
            </span>
          )}
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Query */}
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm text-slate-600">"{plan.userQuery}"</p>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {plan.steps.map((step, index) => (
            <div 
              key={step.id}
              className={`rounded-lg border transition-all ${
                step.status === 'in_progress' 
                  ? 'border-blue-200 bg-blue-50' 
                  : step.status === 'failed'
                  ? 'border-red-200 bg-red-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <button
                className="w-full flex items-start gap-3 p-3 text-left"
                onClick={() => toggleStep(step.id)}
              >
                <StepStatusIcon status={step.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400">
                      Step {index + 1}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5">
                    {step.description}
                  </p>
                </div>
                <svg 
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    expandedSteps.has(step.id) ? 'rotate-180' : ''
                  }`}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded content */}
              {expandedSteps.has(step.id) && step.patch && (
                <div className="px-3 pb-3 pt-0">
                  <div className="mt-2 p-2 bg-slate-900 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-400">
                        {step.patch.type}
                      </span>
                      <button
                        onClick={() => onApplyPatch(step.patch!)}
                        className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                    <p className="text-xs text-emerald-400 font-mono">
                      {step.patch.reasoning}
                    </p>
                  </div>
                </div>
              )}

              {/* Result */}
              {step.result && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-slate-500 mt-1">
                    {step.result}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      {plan.status === 'completed' && (
        <div className="px-4 py-3 border-t border-slate-100 bg-emerald-50">
          <div className="flex items-center gap-2 text-emerald-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">Plan completed</span>
          </div>
        </div>
      )}

      {plan.status === 'failed' && (
        <div className="px-4 py-3 border-t border-slate-100 bg-red-50">
          <div className="flex items-center gap-2 text-red-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm font-medium">Plan failed</span>
          </div>
        </div>
      )}
    </div>
  );
}

