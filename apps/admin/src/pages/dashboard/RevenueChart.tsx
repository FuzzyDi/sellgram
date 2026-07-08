import React from 'react';

export default function RevenueChart({ data }: { data: { date: string; revenue: number }[] }) {
  if (!data || data.length === 0) return null;
  const W = 600, H = 120, PAD = { top: 8, right: 4, bottom: 28, left: 0 };
  const maxVal = Math.max(...data.map((d) => d.revenue), 1);
  const xStep = (W - PAD.left - PAD.right) / (data.length - 1);
  const toY = (v: number) => PAD.top + (1 - v / maxVal) * (H - PAD.top - PAD.bottom);
  const pts = data.map((d, i) => [PAD.left + i * xStep, toY(d.revenue)] as [number, number]);
  const area = `M${pts[0][0]},${H - PAD.bottom} L${pts.map(([x, y]) => `${x},${y}`).join(' L')} L${pts[pts.length - 1][0]},${H - PAD.bottom} Z`;
  const line = `M${pts.map(([x, y]) => `${x},${y}`).join(' L')}`;

  // show label every ~4 points
  const labelEvery = Math.max(1, Math.round(data.length / 4));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00875a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#00875a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rev-grad)" />
      <path d={line} fill="none" stroke="#00875a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={data[i].revenue > 0 ? 3 : 0} fill="#00875a" />
      ))}
      {data.map((d, i) => {
        if (i % labelEvery !== 0 && i !== data.length - 1) return null;
        const [x] = pts[i];
        const label = d.date.slice(5); // MM-DD
        return (
          <text key={i} x={x} y={H - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">{label}</text>
        );
      })}
    </svg>
  );
}
