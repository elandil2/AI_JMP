"use client";
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, TooltipProps, CartesianGrid, LabelList } from 'recharts';
import { RiskSegment, RiskType } from '../types';

interface RiskChartsProps {
  intensityData: RiskSegment[];
  typeData: RiskType[];
}

const COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981'];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-100 p-3 rounded-lg text-sm text-slate-700">
        <p className="font-bold text-slate-800 mb-1">{payload[0].payload.name || payload[0].payload.category}</p>
        <p className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          Risk Puanı: <span className="font-mono font-bold">{payload[0].value}</span>
        </p>
      </div>
    );
  }
  return null;
};

// Custom Label for Pie Chart
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + (outerRadius + 20) * Math.cos(-midAngle * RADIAN);
  const y = cy + (outerRadius + 20) * Math.sin(-midAngle * RADIAN);

  return (
    <text x={x} y={y} fill="#334155" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-[10px] font-bold">
      {name}
    </text>
  );
};

export const RiskCharts: React.FC<RiskChartsProps> = ({ intensityData, typeData }) => {
  // Ensure we have colors for intensity data if the API didn't send them nicely
  const intensityWithColors = intensityData.map((d, i) => ({
    ...d,
    color: d.color || COLORS[i % COLORS.length]
  }));

  return (
    <div className={`grid grid-cols-1 ${typeData && typeData.length > 0 ? 'md:grid-cols-2' : ''} gap-6 mb-8 print:block print:space-y-6`}>
      {/* Risk Intensity Donut Chart */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden print:border-none print:shadow-none print:break-inside-avoid">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-50 to-transparent rounded-bl-full -mr-4 -mt-4 opacity-50 print:hidden"></div>

        <h3 className="text-lg font-bold text-slate-800 mb-1 z-10">Risk Yoğunluğu (Bölge Bazlı)</h3>
        <p className="text-xs text-slate-500 mb-6 z-10">
          Rotanın farklı etaplarındaki risk katsayısı dağılımı.
        </p>

        {/* Force height in print to avoid collapse */}
        <div className="flex-1 min-h-[300px] relative print:h-[300px] print:w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={intensityWithColors}
                innerRadius={typeData && typeData.length > 0 ? 65 : 80}
                outerRadius={typeData && typeData.length > 0 ? 85 : 100}
                paddingAngle={4}
                dataKey="value"
                cornerRadius={6}
                label={renderCustomizedLabel}
                isAnimationActive={false} // CRITICAL FOR PRINTING: Disable animation so it renders instantly
              >
                {intensityWithColors.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Center Info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`font-black text-slate-800 ${typeData && typeData.length > 0 ? 'text-3xl' : 'text-5xl'}`}>%100</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Analiz</span>
          </div>
        </div>
      </div>

      {/* Risk Types Bar Chart - Only show if data exists */}
      {typeData && typeData.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col relative overflow-hidden print:border-none print:shadow-none print:break-inside-avoid">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-rose-50 to-transparent rounded-bl-full -mr-4 -mt-4 opacity-50 print:hidden"></div>

          <h3 className="text-lg font-bold text-slate-800 mb-1 z-10">Risk Tipi Dağılımı</h3>
          <p className="text-xs text-slate-500 mb-6 z-10">
            Karşılaşılan tehlike türlerinin frekansı.
          </p>

          <div className="flex-1 min-h-[300px] print:h-[300px] print:w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={typeData}
                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={110}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  barSize={24}
                  isAnimationActive={false} // CRITICAL FOR PRINTING
                >
                  {typeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                  <LabelList dataKey="value" position="right" fontSize={12} fontWeight="bold" fill="#64748b" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
