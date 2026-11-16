'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatRelative } from '@/lib/utils';

interface Activity {
  id: string;
  type: string;
  entityType: string;
  companyId?: string;
  company?: { name: string };
  user?: { name: string };
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  'prospect.created': 'New prospect added',
  'research.complete': 'Research completed',
  'email.generated': 'Email generated',
  'email.approved': 'Email approved',
  'email.sent': 'Email sent',
  'email.regenerated': 'Email regenerated',
  'email.skipped': 'Email skipped',
};

export function RecentActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () =>
      api.get<{ data: Activity[] }>('/dashboard/activity?limit=10').then((r) => r.data.data),
    refetchInterval: 30000,
  });

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-5 py-4">
        <h3 className="font-semibold">Recent Activity</h3>
      </div>
      <div className="divide-y">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-3">
              <div className="animate-pulse h-4 bg-muted rounded w-3/4 mb-1" />
              <div className="animate-pulse h-3 bg-muted rounded w-1/3" />
            </div>
          ))
        ) : data?.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet</p>
        ) : (
          data?.map((activity) => (
            <div key={activity.id} className="px-5 py-3">
              <p className="text-sm font-medium">
                {TYPE_LABELS[activity.type] ?? activity.type}
                {activity.company && (
                  <span className="text-muted-foreground font-normal"> — {activity.company.name}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatRelative(activity.createdAt)}
                {activity.user && ` by ${activity.user.name}`}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
