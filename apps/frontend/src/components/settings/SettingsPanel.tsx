'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useState } from 'react';
import { Wifi, Mail, Key, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';

interface Integration { provider: string; isActive: boolean; hasKey: boolean; maskedKey: string | null }

const API_KEY_PROVIDERS: { provider: string; label: string; description: string; docsUrl: string }[] = [
  { provider: 'serpapi', label: 'SerpAPI', description: 'Real Google search results for company discovery', docsUrl: 'https://serpapi.com' },
  { provider: 'openai', label: 'OpenAI', description: 'AI research, email generation, and analysis', docsUrl: 'https://platform.openai.com' },
  { provider: 'apollo', label: 'Apollo.io', description: 'Company and contact database', docsUrl: 'https://apollo.io' },
  { provider: 'hunter', label: 'Hunter.io', description: 'Email finding and verification', docsUrl: 'https://hunter.io' },
];

export function SettingsPanel() {
  const [testEmail, setTestEmail] = useState('');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ data: Record<string, unknown> }>('/settings').then((r) => r.data.data),
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => api.get<{ data: Integration[] }>('/integrations').then((r) => r.data.data),
  });

  const saveKey = useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      api.patch(`/integrations/${provider}`, { apiKey }),
    onSuccess: (_, vars) => {
      toast.success(`${vars.provider} key saved`);
      setKeyInputs((p) => ({ ...p, [vars.provider]: '' }));
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: () => toast.error('Failed to save key'),
  });

  const testSerpApi = useMutation({
    mutationFn: () => api.post('/integrations/serpapi/test'),
    onSuccess: () => toast.success('SerpAPI connected — real Google results ready!'),
    onError: () => toast.error('SerpAPI test failed — check your key'),
  });

  const testOpenAI = useMutation({
    mutationFn: () => api.post('/settings/test-openai'),
    onSuccess: () => toast.success('OpenAI connected successfully'),
    onError: () => toast.error('OpenAI connection failed'),
  });

  const testSmtp = useMutation({
    mutationFn: () => api.post('/settings/test-email', { to: testEmail }),
    onSuccess: () => toast.success(`Test email sent to ${testEmail}`),
    onError: () => toast.error('Email test failed'),
  });

  if (isLoading) {
    return <div className="animate-pulse h-48 rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-6">

      {/* API Keys */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Key className="h-4 w-4" /> API Keys</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Configure external services. Keys are stored securely and masked after saving.</p>
        </div>

        {integrationsLoading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {API_KEY_PROVIDERS.map(({ provider, label, description, docsUrl }) => {
              const integration = integrations?.find((i) => i.provider === provider);
              const inputVal = keyInputs[provider] ?? '';
              const isVisible = showKey[provider] ?? false;

              return (
                <div key={provider} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{label}</p>
                        {integration?.hasKey ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Configured
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <XCircle className="h-3.5 w-3.5" /> Not set
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                    {provider === 'serpapi' && integration?.hasKey && (
                      <button
                        onClick={() => testSerpApi.mutate()}
                        disabled={testSerpApi.isPending}
                        className="h-8 px-3 rounded border text-xs hover:bg-accent disabled:opacity-50"
                      >
                        {testSerpApi.isPending ? 'Testing…' : 'Test'}
                      </button>
                    )}
                  </div>

                  {integration?.hasKey && (
                    <p className="text-xs font-mono text-muted-foreground bg-muted/40 px-2 py-1 rounded">
                      {integration.maskedKey}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isVisible ? 'text' : 'password'}
                        placeholder={integration?.hasKey ? 'Enter new key to replace…' : `Paste your ${label} API key…`}
                        value={inputVal}
                        onChange={(e) => setKeyInputs((p) => ({ ...p, [provider]: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((p) => ({ ...p, [provider]: !isVisible }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      onClick={() => saveKey.mutate({ provider, apiKey: inputVal })}
                      disabled={!inputVal.trim() || saveKey.isPending}
                      className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50 hover:bg-primary/90"
                    >
                      Save
                    </button>
                    <a
                      href={docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3 rounded-md border text-xs flex items-center hover:bg-accent"
                    >
                      Get Key
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    <div className="grid gap-6 lg:grid-cols-2">
      {/* Integrations */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold">Integrations</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <Wifi className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium">OpenAI</p>
                <p className="text-xs text-muted-foreground">Model: {data?.['openaiModel'] as string ?? 'gpt-4o'}</p>
              </div>
            </div>
            <button
              onClick={() => testOpenAI.mutate()}
              disabled={testOpenAI.isPending}
              className="h-8 px-3 rounded border text-xs hover:bg-accent disabled:opacity-50"
            >
              {testOpenAI.isPending ? 'Testing...' : 'Test'}
            </button>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Email / SMTP</p>
                <p className="text-xs text-muted-foreground">Provider: {data?.['emailProvider'] as string ?? 'smtp'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="test@email.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="h-8 rounded border border-input bg-background px-2 text-xs w-36 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                onClick={() => testSmtp.mutate()}
                disabled={!testEmail || testSmtp.isPending}
                className="h-8 px-3 rounded border text-xs hover:bg-accent disabled:opacity-50"
              >
                {testSmtp.isPending ? 'Sending...' : 'Test'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Targeting */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold">Targeting Configuration</h3>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Target Industries</p>
            <div className="flex flex-wrap gap-1">
              {((data?.['targetIndustries'] as string[]) ?? []).map((i) => (
                <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{i}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Target Countries</p>
            <div className="flex flex-wrap gap-1">
              {((data?.['targetCountries'] as string[]) ?? []).map((c) => (
                <span key={c} className="rounded-full bg-accent px-2 py-0.5 text-xs">{c}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Company Size</p>
            <p>{data?.['companySizeMin'] as number ?? 20} – {data?.['companySizeMax'] as number ?? 500} employees</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Email Length</p>
            <p>{data?.['emailWordMin'] as number ?? 80} – {data?.['emailWordMax'] as number ?? 180} words</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Review Score Threshold</p>
            <p>{data?.['reviewScoreThreshold'] as number ?? 8}/10 (minimum to pass)</p>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
