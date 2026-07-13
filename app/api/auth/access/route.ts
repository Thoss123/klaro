import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_ALLOWLIST_MESSAGE,
  isAuthAllowlistEnforced,
  isEmailAllowedForAuth,
} from '@/lib/auth-allowlist';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  const allowed = isEmailAllowedForAuth(email);
  return NextResponse.json({
    allowed,
    enforced: isAuthAllowlistEnforced(),
    message: allowed ? null : AUTH_ALLOWLIST_MESSAGE,
  });
}
