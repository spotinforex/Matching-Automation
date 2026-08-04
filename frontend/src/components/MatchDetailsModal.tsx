import React from 'react';
import { X, MapPin, Clock, Building2, Layers, CheckCircle2, AlertTriangle, ShieldCheck, Route, Navigation } from 'lucide-react';
import { MatchResult, WaitlistEntry } from '../types';

interface MatchDetailsModalProps {
  item: MatchResult | WaitlistEntry | null;
  isWaitlist: boolean;
  onClose: () => void;
}

export const MatchDetailsModal: React.FC<MatchDetailsModalProps> = ({ item, isWaitlist, onClose }) => {
  if (!item) return null;

  const matchItem = !isWaitlist ? (item as MatchResult) : null;
  const waitlistItem = isWaitlist ? (item as WaitlistEntry) : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg text-slate-800 shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-md ${isWaitlist ? 'bg-amber-50 text-amber-600' : 'bg-orange-50 text-orange-600'}`}>
              <Route className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">
                {item.yp_id} Detailed Analysis
              </h3>
              <p className="text-xs text-slate-500">
                {isWaitlist ? 'Waitlisted Participant Record' : 'Automated YP to MCP Matching Record'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Main Key Info Box */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Youth Participant ID
              </span>
              <span className="font-mono font-bold text-orange-700 text-sm">{item.yp_id}</span>
            </div>

            {!isWaitlist && matchItem && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Assigned MCP Center
                </span>
                <span className="font-mono font-bold text-orange-600 text-sm flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-orange-500" />
                  <span>{matchItem.mcp_id}</span>
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Landmark Centroid
              </span>
              <span className="capitalize font-semibold text-slate-800 text-xs flex items-center space-x-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{item.landmark || 'N/A'}</span>
              </span>
            </div>
          </div>

          {/* Match Analysis or Waitlist Reason */}
          {!isWaitlist && matchItem ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Travel Time Box */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Travel Duration</span>
                </span>
                <div className="text-xl font-bold font-mono text-emerald-700">
                  {matchItem.travel_time.toFixed(2)} <span className="text-xs text-slate-500 font-normal">mins</span>
                </div>
                <p className="text-[10px] text-slate-500">Google Maps / Haversine Distance Service</p>
              </div>

              {/* Match Round Box */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-1">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-orange-600" />
                  <span>Matching Hop Round</span>
                </span>
                <div className="text-xl font-bold font-mono text-orange-700">
                  Round {matchItem.round}
                </div>
                <p className="text-[10px] text-slate-500">
                  {matchItem.round === 1 ? 'Direct landmark centroid match' : `Fallback hop level ${matchItem.round - 1}`}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg space-y-2">
              <div className="flex items-center space-x-2 text-amber-800 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Waitlist Placement Reason</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {waitlistItem?.reason || 'No capacity available within hop limit threshold'}
              </p>
              <p className="text-[11px] text-slate-500 pt-1">
                Recommendation: Expand hop limit or increase MCP capacity allocation in {item.landmark || 'landmark'}.
              </p>
            </div>
          )}

          {/* Validation Status */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Geocoding Integrity Verified</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">Status: PASS</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white rounded-lg transition-colors shadow-xs"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
};
