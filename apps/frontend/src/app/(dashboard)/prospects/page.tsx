import type { Metadata } from 'next';
import { ProspectList } from '@/components/prospects/ProspectList';

export const metadata: Metadata = { title: 'Prospects' };

export default function ProspectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prospects</h1>
        <p className="text-muted-foreground">Manage and track manufacturing prospect companies</p>
      </div>
      <ProspectList />
    </div>
  );
}
