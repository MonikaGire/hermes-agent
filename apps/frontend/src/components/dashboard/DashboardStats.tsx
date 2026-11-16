'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatNumber, formatPercent } from '@/lib/utils';
import { Users, Mail, CheckCircle, Send, TrendingUp, Target } from 'lucide-react';
import type { DashboardStats } from '@hermes/shared';

interface StatsCard {
  label: string;
  key: keyof DashboardStats;
  icon: React.ElementType;
  format?: (v: number) => string;
  color: string;
}

const CARDS: StatsCard[] = [
  { label: 'Total Prospects', key: 'totalProspects', icon: Users, color: 'text-blue-600', format: formatNumber },
  { label: 'Emails Generated', key: 'emailsGenerated', icon: Mail, color: 'text-purple-600', format: formatNumber },
  { label: 'Approved', key: 'emailsApproved', icon: CheckCircle, color: 'text-green-600', format: formatNumber },
  { label: 'Sent', key: 'emailsSent', icon: Send, color: 'text-orange-600', format: formatNumber },
  { label: 'Reply Rate', key: 'replyRate', icon: TrendingUp, color: 'text-pink-600', format: formatPercent },
  { label: 'Conversions', key: 'conversions', icon: Target, color: 'text-emerald-600', format: formatNumber },
];

export function DashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get<{ data: DashboardStats }>('/dashboard/stats').then((r) => r.data.data),
    refetchInterval: 60000,
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {CARDS.map(({ label, key, icon: Icon, format, color }) => (
        <div key={key} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <p className="text-2xl font-bold tabular-nums">
            {isLoading ? (
              <span className="animate-pulse bg-muted rounded h-7 w-16 inline-block" />
            ) : (
              (format ?? formatNumber)(data?.[key] ?? 0)
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
