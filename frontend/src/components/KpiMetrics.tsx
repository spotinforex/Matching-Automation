import React from 'react';
import { MatchRunResponse } from '../types';
import { Users, Clock, AlertTriangle, Layers, Building2, CheckCircle2, FileSpreadsheet, Database } from 'lucide-react';

interface KpiMetricsProps {
  data: MatchRunResponse | null;
  totalYpsLoaded: number | null;
  totalMcpsLoaded: number | null;
}

export const KpiMetrics: React.FC<KpiMetricsProps> = ({ data, totalYpsLoaded, totalMcpsLoaded }) => {
  if (!data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3 shadow-2xs">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">YP Source Status</span>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {totalYpsLoaded ? `${totalYpsLoaded.toLocaleString()} YP records loaded` : 'No YP file uploaded'}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3 shadow-2xs">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">MCP Source Status</span>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {totalMcpsLoaded ? `${totalMcpsLoaded.toLocaleString()} MCP centers registered` : 'No MCP file uploaded'}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3 shadow-2xs sm:col-span-2 md:col-span-1">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">Pipeline Status</span>
            <div className="text-sm font-bold text-slate-900 mt-0.5">
              {totalYpsLoaded && totalMcpsLoaded ? 'Ready to execute matching' : 'Awaiting data upload'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalYps = totalYpsLoaded || (data.matched_count + data.waitlisted_count);
  const totalMcps = totalMcpsLoaded || 236;

  const matchRate = totalYps > 0 ? ((data.matched_count / totalYps) * 100).toFixed(1) : '0';

  const avgTravelTime = data.matches.length > 0
    ? (data.matches.reduce((sum, m) => sum + m.travel_time, 0) / data.matches.length).toFixed(1)
    : '0';

  const round1Count = data.matches.filter(m => m.round === 1).length;
  const round1Pct = data.matches.length > 0 ? ((round1Count / data.matches.length) * 100).toFixed(1) : '0';

  const highTravelCount = data.matches.filter(m => m.travel_time > 30).length;

  const uniqueMcpsUsed = new Set(data.matches.map(m => m.mcp_id)).size;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {/* KPI 1: Matched YPs */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-orange-300 transition-all hover:shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Matched YPs</span>
          <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200/60">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{data.matched_count.toLocaleString()}</div>
          <p className="text-xs text-orange-700 font-semibold mt-0.5">{matchRate}% match rate</p>
        </div>
      </div>

      {/* KPI 2: Waitlisted YPs */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-slate-300 transition-all hover:shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Waitlisted</span>
          <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-200/60">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{data.waitlisted_count.toLocaleString()}</div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Capacity limit reached</p>
        </div>
      </div>

      {/* KPI 3: Avg Travel Time */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-slate-300 transition-all hover:shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Avg Travel Time</span>
          <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200/60">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {avgTravelTime} <span className="text-xs font-normal text-slate-500">mins</span>
          </div>
          <p className="text-xs text-orange-700 font-medium mt-0.5">Distance Matrix API</p>
        </div>
      </div>

      {/* KPI 4: Round 1 Matches */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-slate-300 transition-all hover:shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Direct Matches (R1)</span>
          <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200/60">
            <Layers className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{round1Count.toLocaleString()}</div>
          <p className="text-xs text-orange-700 font-medium mt-0.5">{round1Pct}% direct landmark</p>
        </div>
      </div>

      {/* KPI 5: MCP Centers Used */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-slate-300 transition-all hover:shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">MCPs Assigned</span>
          <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg border border-orange-200/60">
            <Building2 className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {uniqueMcpsUsed} <span className="text-xs font-normal text-slate-500">/ {totalMcps}</span>
          </div>
          <p className="text-xs text-orange-700 font-medium mt-0.5">
            {totalMcps > 0 ? ((uniqueMcpsUsed / totalMcps) * 100).toFixed(0) : 0}% centers active
          </p>
        </div>
      </div>

      {/* KPI 6: Travel Time Alert (>30m) */}
      <div className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:border-slate-300 transition-all hover:shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Long Travel (&gt;30m)</span>
          <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg border border-rose-200/60">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">{highTravelCount.toLocaleString()}</div>
          <p className="text-xs text-rose-700 font-medium mt-0.5">Transport hop needed</p>
        </div>
      </div>
    </div>
  );
};


