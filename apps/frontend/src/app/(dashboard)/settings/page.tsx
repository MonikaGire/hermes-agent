import type { Metadata } from 'next';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Configure integrations, targeting, and system preferences</p>
      </div>
      <SettingsPanel />
    </div>
  );
}
