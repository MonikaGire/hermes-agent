'use client';

import { signOut } from 'next-auth/react';
import { Menu, LogOut, Bell } from 'lucide-react';
import { useAppStore } from '@/store/app.store';
import { cn } from '@/lib/utils';

interface HeaderProps {
  user: { name?: string | null; email?: string | null };
}

export function Header({ user }: HeaderProps) {
  const { toggleSidebar, pendingApprovalCount } = useAppStore();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <button
        onClick={toggleSidebar}
        className="rounded-lg p-2 hover:bg-accent transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-3">
        <button className="relative rounded-lg p-2 hover:bg-accent transition-colors" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {pendingApprovalCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {pendingApprovalCount > 99 ? '99+' : pendingApprovalCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 border-l pl-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            {user.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <button
          onClick={() => void signOut({ callbackUrl: '/auth/login' })}
          className="rounded-lg p-2 hover:bg-accent transition-colors text-muted-foreground hover:text-destructive"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
