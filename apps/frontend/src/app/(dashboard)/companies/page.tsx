import type { Metadata } from 'next';
import { ProspectList } from '@/components/prospects/ProspectList';

export const metadata: Metadata = { title: 'Companies' };

export default function CompaniesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
        <p className="text-muted-foreground">All prospect companies in your pipeline</p>
      </div>
      <ProspectList showResearch />
    </div>
  );
}
