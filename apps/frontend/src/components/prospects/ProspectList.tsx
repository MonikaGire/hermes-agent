'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Search, RefreshCw, X, FlaskConical, Users } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';

type ServiceMode = 'ERP' | 'AEO' | 'SEO';

interface Prospect {
  id: string;
  name: string;
  website?: string;
  industry: string;
  country: string;
  employeeCount?: number;
  status: string;
  serviceMode: ServiceMode;
  createdAt: string;
}

const SERVICE_MODE_STYLES: Record<ServiceMode, string> = {
  ERP: 'bg-violet-100 text-violet-700',
  AEO: 'bg-blue-100 text-blue-700',
  SEO: 'bg-emerald-100 text-emerald-700',
};

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  RESEARCHING: 'bg-yellow-100 text-yellow-800',
  RESEARCHED: 'bg-purple-100 text-purple-800',
  EMAIL_DRAFT: 'bg-orange-100 text-orange-800',
  EMAIL_PENDING: 'bg-amber-100 text-amber-800',
  EMAIL_APPROVED: 'bg-cyan-100 text-cyan-800',
  EMAIL_SENT: 'bg-green-100 text-green-800',
  REPLIED: 'bg-emerald-100 text-emerald-800',
  CONVERTED: 'bg-green-200 text-green-900',
  SKIPPED: 'bg-gray-100 text-gray-500',
};

interface AddProspectForm {
  companyName: string;
  website: string;
  industry: string;
  country: string;
  employeeCount: string;
  revenueEstimate: string;
  notes: string;
}

const BLANK_FORM: AddProspectForm = {
  companyName: '', website: '', industry: '', country: '',
  employeeCount: '', revenueEstimate: '', notes: '',
};

export function ProspectList({ showResearch = false }: { showResearch?: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [serviceModeFilter, setServiceModeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<AddProspectForm>(BLANK_FORM);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['prospects', { search, page, serviceModeFilter }],
    queryFn: () => {
      const params = new URLSearchParams({ search, page: String(page), limit: '20' });
      if (serviceModeFilter) params.set('serviceMode', serviceModeFilter);
      return api
        .get<{ data: Prospect[]; meta: { total: number; totalPages: number } }>(`/prospects?${params}`)
        .then((r) => r.data);
    },
    placeholderData: (prev) => prev,
  });

  const research = useMutation({
    mutationFn: (id: string) => api.post(`/prospects/${id}/research`),
    onSuccess: () => {
      toast.success('Research started');
      void queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to start research');
    },
  });

  const findContacts = useMutation({
    mutationFn: (id: string) =>
      api.post<{ data: { created: number; reachable?: boolean }; message?: string }>(`/prospects/${id}/find-contacts`)
        .then((r) => ({ ...r.data.data, message: r.data.message })),
    onSuccess: (result) => {
      if (result.created > 0) {
        toast.success(`Found ${result.created} contact${result.created !== 1 ? 's' : ''} — check Contacts`);
        void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      } else if (result.reachable === false) {
        toast.warning(result.message ?? 'Website unreachable — this company may not exist. Use Google Maps discovery to find real companies.');
      } else {
        toast.info('Website reachable but no contact details found (no email or phone on the page)');
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to find contacts');
    },
  });

  const addProspect = useMutation({
    mutationFn: (data: AddProspectForm) => {
      let website = data.website.trim();
      if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
      return api.post('/prospects', {
        ...data,
        website: website || undefined,
        employeeCount: data.employeeCount ? Number(data.employeeCount) : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Prospect added');
      setShowModal(false);
      setForm(BLANK_FORM);
      void queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Failed to add prospect');
    },
  });

  const changeServiceMode = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: ServiceMode }) =>
      api.patch(`/prospects/${id}`, { serviceMode: mode }),
    onSuccess: (_, vars) => {
      toast.success(`Service mode changed to ${vars.mode}`);
      void queryClient.invalidateQueries({ queryKey: ['prospects'] });
    },
    onError: () => toast.error('Failed to change service mode'),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search prospects..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={serviceModeFilter}
          onChange={(e) => { setServiceModeFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All Services</option>
          <option value="ERP">ERP</option>
          <option value="AEO">AEO</option>
          <option value="SEO">SEO</option>
        </select>
        <button
          onClick={() => void refetch()}
          className="flex items-center gap-2 h-9 px-3 rounded-md border hover:bg-accent text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add Prospect
        </button>
      </div>

      {/* Add Prospect Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="bg-primary px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-primary-foreground">Add Prospect</h2>
                <p className="text-xs text-primary-foreground/70 mt-0.5">Add a manufacturing company to target</p>
              </div>
              <button onClick={() => { setShowModal(false); setForm(BLANK_FORM); }} className="rounded-full p-1.5 hover:bg-white/20 text-primary-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); addProspect.mutate(form); }}
              className="p-6 space-y-4 bg-white dark:bg-zinc-900"
            >
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Company Name', key: 'companyName', required: true, placeholder: 'Apex Electronics Ltd' },
                  { label: 'Website', key: 'website', placeholder: 'https://example.com' },
                ].map(({ label, key, required, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
                      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      required={required}
                      placeholder={placeholder}
                      value={form[key as keyof AddProspectForm]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Industry', key: 'industry', required: true, placeholder: 'Electronics' },
                  { label: 'Country', key: 'country', required: true, placeholder: 'USA' },
                ].map(({ label, key, required, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
                      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      required={required}
                      placeholder={placeholder}
                      value={form[key as keyof AddProspectForm]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Employee Count</label>
                  <input type="number" placeholder="120" value={form.employeeCount}
                    onChange={(e) => setForm((f) => ({ ...f, employeeCount: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Revenue Estimate</label>
                  <input type="text" placeholder="$10M–$50M" value={form.revenueEstimate}
                    onChange={(e) => setForm((f) => ({ ...f, revenueEstimate: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">Notes</label>
                <textarea rows={2} placeholder="Any notes about this prospect..."
                  value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button type="button" onClick={() => { setShowModal(false); setForm(BLANK_FORM); }}
                  className="h-10 px-5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300">
                  Cancel
                </button>
                <button type="submit" disabled={addProspect.isPending}
                  className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {addProspect.isPending ? 'Adding…' : 'Add Prospect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Industry</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Country</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employees</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Service</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Added</th>
                {showResearch && <th className="text-right px-4 py-3 font-medium text-muted-foreground min-w-[220px]">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: showResearch ? 8 : 7 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: showResearch ? 8 : 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data?.data.length === 0 ? (
                <tr>
                  <td colSpan={showResearch ? 8 : 7} className="px-4 py-12 text-center text-muted-foreground">
                    No prospects yet. Add your first prospect to get started.
                  </td>
                </tr>
              ) : (
                data?.data.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        {p.website && (
                          <a
                            href={p.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            {p.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.industry}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.country}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.employeeCount?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', SERVICE_MODE_STYLES[p.serviceMode] ?? 'bg-gray-100 text-gray-600')}>
                          {p.serviceMode}
                        </span>
                        {/* Cycle through modes on click */}
                        <button
                          onClick={() => {
                            const modes: ServiceMode[] = ['ERP', 'AEO', 'SEO'];
                            const next = modes[(modes.indexOf(p.serviceMode) + 1) % modes.length]!;
                            changeServiceMode.mutate({ id: p.id, mode: next });
                          }}
                          title="Click to change service mode"
                          className="h-4 w-4 rounded text-muted-foreground hover:text-foreground transition-colors text-xs"
                        >
                          ↻
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600',
                        )}
                      >
                        {p.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatRelative(p.createdAt)}</td>
                    {showResearch && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => research.mutate(p.id)}
                            disabled={research.isPending}
                            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors"
                            title="Run AI research on this company"
                          >
                            <FlaskConical className="h-3.5 w-3.5" />
                            Research
                          </button>
                          <button
                            onClick={() => findContacts.mutate(p.id)}
                            disabled={findContacts.isPending || !p.website}
                            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                            title={p.website ? 'Scrape website for contacts' : 'No website — cannot find contacts'}
                          >
                            <Users className="h-3.5 w-3.5" />
                            Find Contacts
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Page {page} of {data.meta.totalPages} ({data.meta.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 px-3 rounded border text-sm disabled:opacity-40 hover:bg-accent"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={page === data.meta.totalPages}
                className="h-8 px-3 rounded border text-sm disabled:opacity-40 hover:bg-accent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
