import React from 'react';
import SparkChart from './SparkChart';

export default function RevenueChart({ data }: { data: { date: string; revenue: number; count: number }[] }) {
  return <SparkChart data={data as any} valueKey="revenue" color="#00875a" gradientId="rep-rev-grad" />;
}
