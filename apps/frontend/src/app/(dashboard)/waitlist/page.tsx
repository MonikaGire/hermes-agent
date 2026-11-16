import { Metadata } from 'next';
import { WaitlistPanel } from '@/components/waitlist/WaitlistPanel';

export const metadata: Metadata = { title: 'Organic Leads' };

export default function WaitlistPage() {
  return <WaitlistPanel />;
}
