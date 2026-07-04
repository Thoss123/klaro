'use client';

import { useEffect } from 'react';

// Scroll-Reveal für alle .rv-Elemente innerhalb von .landing-v2.
export function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll('.landing-v2 .rv').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
