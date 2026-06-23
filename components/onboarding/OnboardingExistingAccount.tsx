"use client"

import React from 'react'
import { ArrowLeft, LogIn, FolderPlus } from 'lucide-react'

export default function OnboardingExistingAccount({
  email,
  firmenname,
  loading,
  error,
  onStartNewProject,
  onCancelToLogin,
  onUseDifferentEmail,
}: {
  email: string
  firmenname?: string
  loading: boolean
  error: string | null
  onStartNewProject: () => void
  onCancelToLogin: () => void
  onUseDifferentEmail: () => void
}) {
  const projectLabel = firmenname?.trim() || 'Neues Projekt'

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Dieser Account existiert bereits</h2>
        <p className="text-gray-500 text-base max-w-md mx-auto">
          Für <strong className="text-gray-800">{email}</strong> gibt es schon einen Axantilo-Account.
          Wir legen keine zweite Registrierung an und überschreiben keine bestehenden Daten.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={onStartNewProject}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          <FolderPlus size={20} />
          {loading ? 'Wird angemeldet…' : `Neues Projekt „${projectLabel}" mit diesen Daten starten`}
        </button>
        <p className="text-xs text-gray-500 text-center px-2">
          Du wirst mit deinem bestehenden Passwort angemeldet. Deine bisherigen Projekte und Chats bleiben unverändert.
        </p>

        <button
          type="button"
          disabled={loading}
          onClick={onCancelToLogin}
          className="w-full bg-white border-2 border-gray-200 hover:bg-gray-50 text-gray-800 font-semibold py-3.5 px-5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
        >
          <LogIn size={18} />
          Onboarding abbrechen und normal anmelden
        </button>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={onUseDifferentEmail}
        className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors mx-auto"
      >
        <ArrowLeft size={16} /> Andere E-Mail verwenden
      </button>
    </div>
  )
}
