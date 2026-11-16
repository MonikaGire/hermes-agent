'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Send, RefreshCw, Eye } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';

interface Email {
  id: string;
  subject: string;
  body: string;
  status: string;
  wordCount: number;
  sentAt?: string;
  createdAt: string;
  company: { id: string; name: string; industry: string };
  contact?: { firstName: string; lastName: string; role: string; email?: string };
  reviewScores?: {
    overall: number;
    researchRelevance: number;
    personalization: number;
    humanTone: number;
    businessValue: number;
    replyProbability: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  SENT: 'bg-blue-100 text-blue-800',
  SKIPPED: 'bg-red-100 text-red-700',
};

export function EmailList() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Email | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['emails', page],
    queryFn: () =>
      api.get<{ data: Email[]; meta: { total: number; totalPages: number } }>(`/emails?page=${page}&limit=20`).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const sendEmail = useMutation({
    mutationFn: (id: string) => api.post(`/emails/${id}/send`),
    onSuccess: () => {
      toast.success('Email sent');
      void queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
    onError: () => toast.error('Failed to send email'),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Email table */}
      <div className="lg:col-span-3">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Subject</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Score</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-muted rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data?.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      No emails generated yet.
                    </td>
                  </tr>
                ) : (
                  data?.data.map((email) => (
                    <tr
                      key={email.id}
                      className={cn(
                        'hover:bg-muted/20 transition-colors cursor-pointer',
                        selected?.id === email.id && 'bg-muted/30',
                      )}
                      onClick={() => setSelected(email)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{email.company.name}</p>
                        <p className="text-xs text-muted-foreground">{email.company.industry}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate max-w-[200px]">{email.subject}</p>
                        <p className="text-xs text-muted-foreground">{email.wordCount} words</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[email.status] ?? 'bg-gray-100')}>
                          {email.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {email.reviewScores?.overall ? (
                          <span className={cn(
                            'text-sm font-semibold tabular-nums',
                            email.reviewScores.overall >= 6.5 ? 'text-green-600' : 'text-amber-600',
                          )}>
                            {email.reviewScores.overall.toFixed(1)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelected(email); }}
                            className="rounded p-1.5 hover:bg-accent"
                            title="Preview"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {email.status === 'APPROVED' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); sendEmail.mutate(email.id); }}
                              disabled={sendEmail.isPending}
                              className="rounded p-1.5 hover:bg-accent text-green-600"
                              title="Send"
                            >
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Email preview */}
      <div className="lg:col-span-2">
        {selected ? (
          <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4 sticky top-0">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium">Subject</p>
              <p className="font-semibold mt-1">{selected.subject}</p>
            </div>
            {selected.contact && (
              <div>
                <p className="text-xs text-muted-foreground uppercase font-medium">To</p>
                <p className="text-sm mt-1">
                  {selected.contact.firstName} {selected.contact.lastName} ({selected.contact.role})
                  {selected.contact.email && <span className="text-muted-foreground"> — {selected.contact.email}</span>}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium">Body</p>
              <pre className="text-sm mt-1 whitespace-pre-wrap font-sans leading-relaxed">{selected.body}</pre>
            </div>
            {selected.reviewScores && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground uppercase font-medium mb-2">Review Scores</p>
                <div className="space-y-1">
                  {Object.entries(selected.reviewScores).filter(([k]) => k !== 'overall').map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className={cn('font-medium', value >= 6.5 ? 'text-green-600' : 'text-amber-600')}>
                        {(value as number).toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm p-5 flex items-center justify-center h-64 text-muted-foreground text-sm">
            Select an email to preview
          </div>
        )}
      </div>
    </div>
  );
}
