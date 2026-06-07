"use client"

import React from 'react'
import { Settings, LogOut } from 'lucide-react'
import type { AccountDisplayInfo } from '@/lib/account-display'

type Props = {
  account: AccountDisplayInfo
  onSettings?: () => void
  onLogout?: () => void
  className?: string
}

export default function SidebarAccountOverview({
  account,
  onSettings,
  onLogout,
  className = '',
}: Props) {
  return (
    <div
      className={`shrink-0 border-t border-gray-100 px-3 py-3 ${className}`}
      aria-label="Account-Übersicht"
    >
      <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-gray-50 transition-colors">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white"
          aria-hidden
        >
          {account.initial}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{account.displayName}</p>
          {account.email ? (
            <p className="truncate text-xs text-gray-500" title={account.email}>
              {account.email}
            </p>
          ) : null}
          {account.subtitle ? (
            <p className="truncate text-[11px] text-gray-400 mt-0.5">{account.subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {onSettings ? (
            <button
              type="button"
              onClick={onSettings}
              className="p-2 text-gray-400 rounded-lg hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Eingangsbereich"
              aria-label="Eingangsbereich öffnen"
            >
              <Settings size={16} />
            </button>
          ) : null}
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="p-2 text-gray-400 rounded-lg hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Abmelden"
              aria-label="Abmelden"
            >
              <LogOut size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
