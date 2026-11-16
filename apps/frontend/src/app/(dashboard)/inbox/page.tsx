import type { Metadata } from 'next';
import { InboxView } from '@/components/inbox/InboxView';

export const metadata: Metadata = { title: 'Inbox — Conversations' };

export default function InboxPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground">
          Reply tracking, AI-drafted responses, and conversation management
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <InboxView />
      </div>
    </div>
  );
}
