"use client"

import React from 'react';
import AuthForm from '@/components/auth/AuthForm';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { loadSessions } from '@/lib/supabase-chat';

export default function LoginPage() {
  const router = useRouter();

  // After auth: a user who has never onboarded (no sessions) gets sent to the
  // onboarding form instead of an empty dashboard. Returning users → dashboard.
  const handleSuccess = async () => {
    try {
      const sessions = await loadSessions();
      router.push(sessions.length > 0 ? '/dashboard' : '/onboarding');
    } catch {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 bg-grid">
      <div className="w-full max-w-sm mb-6 flex justify-between items-center">
        <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Zurück zur Startseite
        </Link>
      </div>
      <AuthForm onSuccess={handleSuccess} defaultMode="login" />
    </div>
  );
}
