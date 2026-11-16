import type { Metadata } from 'next';
import { DiscoveryPanel } from '@/components/discovery/DiscoveryPanel';

export const metadata: Metadata = { title: 'Discovery' };

export default function ResearchPage() {
  return <DiscoveryPanel />;
}
