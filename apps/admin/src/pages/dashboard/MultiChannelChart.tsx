import React from 'react';

interface DataPoint {
  date: string;
  sellgram: number;
  pos: number;
  b2b: number;
}

// Neutral-corporate palette per the Dashboard multi-channel rewrite —
// deliberately NOT channel.sellgram's green (used for badges/dots
// elsewhere in the app): accent-600 for Sellgram here keeps the chart's
// three lines visually distinct from the general channel-color
// convention that the channel cards above it still use.
const SERIES: { key: keyof Omit<DataPoint, 'date'>; color: string; label: string }[] = [
  { key: 'sellgram', color: '#4f46e5', label: 'Sellgram' }, // accent-600
  { key: 'pos', color: '#0284c7', label: 'POS' }, // channel-pos
  { key: 'b2b', color: '#7c3aed', label: 'B2B' }, // channel-b2b
];

// Same hand-rolled inline-SVG technique as ./RevenueChart.tsx and
// pages/reports/*Chart.tsx (not recharts) — Dashboard.tsx is eagerly
// imported in App.tsx, not lazy-loaded, so pulling recharts' ~390KB
// chunk into the always-loaded bundle isn't worth it for a 3-line chart
// this simple.
export default function MultiChannelChart({ data }: { data: DataPoint[] }) {
  if (!data || data.length === 0) return null;
  const W = 600, H = 160, PAD = { top: 8, right: 4, bottom: 28, left: 0 };
  const maxVal = Math.max(...data.flatMap((d) => [d.sellgram, d.pos, d.b2b]), 1);
  const xStep = (W - PAD.left - PAD.right) / Math.max(1, data.length - 1);
  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (v: number) => PAD.top + (1 - v / maxVal) * (H - PAD.top - PAD.bottom);

  // show label every ~4 points
  const labelEvery = Math.max(1, Math.round(data.length / 4));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {SERIES.map((series) => {
          const pts = data.map((d, i) => [toX(i), toY(d[series.key])] as [number, number]);
          const line = `M${pts.map(([x, y]) => `${x},${y}`).join(' L')}`;
          return (
            <g key={series.key}>
              <path d={line} fill="none" stroke={series.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={data[i][series.key] > 0 ? 2.5 : 0} fill={series.color} />
              ))}
            </g>
          );
        })}
        {data.map((d, i) => {
          if (i % labelEvery !== 0 && i !== data.length - 1) return null;
          const x = toX(i);
          const label = d.date.slice(5); // MM-DD
          return (
            <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">{label}</text>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        {SERIES.map((series) => (
          <div key={series.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: series.color, display: 'inline-block' }} />
            {series.label}
          </div>
        ))}
      </div>
    </div>
  );
}
