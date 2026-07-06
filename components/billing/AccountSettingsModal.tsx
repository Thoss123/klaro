"use client"

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CreditCard, LogOut, Settings, User, X, Loader2 } from 'lucide-react'
import type { AccountDisplayInfo } from '@/lib/account-display'
import type { BillingStatus } from '@/components/billing/useBillingStatus'

type Props = {
  open: boolean
  account: AccountDisplayInfo | null
  status: BillingStatus | null
  loading?: boolean
  checkoutLoading?: boolean
  error?: string | null
  onClose: () => void
  onCheckout: () => void
  onLogout?: () => void
}

type Tab = 'general' | 'billing'

function formatCredits(value: number | undefined): string {
  if (value === undefined) return '...'
  return value.toLocaleString('de-DE')
}

export default function AccountSettingsModal({
  open,
  account,
  status,
  loading = false,
  checkoutLoading = false,
  error,
  onClose,
  onCheckout,
  onLogout,
}: Props) {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.18 }}
            className="flex h-[min(720px,88vh)] w-full max-w-4xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50/80 p-3">
              <button
                type="button"
                onClick={onClose}
                className="mb-6 rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                aria-label="Einstellungen schließen"
              >
                <X size={20} />
              </button>

              <nav className="space-y-1">
                <button
                  type="button"
                  onClick={() => setTab('general')}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    tab === 'general' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-600 hover:bg-white/70'
                  }`}
                >
                  <Settings size={18} />
                  Allgemein
                </button>
                <button
                  type="button"
                  onClick={() => setTab('billing')}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    tab === 'billing' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-600 hover:bg-white/70'
                  }`}
                >
                  <CreditCard size={18} />
                  Abrechnung
                </button>
              </nav>
            </aside>

            <main className="min-w-0 flex-1 overflow-y-auto p-6">
              {tab === 'general' ? (
                <section>
                  <h2 className="text-2xl font-semibold text-gray-950">Allgemein</h2>
                  <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center gap-4">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-indigo-600 text-base font-bold text-white">
                        {account?.initial ?? 'A'}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-gray-950">{account?.displayName ?? 'Account'}</p>
                        {account?.email ? (
                          <p className="truncate text-sm text-gray-500">{account.email}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <User size={18} className="text-gray-500" />
                        <div>
                          <p className="text-sm font-semibold text-gray-950">Konto</p>
                          <p className="text-sm text-gray-500">Einstellungen für Anmeldung und Account.</p>
                        </div>
                      </div>
                      {onLogout ? (
                        <button
                          type="button"
                          onClick={onLogout}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          <LogOut size={16} />
                          Abmelden
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : (
                <section>
                  <h2 className="text-2xl font-semibold text-gray-950">Abrechnung</h2>
                  <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Aktuelles Guthaben</p>
                    <p className="mt-2 text-3xl font-bold text-gray-950">
                      {loading ? '...' : `${formatCredits(status?.balance)} Credits`}
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      Credits werden nach tatsächlichem API-Verbrauch abgerechnet.
                    </p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Top-up</p>
                    <div className="mt-3 flex items-end gap-2">
                      <span className="text-4xl font-bold text-gray-950">€{status?.topup.priceEur ?? 49}</span>
                      <span className="pb-1 text-sm text-gray-500">einmalig</span>
                    </div>
                    <p className="mt-3 text-sm text-gray-700">
                      +{formatCredits(status?.topup.credits ?? 6000)} Credits. Kein Abo, keine automatische Verlängerung.
                    </p>
                    <button
                      type="button"
                      onClick={onCheckout}
                      disabled={checkoutLoading}
                      className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
                    >
                      {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                      Credits aufladen
                    </button>
                    {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
                  </div>
                </section>
              )}
            </main>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

