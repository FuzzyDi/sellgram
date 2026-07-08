import React from 'react';

export default function SparkChart({
  data, valueKey, color, gradientId,
}: {
  data: Record<string, number>[]; valueKey: string; color: string; gradientId: string;
}) {
  if (!data || data.length < 2) return null;
  const W = 600, H = 120, PAD = { top: 8, right: 4, bottom: 28, left: 0 };
  const maxVal = Math.max(...data.map((d) => d[valueKey] ?? 0), 1);
  const xStep = (W - PAD.left - PAD.right) / Math.max(data.length - 1, 1);
  const toY = (v: number) => PAD.top + (1 - v / maxVal) * (H - PAD.top - PAD.bottom);
  const pts = data.map((d, i) => [PAD.left + i * xStep, toY(d[valueKey] ?? 0)] as [number, number]);
  const area = `M${pts[0][0]},${H - PAD.bottom} L${pts.map(([x, y]) => `${x},${y}`).join(' L')} L${pts[pts.length - 1][0]},${H - PAD.bottom} Z`;
  const line = `M${pts.map(([x, y]) => `${x},${y}`).join(' L')}`;
  const labelEvery = Math.max(1, Math.round(data.length / 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={(data[i][valueKey] ?? 0) > 0 ? 3 : 0} fill={color} />
      ))}
      {data.map((d: any, i: number) => {
        if (i % labelEvery !== 0 && i !== data.length - 1) return null;
        return <text key={i} x={pts[i][0]} y={H - 6} textAnchor="middle" fontSize="9" fill="#9ca3af">{String(d.date ?? '').slice(5)}</text>;
      })}
    </svg>
  );
}
