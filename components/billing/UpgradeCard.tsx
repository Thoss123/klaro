"use client"

import { CreditCard, Sparkles } from 'lucide-react'
import type { BillingStatus } from '@/components/billing/useBillingStatus'

type Props = {
  variant: 'sidebar' | 'chat'
  status: BillingStatus | null
  loading?: boolean
  onOpen: () => void
}

export default function UpgradeCard({ variant, status, loading = false, onOpen }: Props) {
  const balance = status?.balance ?? 0
  const lifetimeGranted = status?.lifetimeGranted ?? 0
  const usedPercent = lifetimeGranted > 0
    ? Math.min(100, Math.max(0, Math.round(((lifetimeGranted - balance) / lifetimeGranted) * 100)))
    : 0
  const shouldShowChatBanner = loading || usedPercent >= 80
  const isLow = status ? usedPercent >= 80 : false

  if (variant === 'chat') {
    if (!shouldShowChatBanner) return null

    return (
      <div className="px-3 sm:px-4 pb-2">
        <button
          type="button"
          onClick={onOpen}
          className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
            isLow
              ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'
              : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${isLow ? 'text-amber-800' : 'text-gray-700'}`}>
                {loading ? 'Credits werden geladen...' : `${usedPercent}% deines Guthabens verbraucht`}
              </p>
              <p className={`mt-0.5 truncate text-[11px] ${isLow ? 'text-amber-700' : 'text-gray-500'}`}>
                Mehr bauen? Credits aufladen
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white">
              <Sparkles size={12} />
              Upgrade
            </span>
          </div>
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Testphase</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {loading ? 'Credits laden...' : 'Credits & Upgrade'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Guthaben und Aufladung im Account
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-semibold text-white">
          <CreditCard size={13} />
          Upgrade
        </span>
      </div>
    </button>
  )
}

