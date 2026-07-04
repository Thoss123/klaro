'use client';

import { useEffect, useRef } from 'react';

export type ChatLine = { role: 'ai' | 'user' | 'sys'; text: string };

// Animierte Chat-Demo: startet beim Scroll-Kontakt und loopt alle 13s.
// Maximal 6 Zeilen (die nth-child-Delays in styles.ts decken 1–6 ab).
export default function ChatDemo({ title, lines }: { title: string; lines: ChatLine[] }) {
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chat = chatRef.current;
    if (!chat || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let loop: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          chat.classList.add('play');
          io.unobserve(chat);
          loop = setInterval(() => {
            chat.classList.remove('play');
            chat.querySelectorAll('.chat-line').forEach((l) => {
              const el = l as HTMLElement;
              el.style.animation = 'none';
              void el.offsetWidth;
              el.style.animation = '';
            });
            requestAnimationFrame(() => chat.classList.add('play'));
          }, 13000);
        });
      },
      { threshold: 0.4 }
    );
    io.observe(chat);

    return () => {
      io.disconnect();
      if (loop) clearInterval(loop);
    };
  }, []);

  return (
    <div className="chat rv rv-d2" ref={chatRef}>
      <div className="chat-head">
        <span className="logo-dot" />
        <span>{title}</span>
      </div>
      <div className="chat-body">
        {lines.map((line, i) => (
          <div key={i} className={`chat-line ${line.role}`}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
