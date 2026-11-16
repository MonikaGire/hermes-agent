'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { MessageCircle, Send, ChevronDown, ChevronUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const COMMANDS = [
  { cmd: 'list', desc: 'Show pending approvals (up to 5)' },
  { cmd: 'approve <id>', desc: 'Approve an email by short ID' },
  { cmd: 'skip <id>', desc: 'Skip an email' },
  { cmd: 'revise <id> <notes>', desc: 'Queue a revision with instructions' },
  { cmd: 'stats', desc: 'Dashboard overview' },
  { cmd: 'help', desc: 'Show all commands' },
];

export function WhatsAppAutomation() {
  const [phone, setPhone] = useState('');
  const [expanded, setExpanded] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['whatsapp', 'status'],
    queryFn: () =>
      api.get<{ configured: boolean }>('/whatsapp/status').then((r) => r.data),
    staleTime: 60_000,
  });

  const notify = useMutation({
    mutationFn: (phoneNumber: string) =>
      api.post<{ success: boolean; sent: number }>('/whatsapp/notify', { phoneNumber }),
    onSuccess: (res) => {
      const sent = res.data.sent;
      if (sent === 0) {
        toast.info('No pending emails to send');
      } else {
        toast.success(`Sent ${sent} approval${sent !== 1 ? 's' : ''} to WhatsApp`);
      }
    },
    onError: () => toast.error('Failed to push to WhatsApp'),
  });

  const configured = status?.configured ?? false;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="h-9 w-9 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">WhatsApp Automation</p>
          <p className="text-xs text-muted-foreground">Approve emails directly from WhatsApp</p>
        </div>
        <span
          className={cn(
            'text-xs px-2 py-1 rounded-full font-medium shrink-0',
            configured
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {configured ? 'Connected' : 'Not configured'}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t">
          {configured ? (
            <>
              {/* Push to WhatsApp */}
              <div className="pt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Push Pending Approvals
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    placeholder="+1 415 555 0100"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => notify.mutate(phone)}
                    disabled={!phone.trim() || notify.isPending}
                    className="flex items-center gap-2 h-9 px-4 rounded-md bg-[#25D366] text-white text-sm font-medium hover:bg-[#1ebe5d] disabled:opacity-50 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {notify.isPending ? 'Sending...' : 'Send'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sends up to 5 pending emails as WhatsApp messages with one-tap approve/skip/revise shortcuts.
                </p>
              </div>

              {/* Webhook info */}
              <div className="rounded-lg bg-muted/30 border p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="font-medium">Webhook configured</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Point your Twilio WhatsApp sandbox to:
                </p>
                <code className="text-xs bg-muted px-2 py-1 rounded block font-mono break-all">
                  POST {typeof window !== 'undefined' ? window.location.origin.replace(/:\d+$/, ':4000') : 'http://localhost:4000'}/api/whatsapp/webhook
                </code>
              </div>

              {/* Commands reference */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Bot Commands
                </p>
                <div className="rounded-lg border divide-y text-xs">
                  {COMMANDS.map(({ cmd, desc }) => (
                    <div key={cmd} className="flex items-start gap-3 px-3 py-2">
                      <code className="font-mono text-foreground shrink-0 w-36">{cmd}</code>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Setup instructions */
            <div className="pt-4 space-y-3">
              <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                  <p className="font-medium">WhatsApp not configured</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Add the following to your <code className="font-mono">.env</code> file to enable WhatsApp automation via Twilio.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-zinc-950 text-green-400 p-4 font-mono text-xs space-y-1">
                <p className="text-zinc-500"># Twilio credentials (twilio.com/console)</p>
                <p>TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</p>
                <p>TWILIO_AUTH_TOKEN=your_auth_token</p>
                <p className="mt-2 text-zinc-500"># WhatsApp sender number (e.g. Twilio sandbox: +14155238886)</p>
                <p>WHATSAPP_FROM_NUMBER=+14155238886</p>
              </div>

              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Sign up at <span className="font-medium text-foreground">twilio.com</span> and activate the WhatsApp sandbox</li>
                <li>Add the three env vars above and restart the backend</li>
                <li>
                  Set the Twilio sandbox webhook to{' '}
                  <code className="font-mono bg-muted px-1 rounded">POST /api/whatsapp/webhook</code>
                </li>
                <li>Send <code className="font-mono bg-muted px-1 rounded">help</code> to the bot to verify it&apos;s working</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
