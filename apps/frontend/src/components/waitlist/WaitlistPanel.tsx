'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSession } from 'next-auth/react';
import { toast } from 'sonner';
import {
  UserPlus, CheckCircle, XCircle, Trash2, Search,
  RefreshCw, Users, Upload, ArrowRightCircle, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type ServiceMode = 'ERP' | 'AEO' | 'SEO';

interface WaitlistLead {
  id: string;
  email: string;
  name?: string;
  source: string;
  status: 'PENDING' | 'SENT' | 'REJECTED';
  emailSentAt?: string;
  createdAt: string;
}

interface Stats { total: number; pending: number; sent: number; rejected: number }

const SERVICE_MODE_STYLES: Record<ServiceMode, string> = {
  ERP: 'bg-violet-100 text-violet-700 border-violet-200',
  AEO: 'bg-blue-100 text-blue-700 border-blue-200',
  SEO: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export function WaitlistPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [serviceMode, setServiceMode] = useState<ServiceMode>('ERP');

  const { data: stats } = useQuery<Stats>({
    queryKey: ['waitlist-stats'],
    queryFn: () => api.get<{ data: Stats }>('/waitlist/stats').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data, isLoading, refetch } = useQuery<{ data: WaitlistLead[]; total: number }>({
    queryKey: ['waitlist', page, statusFilter, search],
    queryFn: () =>
      api.get<{ data: { data: WaitlistLead[]; total: number } }>('/waitlist', {
        params: { page, limit: 20, ...(statusFilter && { status: statusFilter }), ...(search && { search }) },
      }).then(r => r.data.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['waitlist'] });
    qc.invalidateQueries({ queryKey: ['waitlist-stats'] });
    qc.invalidateQueries({ queryKey: ['companies'] });
    qc.invalidateQueries({ queryKey: ['prospects'] });
  };

  // Single lead → pipeline
  const convertMutation = useMutation({
    mutationFn: (id: string) => {
      setConvertingId(id);
      return api.post<{ data: { companyName: string } }>(`/waitlist/${id}/convert`, { serviceMode });
    },
    onSuccess: (res) => {
      toast.success(`Added "${res.data.data.companyName}" to Prospects as ${serviceMode}`);
      setConvertingId(null);
      invalidate();
    },
    onError: () => { toast.error('Failed to convert lead'); setConvertingId(null); },
  });

  // Bulk convert all pending
  const convertAllMutation = useMutation({
    mutationFn: () => api.post<{ data: { converted: number; skipped: number } }>('/waitlist/convert-all', { serviceMode }),
    onSuccess: (res) => {
      const d = res.data.data;
      toast.success(`${d.converted} leads added to Prospects as ${serviceMode}${d.skipped > 0 ? ` · ${d.skipped} skipped` : ''}`);
      invalidate();
    },
    onError: () => toast.error('Bulk convert failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/waitlist/${id}/reject`),
    onSuccess: () => { toast.success('Lead excluded'); invalidate(); },
    onError: () => toast.error('Failed to exclude'),
  });

  const csvMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('source', 'organic-import');

      let authHeader: string | undefined;
      try {
        const session = await getSession();
        if (session?.accessToken) authHeader = `Bearer ${session.accessToken}`;
      } catch { /* no session */ }

      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/waitlist/import-csv`, {
        method: 'POST',
        headers: authHeader ? { Authorization: authHeader } : {},
        body: form,
      });

      const json = await res.json() as { data?: { imported: number; skipped: number; errors: number }; message?: string };
      if (!res.ok) throw { response: { data: json } };
      return { data: json };
    },
    onSuccess: (res) => {
      const d = res.data.data;
      if (d) toast.success(`Imported ${d.imported} leads · ${d.skipped} duplicates skipped${d.errors > 0 ? ` · ${d.errors} invalid rows` : ''}`);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'CSV import failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/waitlist/${id}`),
    onSuccess: () => { toast.success('Lead deleted'); invalidate(); },
    onError: () => toast.error('Failed to delete'),
  });

  const statusBadge = (status: WaitlistLead['status']) => {
    if (status === 'SENT') return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
        <CheckCircle className="h-3 w-3" />In Pipeline
      </span>
    );
    if (status === 'REJECTED') return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
        <XCircle className="h-3 w-3" />Excluded
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
        <UserPlus className="h-3 w-3" />Pending
      </span>
    );
  };

  const leads = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: stats?.total ?? 0, icon: Users, color: 'text-zinc-600' },
          { label: 'Pending', value: stats?.pending ?? 0, icon: UserPlus, color: 'text-amber-600' },
          { label: 'In Pipeline', value: stats?.sent ?? 0, icon: CheckCircle, color: 'text-blue-600' },
          { label: 'Excluded', value: stats?.rejected ?? 0, icon: XCircle, color: 'text-red-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
            <Icon className={cn('h-5 w-5 shrink-0', color)} />
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Service Mode Selector */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm font-semibold mb-1">Service Mode</p>
            <p className="text-xs text-muted-foreground">Applied when adding leads to the Prospects pipeline</p>
          </div>
          <div className="flex gap-2 ml-auto">
            {(['ERP', 'AEO', 'SEO'] as ServiceMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setServiceMode(mode)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-semibold border transition-all',
                  serviceMode === mode
                    ? SERVICE_MODE_STYLES[mode] + ' ring-2 ring-offset-1 ring-current'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Description of selected mode */}
        <div className={cn('mt-3 rounded-lg px-3 py-2 text-xs border', SERVICE_MODE_STYLES[serviceMode])}>
          {serviceMode === 'ERP' && '🏭 ERP leads — manufacturing & operations companies that need enterprise resource planning software.'}
          {serviceMode === 'AEO' && '🤖 AEO leads — businesses that need Answer Engine Optimization to appear in AI-generated search results.'}
          {serviceMode === 'SEO' && '🔍 SEO leads — businesses that need Search Engine Optimization to rank on Google.'}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="SENT">In Pipeline</option>
          <option value="REJECTED">Excluded</option>
        </select>

        <button onClick={() => refetch()} className="h-9 px-3 rounded-lg border border-input hover:bg-accent transition-colors">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* CSV Upload */}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) csvMutation.mutate(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => csvInputRef.current?.click()}
          disabled={csvMutation.isPending}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-input hover:bg-accent text-sm font-medium transition-colors disabled:opacity-50"
        >
          {csvMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Import CSV
        </button>

        {(stats?.pending ?? 0) > 0 && (
          <button
            onClick={() => convertAllMutation.mutate()}
            disabled={convertAllMutation.isPending}
            className={cn(
              'flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors text-white',
              serviceMode === 'ERP' ? 'bg-violet-600 hover:bg-violet-700' :
              serviceMode === 'AEO' ? 'bg-blue-600 hover:bg-blue-700' :
              'bg-emerald-600 hover:bg-emerald-700',
            )}
          >
            {convertAllMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ArrowRightCircle className="h-4 w-4" />}
            Add All as {serviceMode} ({stats?.pending})
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
        <ArrowRightCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Select the <strong>Service Mode</strong> above (ERP / AEO / SEO), then click <strong>Add to Pipeline</strong> to create a Company + Contact under the right service type. Each service mode uses a different email and research pipeline.
        </span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">#</th>
                <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">Name</th>
                <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">Source</th>
                <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">Imported</th>
                <th className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">Loading...</td></tr>
              )}
              {!isLoading && leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                    No organic leads yet. Import a CSV to get started.
                  </td>
                </tr>
              )}
              {leads.map((lead, i) => (
                <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{(page - 1) * 20 + i + 1}</td>
                  <td className="px-4 py-3 font-medium">{lead.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded px-2 py-0.5">
                      {lead.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(lead.createdAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3">{statusBadge(lead.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {lead.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => convertMutation.mutate(lead.id)}
                            disabled={convertingId === lead.id}
                            title={`Add to Prospects as ${serviceMode}`}
                            className={cn(
                              'flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium text-white disabled:opacity-50 transition-colors',
                              serviceMode === 'ERP' ? 'bg-violet-600 hover:bg-violet-700' :
                              serviceMode === 'AEO' ? 'bg-blue-600 hover:bg-blue-700' :
                              'bg-emerald-600 hover:bg-emerald-700',
                            )}
                          >
                            {convertingId === lead.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <ArrowRightCircle className="h-3 w-3" />}
                            {serviceMode}
                          </button>
                          <button
                            onClick={() => rejectMutation.mutate(lead.id)}
                            disabled={rejectMutation.isPending}
                            title="Exclude this lead"
                            className="h-7 px-2.5 rounded-md border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { if (confirm('Delete this lead?')) deleteMutation.mutate(lead.id); }}
                        title="Delete"
                        className="h-7 px-2.5 rounded-md border border-border hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Showing {leads.length} of {total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="h-8 px-3 rounded-lg border border-input text-sm disabled:opacity-40 hover:bg-accent transition-colors">
                Prev
              </button>
              <span className="h-8 px-3 flex items-center text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="h-8 px-3 rounded-lg border border-input text-sm disabled:opacity-40 hover:bg-accent transition-colors">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
