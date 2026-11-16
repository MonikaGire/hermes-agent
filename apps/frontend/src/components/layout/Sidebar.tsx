'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCircle,
  Search,
  Mail,
  CheckSquare,
  Settings,
  Zap,
  ClipboardList,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app.store';
import { api } from '@/lib/api';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/research', label: 'Discovery', icon: Search },
  { href: '/prospects', label: 'Prospects', icon: Users },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: UserCircle },
  { href: '/emails', label: 'Emails', icon: Mail },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/waitlist', label: 'Organic Leads', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, pendingApprovalCount, setPendingApprovalCount, draftReadyCount, setDraftReadyCount } = useAppStore();

  useEffect(() => {
    const fetchPending = () => {
      api.get<{ data: unknown[] }>('/approvals/pending')
        .then((res) => setPendingApprovalCount(res.data.data.length))
        .catch(() => null);
    };
    const fetchDraftReady = () => {
      api.get<{ data: { draftReady: number } }>('/conversations/stats')
        .then((res) => setDraftReadyCount(res.data.data.draftReady))
        .catch(() => null);
    };
    fetchPending();
    fetchDraftReady();
    const interval = setInterval(() => { fetchPending(); fetchDraftReady(); }, 30_000);
    return () => clearInterval(interval);
  }, [setPendingApprovalCount, setDraftReadyCount]);

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-200',
        sidebarOpen ? 'w-60' : 'w-16',
      )}
    >
      <div className="flex h-16 items-center border-b px-4">
        <Zap className="h-6 w-6 text-primary shrink-0" />
        {sidebarOpen && (
          <span className="ml-2 text-lg font-bold tracking-tight">HERMES</span>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2 pt-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          const isApprovals = href === '/approvals';
          const isInbox = href === '/inbox';
          const badgeCount = isApprovals ? pendingApprovalCount : isInbox ? draftReadyCount : 0;
          const showBadge = badgeCount > 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                !sidebarOpen && 'justify-center',
              )}
              title={!sidebarOpen ? label : undefined}
            >
              <span className="relative shrink-0">
                <Icon className="h-4 w-4" />
                {showBadge && !sidebarOpen && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                )}
              </span>
              {sidebarOpen && (
                <>
                  <span className="flex-1">{label}</span>
                  {showBadge && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
