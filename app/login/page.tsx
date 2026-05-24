"use client"

import React from 'react';
import AuthForm from '@/components/auth/AuthForm';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 bg-grid">
      <div className="w-full max-w-sm mb-6 flex justify-between items-center">
        <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Zurück zur Startseite
        </Link>
      </div>
      <AuthForm onSuccess={() => router.push('/dashboard')} defaultMode="login" />
    </div>
  );
}
