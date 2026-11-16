'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Search, Globe, Mail, Phone, MessageCircle, Download, RefreshCw, CheckSquare, Square, Zap, Plus, ChevronDown, ChevronUp, X, Tag, AlertTriangle, MapPin, Star, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const INDUSTRIES = ['Electronics', 'Packaging', 'Plastics', 'Medical devices', 'Chemicals', 'Machinery', 'Food manufacturing'];
const COUNTRIES = ['USA', 'UK', 'Australia', 'Singapore', 'India', 'Germany', 'Canada', 'UAE'];

type SearchSource = 'ai' | 'maps';
type ServiceMode = 'ERP' | 'AEO' | 'SEO';

const SERVICE_MODES: { mode: ServiceMode; label: string; desc: string; color: string; active: string }[] = [
  { mode: 'ERP', label: 'ERP', desc: 'Manufacturing & operations companies needing enterprise software', color: 'border-violet-200 text-violet-700 bg-violet-50', active: 'bg-violet-600 text-white border-violet-600' },
  { mode: 'AEO', label: 'AEO', desc: 'Businesses needing to appear in AI-generated search answers', color: 'border-blue-200 text-blue-700 bg-blue-50', active: 'bg-blue-600 text-white border-blue-600' },
  { mode: 'SEO', label: 'SEO', desc: 'Businesses needing better Google search rankings', color: 'border-emerald-200 text-emerald-700 bg-emerald-50', active: 'bg-emerald-600 text-white border-emerald-600' },
];

interface ExtractedContact { type: 'email' | 'phone' | 'whatsapp'; value: string; label?: string }
interface DiscoveredCompany {
  companyName: string; website: string; industry: string; country: string;
  region?: string; estimatedEmployees?: number; confidence: number;
  rationale: string; contacts: ExtractedContact[]; source: 'google' | 'ai' | 'maps';
}

interface MapsMetrics {
  total: number; with_website: number; with_phone: number; with_email: number;
  pct_website: number; pct_phone: number; pct_email: number;
}

interface SearchForm {
  industry: string; country: string; region: string; keywords: string; limit: number;
}

const BLANK: SearchForm = { industry: 'Electronics', country: 'USA', region: '', keywords: '', limit: 10 };
const MAPS_BLANK: SearchForm = { industry: 'Machinery', country: 'India', region: 'Mumbai', keywords: '', limit: 20 };

interface Integration { provider: string; isActive: boolean; hasKey: boolean; maskedKey: string | null }

export function DiscoveryPanel() {
  const [source, setSource] = useState<SearchSource>('ai');
  const [form, setForm] = useState<SearchForm>(BLANK);
  const [mapsForm, setMapsForm] = useState<SearchForm>(MAPS_BLANK);
  const [mapsMetrics, setMapsMetrics] = useState<MapsMetrics | null>(null);

  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<{ data: Integration[] }>('/integrations').then((r) => r.data.data),
  });
  const serpApi = integrations?.find((i) => i.provider === 'serpapi');
  const hasSerpApi = serpApi?.hasKey ?? false;
  const [results, setResults] = useState<DiscoveredCompany[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [autoResearch, setAutoResearch] = useState(false);
  const [autoEmail, setAutoEmail] = useState(false);
  const [serviceMode, setServiceMode] = useState<ServiceMode>('ERP');
  const [manualForm, setManualForm] = useState(false);
  const [manual, setManual] = useState<Partial<DiscoveredCompany>>({
    industry: 'Electronics', country: 'USA', contacts: [],
  });
  const [scrapeUrl, setScrapeUrl] = useState('');

  const searchMutation = useMutation({
    mutationFn: () => api.post<{ data: DiscoveredCompany[] }>('/discovery/search', form).then(r => r.data.data),
    onSuccess: (data) => {
      setResults(data);
      setSelected(new Set());
      setMapsMetrics(null);
      toast.success(`Found ${data.length} companies`);
    },
    onError: () => toast.error('Search failed'),
  });

  const mapsSearchMutation = useMutation({
    mutationFn: () =>
      api.post<{ data: DiscoveredCompany[]; meta?: { metrics?: MapsMetrics } }>('/discovery/maps-search', mapsForm, { timeout: 180000 })
        .then(r => r.data),
    onSuccess: (res) => {
      const data = (res as unknown as { data: DiscoveredCompany[] }).data;
      setResults(data);
      setSelected(new Set());
      // metrics come via the response meta or we compute them client-side
      const metrics: MapsMetrics = {
        total: data.length,
        with_website: data.filter(d => d.website).length,
        with_phone: data.filter(d => d.contacts.some(c => c.type === 'phone')).length,
        with_email: data.filter(d => d.contacts.some(c => c.type === 'email')).length,
        pct_website: data.length ? Math.round(data.filter(d => d.website).length / data.length * 100) : 0,
        pct_phone: data.length ? Math.round(data.filter(d => d.contacts.some(c => c.type === 'phone')).length / data.length * 100) : 0,
        pct_email: data.length ? Math.round(data.filter(d => d.contacts.some(c => c.type === 'email')).length / data.length * 100) : 0,
      };
      setMapsMetrics(metrics);
      toast.success(`Found ${data.length} real companies via Google Maps`);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Maps search failed — make sure the scraper service is running');
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: (url: string) =>
      api.post<{ data: ExtractedContact[] }>('/discovery/scrape', { website: url, companyName: manual.companyName ?? '' })
        .then(r => r.data.data),
    onSuccess: (contacts) => {
      setManual(m => ({ ...m, contacts }));
      toast.success(`Found ${contacts.length} contacts`);
    },
    onError: () => toast.error('Could not scrape contacts from that URL'),
  });

  const importMutation = useMutation({
    mutationFn: (companies: DiscoveredCompany[]) =>
      api.post<{ data: { imported: number; skipped: number } }>('/discovery/import', {
        companies, autoResearch, autoEmail, serviceMode,
      }).then(r => r.data.data),
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} companies${data.skipped > 0 ? ` (${data.skipped} already existed)` : ''}`);
      if (autoResearch) toast.info('Research jobs queued automatically');
    },
    onError: () => toast.error('Import failed'),
  });

  const toggleSelect = (i: number) => setSelected(s => {
    const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n;
  });
  const toggleAll = () => setSelected(selected.size === results.length ? new Set() : new Set(results.map((_, i) => i)));
  const toggleExpand = (i: number) => setExpanded(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const importSelected = () => {
    const companies = [...selected].map(i => results[i]!);
    importMutation.mutate(companies);
  };

  const importAll = () => importMutation.mutate(results);

  const addManual = () => {
    if (!manual.companyName || !manual.industry || !manual.country) {
      toast.error('Company name, industry and country are required');
      return;
    }
    const company: DiscoveredCompany = {
      companyName: manual.companyName ?? '',
      website: manual.website ?? '',
      industry: manual.industry ?? 'Electronics',
      country: manual.country ?? 'USA',
      region: manual.region,
      estimatedEmployees: manual.estimatedEmployees,
      confidence: 1,
      rationale: 'Manually added',
      contacts: manual.contacts ?? [],
      source: 'ai',
    };
    setResults(r => [company, ...r]);
    setManual({ industry: 'Electronics', country: 'USA', contacts: [] });
    setScrapeUrl('');
    setManualForm(false);
    toast.success('Company added to results');
  };

  const confidenceColor = (c: number) =>
    c >= 0.8 ? 'text-green-600 bg-green-50' : c >= 0.6 ? 'text-amber-600 bg-amber-50' : 'text-red-500 bg-red-50';

  const contactIcon = (type: ExtractedContact['type']) =>
    type === 'email' ? <Mail className="h-3 w-3" /> :
    type === 'whatsapp' ? <MessageCircle className="h-3 w-3 text-green-500" /> :
    <Phone className="h-3 w-3" />;

  return (
    <div className="space-y-6">
      {/* Search Panel */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="bg-primary px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-primary-foreground">Company Discovery</h2>
            <p className="text-xs text-primary-foreground/70 mt-0.5">
              Find real manufacturing prospects via Google Maps or AI search
            </p>
          </div>
          <Globe className="h-6 w-6 text-primary-foreground/60" />
        </div>

        {/* Source tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-700">
          <button
            onClick={() => setSource('maps')}
            className={cn(
              'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors',
              source === 'maps'
                ? 'border-primary text-primary'
                : 'border-transparent text-zinc-500 hover:text-zinc-700',
            )}
          >
            <MapPin className="h-4 w-4" />
            Google Maps
            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">Real</span>
          </button>
          <button
            onClick={() => setSource('ai')}
            className={cn(
              'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors',
              source === 'ai'
                ? 'border-primary text-primary'
                : 'border-transparent text-zinc-500 hover:text-zinc-700',
            )}
          >
            <Search className="h-4 w-4" />
            AI / SerpAPI
          </button>
        </div>

        <div className="p-6 space-y-4 bg-white dark:bg-zinc-900">

          {/* Google Maps search form */}
          {source === 'maps' && (
            <>
              {hasSerpApi ? (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <strong>SerpAPI Google Maps</strong> — pulls real businesses directly from Google Maps via API.
                    Returns verified phone, address, website, ratings. Fast and reliable.{' '}
                    <span className="text-emerald-700 font-semibold">SerpAPI key active ✓</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <strong>No SerpAPI key detected.</strong> Google Maps search requires a SerpAPI key to return real business leads.
                    The free Playwright scraper is unreliable because Google blocks headless browsers.{' '}
                    <a href="/settings" className="underline font-semibold text-amber-700">Add SerpAPI key in Settings →</a>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Industry *</label>
                  <select value={mapsForm.industry} onChange={e => setMapsForm(f => ({ ...f, industry: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Country *</label>
                  <select value={mapsForm.country} onChange={e => setMapsForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">City / Region *</label>
                  <input type="text" placeholder="e.g. Mumbai, Pune, Chennai" value={mapsForm.region}
                    onChange={e => setMapsForm(f => ({ ...f, region: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Results Limit</label>
                  <select value={mapsForm.limit} onChange={e => setMapsForm(f => ({ ...f, limit: Number(e.target.value) }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    {[10, 20, 30, 50, 100].map(n => <option key={n} value={n}>{n} companies</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Keywords (optional)</label>
                <input type="text" placeholder='e.g. "CNC machining" OR "plastic injection" OR "precision parts"'
                  value={mapsForm.keywords} onChange={e => setMapsForm(f => ({ ...f, keywords: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>

              {/* Service Mode */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                  <Tag className="h-3 w-3" /> Service Mode
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {SERVICE_MODES.map(({ mode, label, desc, color, active }) => (
                    <button key={mode} type="button" onClick={() => setServiceMode(mode)}
                      className={cn('rounded-xl border-2 px-4 py-3 text-left transition-all', serviceMode === mode ? active : `${color} hover:opacity-80`)}>
                      <p className="text-sm font-bold">{label}</p>
                      <p className={cn('text-xs mt-0.5 leading-tight', serviceMode === mode ? 'text-white/80' : 'opacity-70')}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button
                  onClick={() => mapsSearchMutation.mutate()}
                  disabled={mapsSearchMutation.isPending}
                  className="flex items-center gap-2 h-10 px-6 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {mapsSearchMutation.isPending
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Scraping Maps…</>
                    : <><MapPin className="h-4 w-4" /> Search Google Maps</>}
                </button>
                <button onClick={() => setManualForm(m => !m)}
                  className="flex items-center gap-2 h-10 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300">
                  <Plus className="h-4 w-4" /> Add Manually
                </button>
                {mapsSearchMutation.isPending && (
                  <span className="text-xs text-zinc-500">
                    {hasSerpApi ? 'Fetching from Google Maps API + crawling websites…' : 'Takes 1–3 min (Playwright scraper + website crawl)…'}
                  </span>
                )}
              </div>
            </>
          )}

          {/* AI / SerpAPI search form */}
          {source === 'ai' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Industry *</label>
                  <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100">
                    {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Country *</label>
                  <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100">
                    {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Region / City</label>
                  <input type="text" placeholder="e.g. Texas, Mumbai" value={form.region}
                    onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Results Limit</label>
                  <select value={form.limit} onChange={e => setForm(f => ({ ...f, limit: Number(e.target.value) }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100">
                    {[5, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n} companies</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Keywords (optional)</label>
                <input type="text" placeholder='e.g. "plastic injection molding" OR "PCB assembly"' value={form.keywords}
                  onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100" />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                  <Tag className="h-3 w-3" /> Service Mode — what will these companies need?
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {SERVICE_MODES.map(({ mode, label, desc, color, active }) => (
                    <button key={mode} type="button" onClick={() => setServiceMode(mode)}
                      className={cn('rounded-xl border-2 px-4 py-3 text-left transition-all', serviceMode === mode ? active : `${color} hover:opacity-80`)}>
                      <p className="text-sm font-bold">{label}</p>
                      <p className={cn('text-xs mt-0.5 leading-tight', serviceMode === mode ? 'text-white/80' : 'opacity-70')}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button onClick={() => searchMutation.mutate()} disabled={searchMutation.isPending}
                  className="flex items-center gap-2 h-10 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {searchMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {searchMutation.isPending ? 'Searching…' : `Search ${serviceMode} Companies`}
                </button>
                <button onClick={() => setManualForm(m => !m)}
                  className="flex items-center gap-2 h-10 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300">
                  <Plus className="h-4 w-4" />
                  Add Manually
                </button>
                <div className="ml-auto">
                  {hasSerpApi ? (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                      Using Google Search (real results)
                    </span>
                  ) : (
                    <a href="/settings" className="flex items-center gap-1.5 text-xs text-amber-600 font-medium hover:underline">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      AI-generated leads (not real) · Add SerpAPI key in Settings
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Maps metrics */}
      {mapsMetrics && mapsMetrics.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Companies found', value: mapsMetrics.total, color: 'text-zinc-900' },
            { label: 'Have website', value: `${mapsMetrics.with_website} (${mapsMetrics.pct_website}%)`, color: 'text-blue-700' },
            { label: 'Have phone', value: `${mapsMetrics.with_phone} (${mapsMetrics.pct_phone}%)`, color: 'text-emerald-700' },
            { label: 'Have email', value: `${mapsMetrics.with_email} (${mapsMetrics.pct_email}%)`, color: 'text-violet-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Manual Add Form */}
      {manualForm && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
          <div className="bg-zinc-800 dark:bg-zinc-700 px-6 py-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Add Company Manually</h3>
            <button onClick={() => setManualForm(false)} className="text-white/60 hover:text-white"><X className="h-4 w-4" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {([['Company Name', 'companyName', true], ['Website', 'website', false]] as const).map(([label, key, req]) => (
                <div key={key}>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                    {label}{req && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input type="text" placeholder={key === 'companyName' ? 'Acme Electronics Ltd' : 'https://example.com'}
                    value={(manual[key as keyof typeof manual] as string) ?? ''}
                    onChange={e => setManual(m => ({ ...m, [key]: e.target.value }))}
                    className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Industry *</label>
                <select value={manual.industry ?? ''} onChange={e => setManual(m => ({ ...m, industry: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100">
                  {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Country *</label>
                <select value={manual.country ?? ''} onChange={e => setManual(m => ({ ...m, country: e.target.value }))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100">
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Employees</label>
                <input type="number" placeholder="150" value={manual.estimatedEmployees ?? ''}
                  onChange={e => setManual(m => ({ ...m, estimatedEmployees: Number(e.target.value) || undefined }))}
                  className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100" />
              </div>
            </div>

            {/* Contact scraper */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Scrape Contacts from Website</label>
              <div className="flex gap-2">
                <input type="url" placeholder="https://company.com/contact"
                  value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)}
                  className="flex-1 h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-zinc-900 dark:text-zinc-100" />
                <button onClick={() => scrapeMutation.mutate(scrapeUrl)} disabled={!scrapeUrl || scrapeMutation.isPending}
                  className="h-10 px-4 rounded-lg bg-zinc-800 text-white text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors">
                  {scrapeMutation.isPending ? 'Scraping…' : 'Scrape'}
                </button>
              </div>
            </div>

            {/* Manually typed contacts */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Contacts Found / Enter Manually</label>
              <div className="space-y-2">
                {(manual.contacts ?? []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm">
                    {contactIcon(c.type)}
                    <span className="text-xs text-zinc-500 capitalize">{c.type}</span>
                    <span className="text-zinc-700 dark:text-zinc-200">{c.value}</span>
                    <button onClick={() => setManual(m => ({ ...m, contacts: (m.contacts ?? []).filter((_, j) => j !== i) }))}
                      className="ml-auto text-zinc-400 hover:text-red-500"><X className="h-3 w-3" /></button>
                  </div>
                ))}
                <div className="flex gap-2">
                  {(['email', 'phone', 'whatsapp'] as const).map(type => (
                    <button key={type} onClick={() => {
                      const val = window.prompt(`Enter ${type}:`);
                      if (val) setManual(m => ({ ...m, contacts: [...(m.contacts ?? []), { type, value: val }] }));
                    }} className="h-8 px-3 rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500 hover:border-primary hover:text-primary transition-colors">
                      + {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button onClick={() => setManualForm(false)}
                className="h-10 px-5 rounded-lg border border-zinc-200 text-sm font-medium hover:bg-zinc-50 transition-colors text-zinc-700">
                Cancel
              </button>
              <button onClick={addManual}
                className="h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                Add to Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
          {/* Results toolbar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
            <div className="flex items-center gap-3">
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-sm text-zinc-600 hover:text-primary">
                {selected.size === results.length ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                {selected.size === results.length ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-xs text-zinc-400">{results.length} found · {selected.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Auto options */}
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                <input type="checkbox" checked={autoResearch} onChange={e => setAutoResearch(e.target.checked)} className="rounded" />
                Auto-research
              </label>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer">
                <input type="checkbox" checked={autoEmail} onChange={e => setAutoEmail(e.target.checked)} className="rounded" />
                Auto-email
              </label>
              <div className="w-px h-4 bg-zinc-200" />
              {selected.size > 0 && (
                <button onClick={importSelected} disabled={importMutation.isPending}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" />
                  Import {selected.size} selected
                </button>
              )}
              <button onClick={importAll} disabled={importMutation.isPending}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-zinc-800 dark:bg-zinc-600 text-white text-xs font-medium hover:bg-zinc-700 disabled:opacity-50">
                <Zap className="h-3.5 w-3.5" />
                Import All
              </button>
            </div>
          </div>

          {/* Company list */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {results.map((company, i) => (
              <div key={i} className={cn('transition-colors', selected.has(i) && 'bg-primary/5')}>
                <div className="flex items-start gap-3 px-5 py-4">
                  <button onClick={() => toggleSelect(i)} className="mt-0.5 flex-shrink-0">
                    {selected.has(i)
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4 text-zinc-300" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{company.companyName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-500">{company.industry}</span>
                          <span className="text-zinc-300">·</span>
                          <span className="text-xs text-zinc-500">{company.region ? `${company.region}, ` : ''}{company.country}</span>
                          {company.estimatedEmployees && (
                            <><span className="text-zinc-300">·</span>
                            <span className="text-xs text-zinc-500">{company.estimatedEmployees} employees</span></>
                          )}
                          <span className={cn('text-xs font-medium rounded-full px-1.5 py-0.5', confidenceColor(company.confidence))}>
                            {Math.round(company.confidence * 100)}%
                          </span>
                          <span className={cn('text-xs rounded-full px-1.5 py-0.5',
                            company.source === 'google' ? 'bg-blue-50 text-blue-600' :
                            company.source === 'maps' ? 'bg-emerald-50 text-emerald-700' :
                            'bg-purple-50 text-purple-600')}>
                            {company.source === 'google' ? 'Google' : company.source === 'maps' ? 'Maps' : 'AI'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {company.website && (
                          <a href={company.website} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate max-w-36">
                            {company.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        )}
                        <button onClick={() => toggleExpand(i)} className="text-zinc-400 hover:text-zinc-600">
                          {expanded.has(i) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Contacts row */}
                    {company.contacts.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {company.contacts.slice(0, 4).map((c, j) => (
                          <span key={j} className="inline-flex items-center gap-1 text-xs bg-zinc-100 dark:bg-zinc-700 rounded-md px-2 py-0.5 text-zinc-600 dark:text-zinc-300">
                            {contactIcon(c.type)}
                            {c.value}
                          </span>
                        ))}
                        {company.contacts.length > 4 && (
                          <span className="text-xs text-zinc-400">+{company.contacts.length - 4} more</span>
                        )}
                      </div>
                    )}

                    {/* Expanded rationale */}
                    {expanded.has(i) && (
                      <p className="mt-2 text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 leading-relaxed">
                        {company.rationale}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && !searchMutation.isPending && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 p-16 text-center">
          <Globe className="h-10 w-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-500">Search for companies to get started</p>
          <p className="text-xs text-zinc-400 mt-1">Select industry, country and region, then click Search</p>
        </div>
      )}
    </div>
  );
}
