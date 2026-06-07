'use client';

import { smoothScrollToId } from '@/lib/smooth-scroll';

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export default function ScrollAnchorLink({ href, className, children }: Props) {
  const id = href.startsWith('#') ? href.slice(1) : href;

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        smoothScrollToId(id);
        if (typeof history !== 'undefined' && history.pushState) {
          history.pushState(null, '', href);
        }
      }}
    >
      {children}
    </a>
  );
}
