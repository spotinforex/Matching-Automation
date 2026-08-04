import React from 'react';
import { CheckCircle2, Clock, Cpu } from 'lucide-react';
import { PipelineStep } from '../types';

interface PipelineStatusCardProps {
  steps: PipelineStep[];
  isMatching: boolean;
  activeRound?: number;
}

export const PipelineStatusCard: React.FC<PipelineStatusCardProps> = ({ steps, isMatching }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-orange-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Matching Automation Pipeline Execution Status
          </h4>
        </div>
        {isMatching && (
          <span className="flex items-center space-x-1 text-xs text-orange-600 font-medium animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            <span>Processing Geocoding & Distance Matrices...</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'completed';
          const isRunning = step.status === 'running';

          return (
            <div
              key={step.id}
              className={`p-3 rounded-lg border transition-all flex flex-col justify-between space-y-2 ${
                isCompleted
                  ? 'bg-orange-50/70 border-orange-200 text-orange-900'
                  : isRunning
                  ? 'bg-orange-100/80 border-orange-300 text-orange-950 ring-1 ring-orange-400 animate-pulse'
                  : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                  Step 0{idx + 1}
                </span>
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 text-orange-600" />
                ) : isRunning ? (
                  <Clock className="w-4 h-4 text-orange-600 animate-spin" />
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


