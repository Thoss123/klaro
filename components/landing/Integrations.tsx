import {
  SiGmail,
  SiGooglesheets,
  SiGoogledrive,
  SiGooglecalendar,
  SiSlack,
  SiNotion,
  SiHubspot,
  SiAirtable,
  SiOpenai,
  SiWhatsapp,
  SiShopify,
  SiStripe,
  SiTrello,
  SiWordpress,
  SiMeta,
  SiTelegram,
} from 'react-icons/si';
import { section, sectionY, h2, lead } from './landing-styles';

const TOOLS = [
  { Icon: SiGmail, label: 'Gmail', color: '#EA4335' },
  { Icon: SiGooglesheets, label: 'Sheets', color: '#34A853' },
  { Icon: SiGoogledrive, label: 'Drive', color: '#1FA463' },
  { Icon: SiGooglecalendar, label: 'Kalender', color: '#4285F4' },
  { Icon: SiSlack, label: 'Slack', color: '#4A154B' },
  { Icon: SiNotion, label: 'Notion', color: '#111827' },
  { Icon: SiHubspot, label: 'HubSpot', color: '#FF7A59' },
  { Icon: SiAirtable, label: 'Airtable', color: '#18BFFF' },
  { Icon: SiOpenai, label: 'OpenAI', color: '#111827' },
  { Icon: SiWhatsapp, label: 'WhatsApp', color: '#25D366' },
  { Icon: SiShopify, label: 'Shopify', color: '#7AB55C' },
  { Icon: SiStripe, label: 'Stripe', color: '#635BFF' },
  { Icon: SiTrello, label: 'Trello', color: '#0052CC' },
  { Icon: SiWordpress, label: 'WordPress', color: '#21759B' },
  { Icon: SiMeta, label: 'Meta', color: '#0866FF' },
  { Icon: SiTelegram, label: 'Telegram', color: '#26A5E4' },
] as const;

export default function Integrations() {
  return (
    <section className={`${section} ${sectionY} bg-slate-50 border-y border-gray-200/80`}>
      <h2 className={h2}>Über 1.800 Integrationen — wir haben auch deine Tools.</h2>
      <p className={lead}>
        Axantilo knüpft an das an, was ihr schon nutzt: Mail, Tabellen, CRM, Kalender,
        Social. Kein Tool-Wechsel — du verbindest nur, was der Ablauf braucht.
      </p>

      <div className="mt-12 rounded-3xl border border-gray-200 bg-white p-6 sm:p-10 shadow-sm">
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 sm:gap-4">
          {TOOLS.map(({ Icon, label, color }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-slate-50/80 p-3 sm:p-4 hover:border-indigo-200 hover:bg-white transition-colors"
            >
              <Icon size={28} style={{ color }} aria-hidden />
              <span className="text-[10px] sm:text-xs font-medium text-gray-600 text-center leading-tight">
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 text-center sm:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-600 text-white text-sm font-bold px-5 py-2 shadow-sm">
            +1.800 weitere
          </span>
          <p className="text-sm text-gray-600 max-w-md leading-relaxed">
            Google-Dienste oft in wenigen Klicks — andere Tools per Zugang oder API-Key,
            Schritt für Schritt im Editor erklärt.
          </p>
        </div>
      </div>
    </section>
  );
}
