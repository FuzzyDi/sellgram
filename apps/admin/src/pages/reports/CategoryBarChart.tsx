import React from 'react';

export default function CategoryBarChart({ data }: { data: { categoryName: string; totalRevenue: number }[] }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.totalRevenue), 1);
  const BAR_H = 22, GAP = 6, PAD_LEFT = 120, PAD_RIGHT = 80;
  const H = data.length * (BAR_H + GAP);
  const W = 500;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {data.map((row, i) => {
        const y = i * (BAR_H + GAP);
        const barW = Math.max(4, ((row.totalRevenue / maxVal) * (W - PAD_LEFT - PAD_RIGHT)));
        return (
          <g key={row.categoryName}>
            <text x={PAD_LEFT - 8} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="11" fill="#6b7280"
              style={{ overflow: 'hidden' }}>
              {row.categoryName.length > 14 ? row.categoryName.slice(0, 13) + '…' : row.categoryName}
            </text>
            <rect x={PAD_LEFT} y={y} width={barW} height={BAR_H} rx="4" fill="#00875a" fillOpacity="0.75" />
            <text x={PAD_LEFT + barW + 6} y={y + BAR_H / 2 + 4} fontSize="11" fill="#374151" fontWeight="600">
              {Number(row.totalRevenue).toLocaleString()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
