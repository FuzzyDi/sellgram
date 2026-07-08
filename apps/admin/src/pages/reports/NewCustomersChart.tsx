import React from 'react';
import SparkChart from './SparkChart';

export default function NewCustomersChart({ data }: { data: { date: string; count: number }[] }) {
  return <SparkChart data={data as any} valueKey="count" color="#2563eb" gradientId="rep-cust-grad" />;
}
