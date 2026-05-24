import React from 'react';
import { Bot } from 'lucide-react';

export default function HowItWorks() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16 sm:py-24">
      <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight text-center mb-16">
        So funktioniert Klaro
      </h2>

      <div className="grid md:grid-cols-3 gap-8 sm:gap-6">
        {/* Step 1 */}
        <Step
          number="1"
          label="Klaro stellt dir die richtigen Fragen"
        >
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-blue-600" />
            </div>
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl px-4 py-3 text-xs text-gray-700 leading-relaxed">
              Welche Aufgabe frisst bei euch jede Woche am meisten Zeit?
            </div>
          </div>
        </Step>

        {/* Step 2 */}
        <Step
          number="2"
          label="Während ihr redet entsteht dein Canvas"
        >
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-800">
                Angebote erstellen
              </span>
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                Hoch
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed mb-3">
              Manuelle Angebote dauern zu lange und sind fehleranfällig.
            </p>
            <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
              3–4h / Woche
            </span>
          </div>
        </Step>

        {/* Step 3 */}
        <Step
          number="3"
          label="Du bekommst einen Plan den du sofort nutzen kannst"
        >
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
            {['Angebots-Vorlagen mit KI', 'E-Mail-Triage automatisieren', 'Wissensdatenbank aufbauen'].map(
              (item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-indigo-600 text-white text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-gray-700">{item}</span>
                </div>
              )
            )}
          </div>
        </Step>
      </div>
    </section>
  );
}

function Step({
  number,
  label,
  children,
}: {
  number: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 mb-5">
        <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-gray-200 text-gray-700 font-bold text-sm">
          {number}
        </span>
        <h3 className="text-base font-semibold text-gray-900 leading-tight">
          {label}
        </h3>
      </div>
      <div className="bg-slate-50 border border-gray-100 rounded-2xl p-5 flex-1 flex items-center">
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
