import Image from 'next/image';
import type { ReactNode } from 'react';

export type IntegrationItem = {
  label: string;
  /** Fertiges Icon (z. B. react-icons/si mit Markenfarbe). */
  icon?: ReactNode;
  /** Fallback für Tools ohne Icon-Paket: Favicon über die Domain laden. */
  domain?: string;
};

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

export default function IntegrationChips({
  items,
  moreLabel,
}: {
  items: IntegrationItem[];
  moreLabel: string;
}) {
  return (
    <div className="integr-row rv rv-d2">
      {items.map((item) => (
        <span className="chip" key={item.label}>
          {item.icon}
          {!item.icon && item.domain && (
            <Image src={faviconUrl(item.domain)} alt="" width={18} height={18} unoptimized />
          )}
          {item.label}
        </span>
      ))}
      <span className="chip chip-more">{moreLabel}</span>
    </div>
  );
}
