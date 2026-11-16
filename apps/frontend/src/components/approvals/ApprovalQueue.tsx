'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PendingEmail {
  id: string;
  subject: string;
  body: string;
  wordCount: number;
  reviewScores?: { overall: number };
  company: { id: string; name: string; industry: string; country: string };
  contact?: { firstName: string; lastName: string; role: string };
}

export function ApprovalQueue() {
  const [selected, setSelected] = useState<PendingEmail | null>(null);
  const [reviseMode, setReviseMode] = useState(false);
  const [instructions, setInstructions] = useState('');
  const queryClient = useQueryClient();

  const { data: pending, isLoading } = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () =>
      api.get<{ data: PendingEmail[] }>('/approvals/pending').then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/approvals/${id}/approve`),
    onSuccess: () => {
      toast.success('Email approved');
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Failed to approve email'),
  });

  const skip = useMutation({
    mutationFn: (id: string) => api.post(`/approvals/${id}/skip`),
    onSuccess: () => {
      toast.info('Email skipped');
      setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Failed to skip email'),
  });

  const revise = useMutation({
    mutationFn: ({ id, instructions }: { id: string; instructions: string }) =>
      api.post(`/approvals/${id}/revise`, { instructions }),
    onSuccess: () => {
      toast.success('Revision queued');
      setSelected(null);
      setReviseMode(false);
      setInstructions('');
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Failed to queue revision'),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Queue */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {pending?.length ?? 0} emails awaiting review
          </p>
        </div>

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))
        ) : pending?.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground text-sm">
            No emails pending approval
          </div>
        ) : (
          pending?.map((email) => (
            <button
              key={email.id}
              onClick={() => { setSelected(email); setReviseMode(false); }}
              className={cn(
                'w-full text-left rounded-xl border p-4 transition-colors hover:bg-accent',
                selected?.id === email.id && 'bg-muted/30 border-primary/30',
              )}
            >
              <p className="font-medium text-sm">{email.company.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{email.subject}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">{email.wordCount} words</span>
                {email.reviewScores?.overall && (
                  <span className={cn(
                    'text-xs font-medium',
                    email.reviewScores.overall >= 6.5 ? 'text-green-600' : 'text-amber-600',
                  )}>
                    Score: {email.reviewScores.overall.toFixed(1)}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Preview + actions */}
      <div className="lg:col-span-3">
        {selected ? (
          <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{selected.company.name}</p>
                <span className="text-xs text-muted-foreground">
                  {selected.company.industry} · {selected.company.country}
                </span>
              </div>
              {selected.contact && (
                <p className="text-sm text-muted-foreground mt-1">
                  To: {selected.contact.firstName} {selected.contact.lastName} ({selected.contact.role})
                </p>
              )}
            </div>

            <div className="border rounded-lg p-4 bg-muted/20">
              <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Subject</p>
              <p className="font-medium">{selected.subject}</p>
              <div className="border-t my-3" />
              <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{selected.body}</pre>
            </div>

            {reviseMode ? (
              <div className="space-y-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 border border-zinc-200 dark:border-zinc-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Revision Instructions</p>
                <textarea
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none text-zinc-900 dark:text-zinc-100"
                  rows={4}
                  placeholder="Describe what to change (e.g. 'Make it shorter', 'Focus more on inventory pain', 'Change the tone to be more direct')..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => revise.mutate({ id: selected.id, instructions })}
                    disabled={!instructions || revise.isPending}
                    className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {revise.isPending ? 'Queuing...' : 'Submit Revision'}
                  </button>
                  <button
                    onClick={() => setReviseMode(false)}
                    className="h-10 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => approve.mutate(selected.id)}
                  disabled={approve.isPending}
                  className="flex items-center gap-2 flex-1 h-9 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 justify-center disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={() => setReviseMode(true)}
                  className="flex items-center gap-2 flex-1 h-9 rounded-md border text-sm hover:bg-accent justify-center"
                >
                  <RefreshCw className="h-4 w-4" />
                  Revise
                </button>
                <button
                  onClick={() => skip.mutate(selected.id)}
                  disabled={skip.isPending}
                  className="flex items-center gap-2 flex-1 h-9 rounded-md border border-destructive text-destructive text-sm hover:bg-destructive/10 justify-center disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Skip
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm p-5 flex items-center justify-center h-64 text-muted-foreground text-sm">
            Select an email from the queue to review
          </div>
        )}
      </div>
    </div>
  );
}
