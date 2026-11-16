import type { Metadata } from 'next';
import { ApprovalQueue } from '@/components/approvals/ApprovalQueue';
import { WhatsAppAutomation } from '@/components/approvals/WhatsAppAutomation';

export const metadata: Metadata = { title: 'Approvals' };

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approval Queue</h1>
        <p className="text-muted-foreground">Review and approve AI-generated outreach emails</p>
      </div>
      <ApprovalQueue />
      <WhatsAppAutomation />
    </div>
  );
}
