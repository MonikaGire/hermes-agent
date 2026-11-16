'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  Clock,
  Ban,
  Sparkles,
  AlertCircle,
  Calendar,
  User,
  Building2,
  Tag,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConversationSummary {
  id: string;
  status: string;
  intent: string | null;
  lastMessageAt: string | null;
  followUpAt: string | null;
  followUpNote: string | null;
  company: { id: string; name: string; industry: string; serviceMode: string };
  email: {
    id: string;
    subject: string;
    serviceMode: string;
    contact: { firstName: string; lastName: string; role: string; email: string } | null;
  };
  messages: Array<{ direction: string; body: string; createdAt: string }>;
}

interface ConversationDetail extends ConversationSummary {
  messages: Array<{
    id: string;
    direction: string;
    subject: string | null;
    body: string;
    fromEmail: string | null;
    toEmail: string | null;
    intent: string | null;
    draftBody: string | null;
    approvedAt: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
}

interface DraftMessage {
  id: string;
  subject: string | null;
  body: string;
}

// ─── Intent badge ─────────────────────────────────────────────────────────────

const INTENT_CONFIG: Record<string, { label: string; color: string }> = {
  INTERESTED:      { label: 'Interested',      color: 'bg-green-100 text-green-800' },
  MEETING_REQUEST: { label: 'Wants Meeting',   color: 'bg-blue-100 text-blue-800' },
  NOT_NOW:         { label: 'Not Now',         color: 'bg-yellow-100 text-yellow-800' },
  OBJECTION:       { label: 'Objection',       color: 'bg-orange-100 text-orange-800' },
  INFO_REQUEST:    { label: 'Info Request',    color: 'bg-purple-100 text-purple-800' },
  QUESTION:        { label: 'Question',        color: 'bg-indigo-100 text-indigo-800' },
  NEGATIVE:        { label: 'Not Interested',  color: 'bg-red-100 text-red-800' },
  UNSUBSCRIBE:     { label: 'Unsubscribed',    color: 'bg-gray-100 text-gray-800' },
  REFERRAL:        { label: 'Referral',        color: 'bg-teal-100 text-teal-800' },
  UNCLEAR:         { label: 'Unclear',         color: 'bg-gray-100 text-gray-500' },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  AWAITING_REPLY:        <Clock className="h-4 w-4 text-muted-foreground" />,
  REPLIED:               <MessageSquare className="h-4 w-4 text-blue-500" />,
  DRAFT_READY:           <Sparkles className="h-4 w-4 text-amber-500" />,
  PENDING_SEND_APPROVAL: <AlertCircle className="h-4 w-4 text-orange-500" />,
  REPLY_SENT:            <CheckCircle2 className="h-4 w-4 text-green-500" />,
  MEETING_BOOKED:        <Calendar className="h-4 w-4 text-blue-600" />,
  FOLLOW_UP_SCHEDULED:   <Clock className="h-4 w-4 text-purple-500" />,
  SUPPRESSED:            <Ban className="h-4 w-4 text-red-400" />,
  CLOSED:                <XCircle className="h-4 w-4 text-gray-400" />,
};

// ─── Main component ───────────────────────────────────────────────────────────

export function InboxView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [draftBody, setDraftBody] = useState<string>('');
  const [editingDraft, setEditingDraft] = useState(false);
  const queryClient = useQueryClient();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', statusFilter],
    queryFn: () =>
      api.get<{ data: ConversationSummary[] }>(
        `/conversations${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
      ).then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: detail } = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () =>
      selectedId
        ? api.get<{ data: ConversationDetail }>(`/conversations/${selectedId}`).then((r) => r.data.data)
        : null,
    enabled: !!selectedId,
  });

  const { data: draftMsg } = useQuery({
    queryKey: ['conversation-draft', selectedId],
    queryFn: () =>
      selectedId
        ? api.get<{ data: DraftMessage | null }>(`/conversations/${selectedId}/draft`).then((r) => r.data.data)
        : null,
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (draftMsg?.body) setDraftBody(draftMsg.body);
  }, [draftMsg]);

  const approveDraft = useMutation({
    mutationFn: ({ id, messageId, body }: { id: string; messageId: string; body: string }) =>
      api.post(`/conversations/${id}/approve-draft`, { messageId, editedBody: body }),
    onSuccess: () => {
      toast.success('Reply sent');
      setEditingDraft(false);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-draft', selectedId] });
    },
    onError: () => toast.error('Failed to send reply'),
  });

  const discardDraft = useMutation({
    mutationFn: ({ id, messageId }: { id: string; messageId: string }) =>
      api.post(`/conversations/${id}/discard-draft`, { messageId }),
    onSuccess: () => {
      toast.info('Draft discarded');
      void queryClient.invalidateQueries({ queryKey: ['conversation-draft', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => toast.error('Failed to discard draft'),
  });

  const regenerate = useMutation({
    mutationFn: (id: string) => api.post(`/conversations/${id}/regenerate-draft`),
    onSuccess: () => {
      toast.success('New draft generated');
      void queryClient.invalidateQueries({ queryKey: ['conversation-draft', selectedId] });
    },
    onError: () => toast.error('Draft regeneration failed'),
  });

  const suppress = useMutation({
    mutationFn: (id: string) => api.post(`/conversations/${id}/suppress`, { reason: 'Manually suppressed' }),
    onSuccess: () => {
      toast.info('Conversation suppressed');
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const statusFilters = [
    { value: 'all', label: 'All' },
    { value: 'DRAFT_READY', label: 'Draft Ready' },
    { value: 'REPLIED', label: 'Replied' },
    { value: 'AWAITING_REPLY', label: 'Awaiting Reply' },
    { value: 'FOLLOW_UP_SCHEDULED', label: 'Follow-up' },
    { value: 'SUPPRESSED', label: 'Suppressed' },
  ];

  return (
    <div className="flex h-full gap-4">
      {/* ── Left: conversation list ── */}
      <div className="flex w-96 shrink-0 flex-col rounded-lg border bg-card">
        {/* Filters */}
        <div className="border-b p-3">
          <div className="flex flex-wrap gap-1">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === f.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading conversations…</div>
          ) : !conversations?.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No conversations yet. Replies will appear here automatically after emails are sent.
            </div>
          ) : (
            conversations.map((conv) => {
              const intentCfg = conv.intent ? INTENT_CONFIG[conv.intent] : null;
              const lastMsg = conv.messages[0];
              return (
                <button
                  key={conv.id}
                  onClick={() => { setSelectedId(conv.id); setEditingDraft(false); }}
                  className={cn(
                    'w-full p-4 text-left hover:bg-accent transition-colors',
                    selectedId === conv.id && 'bg-primary/5 border-l-2 border-l-primary',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {STATUS_ICON[conv.status] ?? <MessageSquare className="h-4 w-4" />}
                        <span className="truncate font-medium text-sm">{conv.company.name}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {conv.email.contact
                          ? `${conv.email.contact.firstName} ${conv.email.contact.lastName} · ${conv.email.contact.role}`
                          : 'Unknown contact'}
                      </p>
                      {lastMsg && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {lastMsg.direction === 'INBOUND' ? '← ' : '→ '}
                          {lastMsg.body.slice(0, 60)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={cn('rounded px-1.5 py-0.5 text-xs', conv.company.serviceMode === 'AEO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                        {conv.email.serviceMode}
                      </span>
                      {intentCfg && (
                        <span className={cn('rounded px-1.5 py-0.5 text-xs', intentCfg.color)}>
                          {intentCfg.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {conv.lastMessageAt && (
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {new Date(conv.lastMessageAt).toLocaleDateString()}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: conversation detail ── */}
      {selectedId && detail ? (
        <div className="flex flex-1 flex-col gap-4 min-w-0">
          {/* Header */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{detail.company.name}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground">{detail.company.industry}</span>
                </div>
                {detail.email.contact && (
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span>{detail.email.contact.firstName} {detail.email.contact.lastName}</span>
                    <span>·</span>
                    <span>{detail.email.contact.role}</span>
                    <span>·</span>
                    <span>{detail.email.contact.email}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Status: {detail.status}</span>
                  {detail.intent && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-xs', INTENT_CONFIG[detail.intent]?.color)}>
                        {INTENT_CONFIG[detail.intent]?.label}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => suppress.mutate(selectedId)}
                className="shrink-0 rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                Suppress
              </button>
            </div>
          </div>

          {/* Thread messages */}
          <div className="flex-1 overflow-y-auto rounded-lg border bg-card p-4 space-y-4">
            {detail.messages
              .filter((m) => m.direction !== 'DRAFT')
              .map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-2xl rounded-lg p-4',
                    msg.direction === 'OUTBOUND'
                      ? 'ml-auto bg-primary/10'
                      : 'bg-muted',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={cn('text-xs font-medium', msg.direction === 'OUTBOUND' ? 'text-primary' : 'text-foreground')}>
                      {msg.direction === 'OUTBOUND' ? 'You → ' + (msg.toEmail ?? '') : (msg.fromEmail ?? 'Prospect')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {msg.subject && (
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Re: {msg.subject}</p>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.body}</p>
                  {msg.intent && (
                    <span className={cn('mt-2 inline-block rounded px-1.5 py-0.5 text-xs', INTENT_CONFIG[msg.intent]?.color)}>
                      Intent: {INTENT_CONFIG[msg.intent]?.label}
                    </span>
                  )}
                </div>
              ))}
          </div>

          {/* AI Draft reply */}
          {draftMsg && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-sm">AI Draft Reply</span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Needs your approval</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingDraft(!editingDraft); if (!editingDraft) setDraftBody(draftMsg.body); }}
                    className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  >
                    {editingDraft ? 'Cancel edit' : 'Edit'}
                  </button>
                  <button
                    onClick={() => regenerate.mutate(selectedId)}
                    disabled={regenerate.isPending}
                    className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn('h-3 w-3', regenerate.isPending && 'animate-spin')} />
                    Regenerate
                  </button>
                </div>
              </div>

              {editingDraft ? (
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border bg-background p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{draftMsg.body}</p>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() =>
                    approveDraft.mutate({
                      id: selectedId,
                      messageId: draftMsg.id,
                      body: editingDraft ? draftBody : draftMsg.body,
                    })
                  }
                  disabled={approveDraft.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {approveDraft.isPending ? 'Sending…' : 'Approve & Send'}
                </button>
                <button
                  onClick={() => discardDraft.mutate({ id: selectedId, messageId: draftMsg.id })}
                  disabled={discardDraft.isPending}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <XCircle className="h-4 w-4" />
                  Discard
                </button>
              </div>
            </div>
          )}

          {/* Follow-up note */}
          {detail.followUpAt && detail.status === 'FOLLOW_UP_SCHEDULED' && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">Follow-up scheduled</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(detail.followUpAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
              {detail.followUpNote && (
                <p className="mt-1 text-sm text-muted-foreground">{detail.followUpNote}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg border bg-card">
          <div className="text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">Select a conversation to view</p>
          </div>
        </div>
      )}
    </div>
  );
}
