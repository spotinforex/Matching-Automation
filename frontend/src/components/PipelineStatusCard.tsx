import React from 'react';
import { CheckCircle2, Clock, Cpu, FileSpreadsheet, MapPin, Route, Layers, CheckSquare, AlertTriangle } from 'lucide-react';
import { PipelineStep } from '../types';

interface PipelineStatusCardProps {
  steps: PipelineStep[];
  isMatching: boolean;
  activeRound?: number;
}

const STEP_ICONS = [
  FileSpreadsheet,
  MapPin,
  Route,
  Layers,
  CheckSquare,
];

export const PipelineStatusCard: React.FC<PipelineStatusCardProps> = ({ steps, isMatching }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Matching Pipeline Execution Workflow
            </h4>
            <p className="text-[11px] text-slate-500">Real-time status tracking for /match/run processing pipeline</p>
          </div>
        </div>
        {isMatching && (
          <span className="inline-flex items-center space-x-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-3 py-1 rounded-full font-medium animate-pulse">
            <Clock className="w-3.5 h-3.5 text-orange-600 animate-spin" />
            <span>Processing Distance Matrix & Hop Search...</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed';
          const isRunning = step.status === 'running';
          const isError = step.status === 'error';
          const IconComp = STEP_ICONS[idx] || Cpu;

          return (
            <div
              key={step.id}
              className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-2 relative overflow-hidden ${
                isCompleted
                  ? 'bg-orange-50/70 border-orange-200/90 text-orange-950 shadow-2xs'
                  : isRunning
                  ? 'bg-orange-100/90 border-orange-300 text-orange-950 ring-2 ring-orange-500/30 animate-pulse shadow-xs'
                  : isError
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-slate-50/80 border-slate-200 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <IconComp className={`w-3.5 h-3.5 ${
                    isCompleted ? 'text-orange-600' : isRunning ? 'text-orange-700' : 'text-slate-400'
                  }`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                    Step 0{idx + 1}
                  </span>
                </div>
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-orange-600 flex-shrink-0" />
                ) : isRunning ? (
                  <Clock className="w-4 h-4 text-orange-600 animate-spin flex-shrink-0" />
                ) : isError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-slate-300" />
                )}
              </div>

              <div>
                <h5 className="font-semibold text-xs text-slate-900 line-clamp-1">{step.title}</h5>
                <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{step.description}</p>
              </div>

              {step.timestamp && (
                <span className="text-[9px] text-slate-400 font-mono self-end pt-1">{step.timestamp}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};



