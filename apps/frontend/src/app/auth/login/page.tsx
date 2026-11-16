import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = { title: 'Sign In' };

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">HERMES</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            AI-powered manufacturing ERP sales automation
          </p>
        </div>
        <Suspense fallback={<div className="h-64 rounded-2xl bg-card animate-pulse" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
