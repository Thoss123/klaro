"use client"

import { X, Check, CreditCard, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { BillingStatus } from '@/components/billing/useBillingStatus'

type Props = {
  open: boolean
  status: BillingStatus | null
  checkoutLoading?: boolean
  error?: string | null
  onClose: () => void
  onCheckout: () => void
}

function formatCredits(value: number | undefined): string {
  if (value === undefined) return '...'
  return value.toLocaleString('de-DE')
}

export default function UpgradeModal({
  open,
  status,
  checkoutLoading = false,
  error,
  onClose,
  onCheckout,
}: Props) {
  const topupCredits = formatCredits(status?.topup.credits ?? 6000)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Testphase</p>
                <h2 className="mt-1 text-2xl font-bold text-gray-950">Credits aufladen</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Credits gelten für Chatten und Bauen. Laufende Workflows verbrauchen kaum Credits.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="Schließen"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-500">Testphase</p>
                <h3 className="mt-3 text-lg font-bold text-gray-950">Free starten</h3>
                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-950">€0</span>
                  <span className="pb-1 text-sm text-gray-500">inklusive</span>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  2.000 Start-Credits für die ersten Coach- und Build-Runden.
                </p>
                <ul className="mt-5 flex-1 space-y-3 text-sm text-gray-700">
                  {['2.000 Start-Credits pro Account', 'Diagnose und erste Workflows testen', 'Projekte unbegrenzt in der Testphase'].map(item => (
                    <li key={item} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-gray-900" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Top-up</p>
                <h3 className="mt-3 text-lg font-bold text-gray-950">Mehr Credits zum Bauen</h3>
                <div className="mt-6 flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-950">€{status?.topup.priceEur ?? 49}</span>
                  <span className="pb-1 text-sm text-gray-500">einmalig</span>
                </div>
                <p className="mt-3 text-sm text-gray-600">
                  +{topupCredits} Credits für intensiveres Testen und Bauen.
                </p>
                <ul className="mt-5 flex-1 space-y-3 text-sm text-gray-700">
                  {['Für mehrere Coach- und Build-Runden', 'Nach tatsächlichem API-Verbrauch abgerechnet', 'Kein Abo, keine automatische Verlängerung'].map(item => (
                    <li key={item} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-indigo-700" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onCheckout}
                  disabled={checkoutLoading}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-60"
                >
                  {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  Credits aufladen
                </button>
              </div>
            </div>

            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
            <p className="mt-4 text-xs text-gray-400">
              Testzahlungen laufen über Stripe. Für lokale Tests nutze die Stripe-Testkarte.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

