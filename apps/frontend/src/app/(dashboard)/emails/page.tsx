import type { Metadata } from 'next';
import { EmailList } from '@/components/emails/EmailList';

export const metadata: Metadata = { title: 'Emails' };

export default function EmailsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Emails</h1>
        <p className="text-muted-foreground">AI-generated outreach emails across all prospects</p>
      </div>
      <EmailList />
    </div>
  );
}
