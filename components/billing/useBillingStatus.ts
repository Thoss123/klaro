"use client"

import { useCallback, useEffect, useState } from 'react'

export type BillingLedgerEntry = {
  action: string
  credits: number
  balance_after: number | null
  api_cost_eur: number | null
  input_tokens: number | null
  output_tokens: number | null
  model: string | null
  created_at: string
}

export type BillingStatus = {
  balance: number
  lifetimeGranted: number
  topup: {
    priceEur: number
    credits: number
  }
  lastDebits: BillingLedgerEntry[]
}

export function useBillingStatus(enabled = true) {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) return null
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/status')
      if (!res.ok) throw new Error('Credits konnten nicht geladen werden')
      const data = await res.json() as BillingStatus
      setStatus(data)
      return data
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    let cancelled = false
    if (!enabled) return () => {
      cancelled = true
    }

    const timer = window.setTimeout(() => {
      if (!cancelled) refresh()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabled, refresh])

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

  return {
    status,
    loading,
    checkoutLoading,
    error,
    refresh,
    startCheckout,
    clearError: () => setError(null),
  }
}

