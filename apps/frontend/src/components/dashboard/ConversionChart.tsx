'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function ConversionChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'conversion'],
    queryFn: () =>
      api.get<{ data: { byIndustry: Array<{ industry: string; total: number }> } }>(
        '/dashboard/conversion',
      ).then((r) => r.data.data),
  });

  const chartData = (data?.byIndustry ?? [])
    .map((item) => ({ industry: item.industry, count: item.total }))
    .slice(0, 7);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-5 py-4">
        <h3 className="font-semibold">Prospects by Industry</h3>
      </div>
      <div className="p-5">
        {isLoading ? (
          <div className="animate-pulse h-48 bg-muted rounded" />
        ) : chartData.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="industry"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
