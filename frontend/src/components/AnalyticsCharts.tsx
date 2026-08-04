import React, { useMemo } from 'react';
import { MatchRunResponse } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { BarChart3, PieChart as PieIcon, MapPin, Building2 } from 'lucide-react';

interface AnalyticsChartsProps {
  data: MatchRunResponse | null;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ data }) => {
  if (!data || data.matches.length === 0) return null;

  // 1. Travel Time Distribution Buckets
  const travelTimeBuckets = useMemo(() => {
    const buckets = [
      { range: '< 5 min', count: 0, color: '#ea580c' },
      { range: '5–15 min', count: 0, color: '#f97316' },
      { range: '15–30 min', count: 0, color: '#fb923c' },
      { range: '30–60 min', count: 0, color: '#fdba74' },
      { range: '> 60 min', count: 0, color: '#dc2626' },
    ];

    data.matches.forEach(m => {
      if (m.travel_time < 5) buckets[0].count++;
      else if (m.travel_time <= 15) buckets[1].count++;
      else if (m.travel_time <= 30) buckets[2].count++;
      else if (m.travel_time <= 60) buckets[3].count++;
      else buckets[4].count++;
    });

    return buckets;
  }, [data]);

  // 2. Round Distribution Donut Data
  const roundData = useMemo(() => {
    const round1 = data.matches.filter(m => m.round === 1).length;
    const round2 = data.matches.filter(m => m.round === 2).length;
    const round3 = data.matches.filter(m => m.round === 3).length;
    const waitlist = data.waitlisted_count;

    return [
      { name: 'Round 1 (Direct)', value: round1, color: '#ea580c' },
      { name: 'Round 2 (Hop 1)', value: round2, color: '#f97316' },
      { name: 'Round 3 (Hop 2)', value: round3, color: '#fb923c' },
      { name: 'Waitlist', value: waitlist, color: '#64748b' },
    ].filter(item => item.value > 0);
  }, [data]);

  // 3. Landmark Distribution
  const landmarkData = useMemo(() => {
    const counts: Record<string, { count: number; avgTime: number; sumTime: number }> = {};
    data.matches.forEach(m => {
      const lm = m.landmark || 'Unknown';
      if (!counts[lm]) {
        counts[lm] = { count: 0, avgTime: 0, sumTime: 0 };
      }
      counts[lm].count++;
      counts[lm].sumTime += m.travel_time;
    });

    return Object.entries(counts)
      .map(([landmark, info]) => ({
        landmark: landmark.length > 15 ? landmark.slice(0, 15) + '...' : landmark,
        fullName: landmark,
        count: info.count,
        avgTravelTime: parseFloat((info.sumTime / info.count).toFixed(1)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [data]);

  // 4. Top MCP Load Chart
  const mcpLoadData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.matches.forEach(m => {
      counts[m.mcp_id] = (counts[m.mcp_id] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([mcp, count]) => ({
        mcp,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [data]);

  // Custom Tooltip Component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-md text-xs space-y-1">
          <p className="font-bold text-slate-900">{label || payload[0].name}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color || entry.fill }}>
              {entry.name || 'Count'}: <strong className="text-slate-900">{entry.value}</strong>
              {entry.unit ? ` ${entry.unit}` : ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Top Row Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Travel Time Histogram */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-orange-600" />
              <h3 className="font-bold text-sm text-slate-900">Travel Time Distribution (Minutes)</h3>
            </div>
            <span className="text-xs text-slate-500">Total {data.matched_count} matches</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={travelTimeBuckets} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.7} />
                <XAxis dataKey="range" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="YPs Matched" radius={[4, 4, 0, 0]}>
                  {travelTimeBuckets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Match Distribution by Round */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <PieIcon className="w-4 h-4 text-orange-600" />
              <h3 className="font-bold text-sm text-slate-900">Round & Hop Breakdown</h3>
            </div>
            <span className="text-xs text-slate-500">Hop 1 to 3</span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={roundData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {roundData.map((entry, index) => (
                    <Cell key={`cell-round-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: string) => <span className="text-xs text-slate-700">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 3: Landmark YP Allocations */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-orange-600" />
              <h3 className="font-bold text-sm text-slate-900">Top Landmark Demand & Avg Travel Time</h3>
            </div>
            <span className="text-xs text-slate-500">By YP volume</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={landmarkData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.7} />
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis dataKey="landmark" type="category" stroke="#64748b" fontSize={11} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="YPs Assigned" fill="#ea580c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Top MCP Load & Center Utilization */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-orange-600" />
              <h3 className="font-bold text-sm text-slate-900">Top MCP Center Load Allocation</h3>
            </div>
            <span className="text-xs text-slate-500">Assigned YP volume</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mcpLoadData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.7} />
                <XAxis dataKey="mcp" stroke="#64748b" fontSize={10} tickLine={false} interval={0} angle={-25} textAnchor="end" height={45} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Assigned YPs" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

