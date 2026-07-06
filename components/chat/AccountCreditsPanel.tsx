"use client"

import React, { useCallback, useEffect, useState } from 'react'
import { CreditCard, Loader2 } from 'lucide-react'

type BillingStatus = {
  balance: number
  lifetimeGranted: number
  topup: {
    priceEur: number
    credits: number
  }
}

export default function AccountCreditsPanel() {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/status')
      .then(async res => {
        if (!res.ok) throw new Error('Credits konnten nicht geladen werden')
        return res.json() as Promise<BillingStatus>
      })
      .then(data => {
        if (!cancelled) setStatus(data)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const startCheckout = useCallback(async () => {
    setCheckoutLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Checkout konnte nicht gestartet werden')
      }
      window.location.href = data.url
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setCheckoutLoading(false)
    }
  }, [])

  if (loading) {
    return (
      <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-400">
        Credits werden geladen…
      </div>
    )
  }

  if (!status) {
    return error ? (
      <p className="mt-2 px-1 text-[11px] text-gray-400">{error}</p>
    ) : null
  }

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Credits</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {status.balance.toLocaleString('de-DE')} verfügbar
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Aufladen: {status.topup.credits.toLocaleString('de-DE')} Credits für {status.topup.priceEur}€
          </p>
        </div>
        <button
          type="button"
          onClick={startCheckout}
          disabled={checkoutLoading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
        >
          {checkoutLoading ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
          Aufladen
        </button>
      </div>
      {error ? <p className="mt-2 text-[11px] text-red-500">{error}</p> : null}
    </div>
  )
}

