'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono, Caveat } from 'next/font/google';

const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-display',
});
const bodyFont = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});
const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});
const accentFont = Caveat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-accent',
});

// Blau/Schwarz/Grau/Weiß-Palette + geschwungene Akzentschrift (Caveat) statt Versalien.
// Inhalte, Layout und Animationen entsprechen exakt der gelieferten Makler-Landingpage.
const styles = `
:root{
  --ink:#0B1220;
  --ink-soft:#141E33;
  --paper:#F6F8FC;
  --paper-warm:#EAEFF7;
  --live:#2F6BFF;
  --live-dim:rgba(47,107,255,.16);
  --teal:#7FA6F5;
  --text:#111827;
  --text-mute:#5C6B82;
  --text-on-dark:#E9EEF7;
  --text-on-dark-mute:#93A2BC;
  --line:rgba(17,24,39,.12);
  --line-dark:rgba(233,238,247,.12);
  --radius:14px;
}
.landing-v2 *{margin:0;padding:0;box-sizing:border-box}
.landing-v2{font-family:var(--font-body);color:var(--text);background:var(--paper);line-height:1.6;font-size:17px;-webkit-font-smoothing:antialiased}
.landing-v2 img,.landing-v2 svg{display:block;max-width:100%}
.landing-v2 a{color:inherit}
.landing-v2 .wrap{max-width:1120px;margin:0 auto;padding:0 24px}
.landing-v2 .mono{font-family:var(--font-mono);font-size:.78rem;letter-spacing:.06em;text-transform:uppercase}

/* ---------- wavy accent labels (statt Versalien) ---------- */
.landing-v2 .eyebrow,
.landing-v2 .hero-eyebrow,
.landing-v2 .area-head .mono,
.landing-v2 .countchip{
  font-family:var(--font-accent);
  text-transform:none;
  letter-spacing:0;
  font-weight:600;
}
.landing-v2 .eyebrow{font-size:1.35rem}
.landing-v2 .hero-eyebrow{font-size:1.2rem}
.landing-v2 .area-head .mono{font-size:1.4rem}
.landing-v2 .countchip{font-size:1.25rem}

/* ---------- reveal ---------- */
.landing-v2 .rv{opacity:0;transform:translateY(26px);transition:opacity .7s ease,transform .7s ease}
.landing-v2 .rv.in{opacity:1;transform:none}
.landing-v2 .rv-d1{transition-delay:.08s}.landing-v2 .rv-d2{transition-delay:.16s}.landing-v2 .rv-d3{transition-delay:.24s}.landing-v2 .rv-d4{transition-delay:.32s}

/* ---------- nav ---------- */
.landing-v2 nav{position:fixed;top:0;left:0;right:0;z-index:50;background:rgba(11,18,32,.82);backdrop-filter:blur(14px);border-bottom:1px solid var(--line-dark)}
.landing-v2 .nav-inner{display:flex;align-items:center;justify-content:space-between;height:64px}
.landing-v2 .logo{font-family:var(--font-display);font-weight:800;font-size:1.25rem;color:var(--text-on-dark);text-decoration:none;display:flex;align-items:center;gap:.5rem}
.landing-v2 .logo-dot{width:9px;height:9px;border-radius:50%;background:var(--live);box-shadow:0 0 0 0 rgba(47,107,255,.5);animation:pulse-dot 2.4s infinite;flex-shrink:0}
@keyframes pulse-dot{0%{box-shadow:0 0 0 0 rgba(47,107,255,.5)}70%{box-shadow:0 0 0 9px rgba(47,107,255,0)}100%{box-shadow:0 0 0 0 rgba(47,107,255,0)}}
.landing-v2 .nav-links{display:flex;gap:1.8rem;align-items:center}
.landing-v2 .nav-links a{color:var(--text-on-dark-mute);text-decoration:none;font-size:.92rem;font-weight:500;transition:color .2s}
.landing-v2 .nav-links a:hover{color:var(--text-on-dark)}
.landing-v2 .nav-login{color:var(--text-on-dark-mute);text-decoration:none;font-size:.82rem;font-weight:500;border:1px dashed var(--line-dark);border-radius:999px;padding:.35rem .85rem;transition:color .2s,border-color .2s}
.landing-v2 .nav-login:hover{color:var(--text-on-dark);border-color:var(--live)}
.landing-v2 .btn{display:inline-block;text-decoration:none;font-weight:600;border-radius:999px;padding:.72rem 1.5rem;font-size:.95rem;transition:transform .18s ease,box-shadow .18s ease,background .18s ease;cursor:pointer;border:none;font-family:var(--font-body)}
.landing-v2 .btn:focus-visible{outline:3px solid var(--live);outline-offset:2px}
.landing-v2 .btn-live{background:var(--live);color:#fff}
.landing-v2 .btn-live:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(47,107,255,.35)}
.landing-v2 .btn-ghost{background:transparent;color:var(--text-on-dark);border:1px solid var(--line-dark)}
.landing-v2 .btn-ghost:hover{background:rgba(233,238,247,.08)}
.landing-v2 .btn-dark{background:var(--ink);color:var(--text-on-dark)}
.landing-v2 .btn-dark:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(11,18,32,.3)}
@media(max-width:720px){.landing-v2 .nav-links a:not(.btn){display:none}}

/* ---------- hero ---------- */
.landing-v2 .hero{background:var(--ink);color:var(--text-on-dark);padding:150px 0 0;position:relative;overflow:hidden}
.landing-v2 .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 60% 45% at 70% 15%,rgba(127,166,245,.12),transparent 60%);pointer-events:none}
.landing-v2 .hero-eyebrow{display:inline-flex;align-items:center;gap:.6rem;color:var(--live);border:1px solid rgba(47,107,255,.35);border-radius:999px;padding:.4rem 1rem;margin-bottom:1.6rem;background:var(--live-dim)}
.landing-v2 .hero h1{font-family:var(--font-display);font-weight:800;font-size:clamp(2.4rem,5.4vw,4.1rem);line-height:1.06;letter-spacing:-.02em;max-width:16ch}
.landing-v2 .hero h1 em{font-style:normal;color:var(--live)}
.landing-v2 .hero-sub{margin-top:1.4rem;font-size:clamp(1.05rem,1.6vw,1.25rem);color:var(--text-on-dark-mute);max-width:56ch}
.landing-v2 .hero-ctas{display:flex;gap:1rem;margin-top:2.2rem;flex-wrap:wrap}
.landing-v2 .hero-note{margin-top:1.1rem;color:var(--text-on-dark-mute);font-size:.85rem}

/* ---------- usp bar ---------- */
.landing-v2 .uspbar{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:2.4rem}
.landing-v2 .usp{display:inline-flex;align-items:center;gap:.55rem;font-family:var(--font-mono);font-size:.74rem;letter-spacing:.04em;text-transform:uppercase;color:var(--text-on-dark);border:1px solid var(--line-dark);border-radius:999px;padding:.5rem 1rem;background:rgba(233,238,247,.04)}
.landing-v2 .usp b{color:var(--live);font-weight:500}

/* ---------- graph ---------- */
.landing-v2 .graph-shell{margin:3.5rem auto 0;position:relative;padding-bottom:3.5rem}
.landing-v2 .graph{width:100%;height:auto}
.landing-v2 .gnode{fill:var(--ink-soft);stroke:var(--line-dark);stroke-width:1}
.landing-v2 .gnode-core{fill:#0F1B33;stroke:rgba(47,107,255,.5);stroke-width:1.5}
.landing-v2 .glabel{font-family:var(--font-mono);font-size:11.5px;fill:var(--text-on-dark);letter-spacing:.04em}
.landing-v2 .glabel-sub{font-family:var(--font-body);font-size:10px;fill:var(--text-on-dark-mute)}
.landing-v2 .gpath{stroke:rgba(233,238,247,.14);stroke-width:1.5;fill:none}
.landing-v2 .gpulse{fill:var(--live);filter:drop-shadow(0 0 5px rgba(47,107,255,.9))}
.landing-v2 .gout{font-family:var(--font-body);font-size:12px;fill:var(--text-on-dark)}
.landing-v2 .gcheck{fill:none;stroke:var(--live);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.landing-v2 .gcore-ring{fill:none;stroke:var(--live);stroke-width:1;opacity:.35}
@media(prefers-reduced-motion:reduce){
  .landing-v2 .rv{opacity:1;transform:none;transition:none}
  .landing-v2 .logo-dot{animation:none}
  .landing-v2 .gpulse,.landing-v2 .gcore-ring{display:none}
  .landing-v2 .chat-line{animation:none;opacity:1;transform:none}
}

/* ---------- sections ---------- */
.landing-v2 section{padding:96px 0}
.landing-v2 .eyebrow{color:var(--text-mute);margin-bottom:1rem}
.landing-v2 h2{font-family:var(--font-display);font-weight:700;font-size:clamp(1.8rem,3.6vw,2.7rem);line-height:1.12;letter-spacing:-.015em;max-width:24ch}
.landing-v2 .lede{margin-top:1rem;color:var(--text-mute);font-size:1.1rem;max-width:58ch}

/* ---------- problem ---------- */
.landing-v2 .problem{background:var(--paper)}
.landing-v2 .pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem;margin-top:3rem}
.landing-v2 .pcard{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:1.8rem;transition:transform .25s ease,box-shadow .25s ease}
.landing-v2 .pcard:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(11,18,32,.08)}
.landing-v2 .ptime{font-family:var(--font-mono);font-size:.8rem;color:var(--text-mute);letter-spacing:.05em}
.landing-v2 .pcard h3{font-family:var(--font-display);font-weight:600;font-size:1.15rem;margin:.7rem 0 .5rem}
.landing-v2 .pcard p{color:var(--text-mute);font-size:.95rem}
@media(max-width:820px){.landing-v2 .pgrid{grid-template-columns:1fr}}

/* ---------- compare (orchestrieren) ---------- */
.landing-v2 .compare{background:var(--paper-warm)}
.landing-v2 .cgrid{display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;margin-top:3rem}
.landing-v2 .ccol{border-radius:var(--radius);padding:2.2rem;border:1px solid var(--line)}
.landing-v2 .ccol-old{background:#fff}
.landing-v2 .ccol-new{background:var(--ink);color:var(--text-on-dark);border-color:transparent}
.landing-v2 .ctag{display:inline-block;border-radius:999px;padding:.3rem .9rem;font-weight:600;font-size:.8rem;margin-bottom:1.4rem}
.landing-v2 .ccol-old .ctag{background:rgba(17,24,39,.07);color:var(--text-mute)}
.landing-v2 .ccol-new .ctag{background:var(--live-dim);color:var(--live)}
.landing-v2 .ccol h3{font-family:var(--font-display);font-weight:700;font-size:1.4rem;margin-bottom:1.2rem}
.landing-v2 .ccol ul{list-style:none}
.landing-v2 .ccol li{padding:.55rem 0;display:flex;gap:.75rem;align-items:flex-start;font-size:.98rem}
.landing-v2 .ccol-old li{color:var(--text-mute)}
.landing-v2 .ccol-new li{color:var(--text-on-dark)}
.landing-v2 .ic{flex-shrink:0;width:20px;height:20px;margin-top:2px}
@media(max-width:820px){.landing-v2 .cgrid{grid-template-columns:1fr}}

/* ---------- coverage / workflows ---------- */
.landing-v2 .flows{background:var(--ink);color:var(--text-on-dark)}
.landing-v2 .flows h2{color:var(--text-on-dark)}
.landing-v2 .flows .lede{color:var(--text-on-dark-mute)}
.landing-v2 .area{margin-top:3.2rem}
.landing-v2 .area-head{display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem}
.landing-v2 .area-head .mono{color:var(--live)}
.landing-v2 .area-head hr{flex:1;border:none;border-top:1px solid var(--line-dark)}
.landing-v2 .fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem}
.landing-v2 .fcard{background:var(--ink-soft);border:1px solid var(--line-dark);border-radius:var(--radius);padding:1.7rem;transition:border-color .25s ease,transform .25s ease}
.landing-v2 .fcard:hover{border-color:rgba(47,107,255,.5);transform:translateY(-3px)}
.landing-v2 .fcard h3{font-family:var(--font-display);font-weight:600;font-size:1.12rem;margin-bottom:.45rem}
.landing-v2 .fcard p{color:var(--text-on-dark-mute);font-size:.92rem}
.landing-v2 .fflow{margin-top:1rem;font-family:var(--font-mono);font-size:.7rem;color:var(--teal);letter-spacing:.03em;line-height:1.9}
.landing-v2 .fflow b{color:var(--live);font-weight:500}
@media(max-width:900px){.landing-v2 .fgrid{grid-template-columns:1fr}}

/* ---------- agentur vergleich ---------- */
.landing-v2 .agency{background:var(--paper)}
.landing-v2 .vs-table{margin-top:3rem;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:#fff}
.landing-v2 .vs-row{display:grid;grid-template-columns:1.1fr 1.4fr 1.4fr;border-bottom:1px solid var(--line)}
.landing-v2 .vs-row:last-child{border-bottom:none}
.landing-v2 .vs-row>div{padding:1.2rem 1.5rem;font-size:.95rem}
.landing-v2 .vs-head{background:var(--ink);color:var(--text-on-dark)}
.landing-v2 .vs-head>div{font-family:var(--font-display);font-weight:700;font-size:1.05rem}
.landing-v2 .vs-head .vs-ax{color:var(--live)}
.landing-v2 .vs-crit{font-weight:600;color:var(--text);background:rgba(17,24,39,.03)}
.landing-v2 .vs-old{color:var(--text-mute)}
.landing-v2 .vs-new{font-weight:500;position:relative}
.landing-v2 .vs-new::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--live)}
.landing-v2 .vs-price{font-family:var(--font-display);font-weight:800}
@media(max-width:760px){
  .landing-v2 .vs-row{grid-template-columns:1fr}
  .landing-v2 .vs-crit{background:var(--paper-warm)}
  .landing-v2 .vs-head{display:none}
  .landing-v2 .vs-old::before{content:'AI-Agentur — ';font-weight:600;color:var(--text)}
  .landing-v2 .vs-new::after{content:''}
  .landing-v2 .vs-new{background:var(--live-dim)}
}

/* ---------- how + chat ---------- */
.landing-v2 .how{background:var(--paper-warm)}
.landing-v2 .how-grid{display:grid;grid-template-columns:1fr 1fr;gap:4rem;margin-top:3rem;align-items:center}
.landing-v2 .steps{display:flex;flex-direction:column}
.landing-v2 .step{display:flex;gap:1.4rem;padding:1.6rem 0;border-bottom:1px solid var(--line)}
.landing-v2 .step:last-child{border-bottom:none}
.landing-v2 .step-num{font-family:var(--font-mono);font-size:.8rem;color:var(--live);background:var(--ink);border-radius:8px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:500}
.landing-v2 .step h3{font-family:var(--font-display);font-weight:600;font-size:1.2rem;margin-bottom:.35rem}
.landing-v2 .step p{color:var(--text-mute);font-size:.95rem}
.landing-v2 .chat{background:var(--ink);border-radius:20px;padding:1.6rem;box-shadow:0 30px 70px rgba(11,18,32,.25)}
.landing-v2 .chat-head{display:flex;align-items:center;gap:.7rem;padding-bottom:1.1rem;border-bottom:1px solid var(--line-dark);margin-bottom:1.1rem}
.landing-v2 .chat-head span{font-family:var(--font-mono);font-size:.75rem;color:var(--text-on-dark-mute);letter-spacing:.05em}
.landing-v2 .chat-body{display:flex;flex-direction:column;gap:.75rem;min-height:360px}
.landing-v2 .chat-line{max-width:85%;padding:.75rem 1rem;border-radius:14px;font-size:.9rem;line-height:1.5;opacity:0;transform:translateY(10px);animation:chat-in .5s ease forwards;animation-play-state:paused}
.landing-v2 .chat.play .chat-line{animation-play-state:running}
.landing-v2 .chat-line.ai{background:#182545;color:var(--text-on-dark);border-bottom-left-radius:4px;align-self:flex-start}
.landing-v2 .chat-line.user{background:var(--live);color:#fff;border-bottom-right-radius:4px;align-self:flex-end;font-weight:500}
.landing-v2 .chat-line.sys{background:transparent;border:1px dashed rgba(47,107,255,.4);color:var(--live);font-family:var(--font-mono);font-size:.75rem;align-self:center;max-width:100%;text-align:center}
.landing-v2 .chat-line:nth-child(1){animation-delay:.2s}
.landing-v2 .chat-line:nth-child(2){animation-delay:1.1s}
.landing-v2 .chat-line:nth-child(3){animation-delay:2s}
.landing-v2 .chat-line:nth-child(4){animation-delay:2.9s}
.landing-v2 .chat-line:nth-child(5){animation-delay:3.8s}
.landing-v2 .chat-line:nth-child(6){animation-delay:4.9s}
@keyframes chat-in{to{opacity:1;transform:none}}
@media(max-width:900px){.landing-v2 .how-grid{grid-template-columns:1fr;gap:2.5rem}}

/* ---------- integrations ---------- */
.landing-v2 .integr{background:var(--paper);padding:70px 0;border-bottom:1px solid var(--line)}
.landing-v2 .integr-row{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:2rem}
.landing-v2 .chip{font-family:var(--font-mono);font-size:.8rem;padding:.55rem 1.1rem;border:1px solid var(--line);border-radius:999px;color:var(--text-mute);background:#fff;transition:all .2s}
.landing-v2 .chip:hover{border-color:var(--live);color:var(--text)}
.landing-v2 .chip-more{border-style:dashed;color:var(--live);border-color:rgba(47,107,255,.5)}

/* ---------- pricing ---------- */
.landing-v2 .pricing{background:var(--paper)}
.landing-v2 .prgrid{display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;margin-top:3rem;max-width:840px}
.landing-v2 .prcard{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:2.4rem;position:relative}
.landing-v2 .prcard-pro{border:2px solid var(--ink);box-shadow:0 24px 60px rgba(11,18,32,.12)}
.landing-v2 .prbadge{position:absolute;top:-13px;left:2.4rem;background:var(--live);color:#fff;font-size:.72rem;font-weight:700;padding:.25rem .8rem;border-radius:999px;letter-spacing:.04em;text-transform:uppercase}
.landing-v2 .prcard h3{font-family:var(--font-display);font-weight:700;font-size:1.3rem}
.landing-v2 .prprice{font-family:var(--font-display);font-weight:800;font-size:2.8rem;margin:.8rem 0 .1rem;letter-spacing:-.02em}
.landing-v2 .prprice span{font-size:1rem;font-weight:500;color:var(--text-mute)}
.landing-v2 .prsub{color:var(--text-mute);font-size:.9rem;margin-bottom:1.6rem}
.landing-v2 .prcard ul{list-style:none;margin-bottom:2rem}
.landing-v2 .prcard li{padding:.45rem 0;display:flex;gap:.7rem;font-size:.95rem;align-items:flex-start}
.landing-v2 .prcard .btn{width:100%;text-align:center}
.landing-v2 .pr-note{margin-top:1.6rem;color:var(--text-mute);font-size:.9rem;max-width:56ch}
@media(max-width:760px){.landing-v2 .prgrid{grid-template-columns:1fr}}

/* ---------- final ---------- */
.landing-v2 .final{background:var(--ink);color:var(--text-on-dark);text-align:center;padding:120px 0}
.landing-v2 .final h2{color:var(--text-on-dark);margin:0 auto}
.landing-v2 .final .lede{margin-left:auto;margin-right:auto;color:var(--text-on-dark-mute)}
.landing-v2 .final .hero-ctas{justify-content:center}
.landing-v2 .countchip{display:inline-flex;gap:.6rem;align-items:center;margin-bottom:1.6rem;color:var(--live);border:1px solid rgba(47,107,255,.35);background:var(--live-dim);border-radius:999px;padding:.45rem 1.1rem}

.landing-v2 footer{background:var(--ink);color:var(--text-on-dark-mute);padding:2.2rem 0;border-top:1px solid var(--line-dark);font-size:.85rem}
.landing-v2 .foot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem}
.landing-v2 .foot a{text-decoration:none;color:var(--text-on-dark-mute)}
.landing-v2 .foot a:hover{color:var(--text-on-dark)}
.landing-v2 .foot-links{display:flex;gap:1.5rem}
`;

export default function Home() {
  const isDev = process.env.NODE_ENV === 'development';

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

    let chatIO: IntersectionObserver | undefined;
    let loop: ReturnType<typeof setInterval> | undefined;
    const chat = document.getElementById('chatDemo');
    if (chat && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      chatIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && chatIO) {
              chat.classList.add('play');
              chatIO.unobserve(chat);
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
            }
          });
        },
        { threshold: 0.4 }
      );
      chatIO.observe(chat);
    }

    return () => {
      io.disconnect();
      chatIO?.disconnect();
      if (loop) clearInterval(loop);
    };
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <div
        className={`landing-v2 ${displayFont.variable} ${bodyFont.variable} ${monoFont.variable} ${accentFont.variable}`}
      >
        <nav>
          <div className="wrap nav-inner">
            <a className="logo" href="#top">
              <span className="logo-dot" />
              Axantilo
            </a>
            <div className="nav-links">
              <a href="#flows">Was alles läuft</a>
              <a href="#agency">Vs. AI-Agentur</a>
              <a href="#how">So funktioniert&apos;s</a>
              <a href="#pricing">Testphase</a>
              {isDev && (
                <Link href="/login" className="nav-login">
                  Login
                </Link>
              )}
              <Link href="/warteliste" className="btn btn-live">
                Early Access
              </Link>
            </div>
          </div>
        </nav>

        {/* ============ HERO ============ */}
        <header className="hero" id="top">
          <div className="wrap">
            <div className="hero-eyebrow mono rv">Die AI-Betriebsplattform für Immobilienmakler · Launch 17. August</div>
            <h1 className="rv rv-d1">
              Dein ganzes Maklergeschäft.
              <br />
              <em>Läuft von selbst.</em>
            </h1>
            <p className="hero-sub rv rv-d2">
              Von der Portalanfrage bis zur Provisionsrechnung: Axantilo orchestriert deine bestehenden Tools und erledigt
              die Arbeit dazwischen — Exposés, Follow-ups, Ads, Rundgang-Termine, Abrechnung. Eingerichtet in einem
              Gespräch, nicht in einem IT-Projekt.
            </p>
            <div className="hero-ctas rv rv-d3">
              <Link href="/warteliste" className="btn btn-live">
                Early Access sichern
              </Link>
              <a href="#flows" className="btn btn-ghost">
                Was alles läuft
              </a>
            </div>
            <div className="uspbar rv rv-d4">
              <span className="usp">
                <b>✓</b> Orchestriert statt ersetzt
              </span>
              <span className="usp">
                <b>✓</b> Null Vorkenntnisse nötig
              </span>
              <span className="usp">
                <b>✓</b> DSGVO · EU-Hosting
              </span>
              <span className="usp">
                <b>✓</b> Bruchteil der Agenturkosten
              </span>
            </div>

            {/* orchestration graph */}
            <div className="graph-shell rv rv-d4">
              <svg
                className="graph"
                viewBox="0 0 1080 420"
                role="img"
                aria-label="Diagramm: Portale, justimmo, E-Mail und Kalender fließen durch Axantilo — heraus kommen beantwortete Anfragen, fertige Exposés, geschaltete Anzeigen und gestellte Rechnungen."
              >
                <path id="p1" className="gpath" d="M 190 70  C 330 70, 380 185, 480 195" />
                <path id="p2" className="gpath" d="M 190 165 C 320 165, 370 200, 480 205" />
                <path id="p3" className="gpath" d="M 190 260 C 320 260, 370 225, 480 215" />
                <path id="p4" className="gpath" d="M 190 355 C 330 355, 380 240, 480 225" />
                <path id="p5" className="gpath" d="M 620 190 C 720 175, 750 65,  880 60" />
                <path id="p6" className="gpath" d="M 620 202 C 730 195, 770 160, 880 158" />
                <path id="p7" className="gpath" d="M 620 218 C 730 225, 770 260, 880 256" />
                <path id="p8" className="gpath" d="M 620 230 C 720 245, 750 355, 880 354" />

                <g>
                  <rect className="gnode" x="40" y="44" width="150" height="52" rx="10" />
                  <text className="glabel" x="60" y="66">PORTALE</text>
                  <text className="glabel-sub" x="60" y="84">ImmoScout24 · willhaben</text>

                  <rect className="gnode" x="40" y="139" width="150" height="52" rx="10" />
                  <text className="glabel" x="60" y="161">JUSTIMMO</text>
                  <text className="glabel-sub" x="60" y="179">Objekte &amp; Kontakte</text>

                  <rect className="gnode" x="40" y="234" width="150" height="52" rx="10" />
                  <text className="glabel" x="60" y="256">POSTFACH</text>
                  <text className="glabel-sub" x="60" y="274">Gmail · Outlook</text>

                  <rect className="gnode" x="40" y="329" width="150" height="52" rx="10" />
                  <text className="glabel" x="60" y="351">KALENDER</text>
                  <text className="glabel-sub" x="60" y="369">Termine &amp; Rundgänge</text>
                </g>

                <g>
                  <circle className="gcore-ring" cx="550" cy="210" r="86">
                    <animate attributeName="r" values="70;96" dur="2.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values=".35;0" dur="2.6s" repeatCount="indefinite" />
                  </circle>
                  <rect className="gnode-core" x="480" y="172" width="140" height="76" rx="14" />
                  <circle cx="502" cy="196" r="4" fill="#2F6BFF" />
                  <text className="glabel" x="514" y="200" fontWeight="500">AXANTILO</text>
                  <text className="glabel-sub" x="502" y="222">versteht · erstellt ·</text>
                  <text className="glabel-sub" x="502" y="236">plant · rechnet ab</text>
                </g>

                <g>
                  <rect className="gnode" x="880" y="32" width="170" height="52" rx="10" />
                  <path className="gcheck" d="M 900 58 l 5 5 l 9 -10" />
                  <text className="gout" x="922" y="55">Anfrage beantwortet</text>
                  <text className="glabel-sub" x="922" y="72">in 4 Minuten, mit Exposé</text>

                  <rect className="gnode" x="880" y="130" width="170" height="52" rx="10" />
                  <path className="gcheck" d="M 900 156 l 5 5 l 9 -10" />
                  <text className="gout" x="922" y="153">Exposé erstellt</text>
                  <text className="glabel-sub" x="922" y="170">Text, Layout, Rundgang-Link</text>

                  <rect className="gnode" x="880" y="228" width="170" height="52" rx="10" />
                  <path className="gcheck" d="M 900 254 l 5 5 l 9 -10" />
                  <text className="gout" x="922" y="251">Anzeige geschaltet</text>
                  <text className="glabel-sub" x="922" y="268">Meta &amp; Portale, automatisch</text>

                  <rect className="gnode" x="880" y="326" width="170" height="52" rx="10" />
                  <path className="gcheck" d="M 900 352 l 5 5 l 9 -10" />
                  <text className="gout" x="922" y="349">Rechnung gestellt</text>
                  <text className="glabel-sub" x="922" y="366">nach Abschluss, inkl. Ablage</text>
                </g>

                <circle className="gpulse" r="4">
                  <animateMotion dur="3.2s" repeatCount="indefinite" begin="0s">
                    <mpath href="#p1" />
                  </animateMotion>
                </circle>
                <circle className="gpulse" r="4">
                  <animateMotion dur="3.2s" repeatCount="indefinite" begin="1.4s">
                    <mpath href="#p2" />
                  </animateMotion>
                </circle>
                <circle className="gpulse" r="4">
                  <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.7s">
                    <mpath href="#p3" />
                  </animateMotion>
                </circle>
                <circle className="gpulse" r="4">
                  <animateMotion dur="3.2s" repeatCount="indefinite" begin="2.1s">
                    <mpath href="#p4" />
                  </animateMotion>
                </circle>
                <circle className="gpulse" r="4">
                  <animateMotion dur="2.6s" repeatCount="indefinite" begin="1.6s">
                    <mpath href="#p5" />
                  </animateMotion>
                </circle>
                <circle className="gpulse" r="4">
                  <animateMotion dur="2.6s" repeatCount="indefinite" begin="2.4s">
                    <mpath href="#p6" />
                  </animateMotion>
                </circle>
                <circle className="gpulse" r="4">
                  <animateMotion dur="2.6s" repeatCount="indefinite" begin="0.9s">
                    <mpath href="#p7" />
                  </animateMotion>
                </circle>
                <circle className="gpulse" r="4">
                  <animateMotion dur="2.6s" repeatCount="indefinite" begin="3.0s">
                    <mpath href="#p8" />
                  </animateMotion>
                </circle>
              </svg>
            </div>
          </div>
        </header>

        {/* ============ PROBLEM ============ */}
        <section className="problem">
          <div className="wrap">
            <p className="eyebrow mono rv">Der Makleralltag heute</p>
            <h2 className="rv rv-d1">
              Du bist Verkäufer, Texter, Fotograf, Werbeagentur und Buchhaltung. Jeden Tag. Gleichzeitig.
            </h2>
            <div className="pgrid">
              <div className="pcard rv">
                <span className="ptime">22:41 Uhr</span>
                <h3>Die Anfrage von gestern Abend</h3>
                <p>
                  Portalanfrage um 22:41. Deine Antwort kommt morgen Vormittag — der Interessent hat bis dahin drei andere
                  Makler kontaktiert.
                </p>
              </div>
              <div className="pcard rv rv-d1">
                <span className="ptime">3 Std / Objekt</span>
                <h3>Das Exposé, das dich blockiert</h3>
                <p>
                  Fotos sortieren, Texte formulieren, Layout bauen, Rundgang-Link einfügen, auf drei Portale hochladen.
                  Drei Stunden, in denen du nicht verkaufst.
                </p>
              </div>
              <div className="pcard rv rv-d2">
                <span className="ptime">Nach dem Notar</span>
                <h3>Der Papierkram nach dem Abschluss</h3>
                <p>
                  Der schönste Moment im Maklerleben — gefolgt von Provisionsrechnung, Ablage, Eigentümer-Info und dem
                  Update in vier Systemen. Von Hand.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ WORKFLOWS / COVERAGE ============ */}
        <section className="flows" id="flows">
          <div className="wrap">
            <p className="eyebrow mono rv" style={{ color: 'var(--live)' }}>
              Der ganzheitliche Ansatz
            </p>
            <h2 className="rv rv-d1">Nicht ein Workflow. Dein ganzer Betrieb.</h2>
            <p className="lede rv rv-d2">
              Vertrieb, Marketing, Backoffice — Axantilo deckt das komplette Maklergeschäft ab. Alles fertig gebaut, du
              konfigurierst nur noch deine Variablen.
            </p>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Vertrieb</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Anfragen-Autopilot</h3>
                  <p>Jede Portalanfrage sofort qualifiziert und beantwortet — mit Exposé und Terminvorschlag. Auch um 22:41 Uhr.</p>
                  <div className="fflow">
                    Anfrage → qualifizieren → Exposé + Termin → <b>beantwortet in Minuten</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Besichtigungs-Follow-up</h3>
                  <p>Nach jedem Termin die richtige Nachricht zur richtigen Zeit. Tag 1, Tag 3, Tag 7 — persönlich formuliert.</p>
                  <div className="fflow">
                    Termin vorbei → Nachfassen T1/T3/T7 → <b>kein Interessent vergessen</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Interessenten-Matching</h3>
                  <p>Neues Objekt? Alle passenden Interessenten aus deiner Datenbank werden informiert, bevor es auf dem Portal steht.</p>
                  <div className="fflow">
                    Neues Objekt → Datenbank-Match → <b>Verkauf vor dem Inserat</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Marketing</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Exposé-Generator</h3>
                  <p>Aus den justimmo-Objektdaten entsteht das fertige Exposé: Beschreibung, Lagetext, Layout — in Minuten statt Stunden.</p>
                  <div className="fflow">
                    Objektdaten → AI-Text + Layout → <b>Exposé fertig in Minuten</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Ads &amp; Social Media</h3>
                  <p>Jedes neue Objekt wird automatisch zur fertigen Anzeige — Meta-Kampagne und Social-Posts inklusive, ohne Agentur.</p>
                  <div className="fflow">
                    Objekt live → Anzeige + Posts → <b>Reichweite ohne Agentur</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Digitale Rundgänge</h3>
                  <p>Rundgang-Link im Exposé, Selbstbuchung für Besichtigungen, automatische Bestätigungen — der Interessent bedient sich selbst.</p>
                  <div className="fflow">
                    Rundgang-Link → Selbstbuchung → <b>Termine ohne Telefonate</b>
                  </div>
                </div>
              </div>
            </div>

            <div className="area rv">
              <div className="area-head">
                <span className="mono">Backoffice</span>
                <hr />
              </div>
              <div className="fgrid">
                <div className="fcard rv">
                  <h3>Rechnung &amp; Provision</h3>
                  <p>Abschluss erfasst? Provisionsrechnung, Zahlungserinnerung und Ablage laufen automatisch — DSGVO-konform dokumentiert.</p>
                  <div className="fflow">
                    Abschluss → Rechnung + Mahnwesen → <b>Papierkram erledigt</b>
                  </div>
                </div>
                <div className="fcard rv rv-d1">
                  <h3>Eigentümer-Reporting</h3>
                  <p>Jeder Eigentümer bekommt automatisch seinen Statusbericht: Anfragen, Besichtigungen, Feedback. Ohne dass du ihn schreibst.</p>
                  <div className="fflow">
                    Aktivitäten → Wochenbericht → <b>Eigentümer immer informiert</b>
                  </div>
                </div>
                <div className="fcard rv rv-d2">
                  <h3>Eigentümer-Onboarding</h3>
                  <p>Neuer Vermittlungsauftrag? Willkommensmail, Unterlagen-Checkliste und Ersttermin gehen raus, bevor du den Stift weglegst.</p>
                  <div className="fflow">
                    Neuer Auftrag → Checkliste + Termin → <b>starker erster Eindruck</b>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ ORCHESTRIEREN ============ */}
        <section className="compare">
          <div className="wrap">
            <p className="eyebrow mono rv">Prinzip Nr. 1</p>
            <h2 className="rv rv-d1">
              Wir sind kein neues System.
              <br />
              Wir sind der Grund, warum deine Systeme endlich zusammenarbeiten.
            </h2>
            <p className="lede rv rv-d2">
              Jede Software will, dass du zu ihr wechselst. Axantilo will das Gegenteil: Deine Tools bleiben — wir sind die
              Schicht, die bisher gefehlt hat.
            </p>
            <div className="cgrid">
              <div className="ccol ccol-old rv">
                <span className="ctag">Neues Tool einführen</span>
                <h3>Ersetzen</h3>
                <ul>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M5 5l10 10M15 5L5 15" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Datenmigration aus dem alten System
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M5 5l10 10M15 5L5 15" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Team-Schulung und Eingewöhnung
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M5 5l10 10M15 5L5 15" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Vertragsbindung und Setup-Gebühren
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M5 5l10 10M15 5L5 15" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Wochen bis zum ersten Nutzen
                  </li>
                </ul>
              </div>
              <div className="ccol ccol-new rv rv-d1">
                <span className="ctag">Axantilo</span>
                <h3>Orchestrieren</h3>
                <ul>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    justimmo, Postfach &amp; Kalender bleiben
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Fehlt ein Tool? Wir richten es für dich ein
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Null Vorkenntnisse — der Chat erledigt das Setup
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Ab Tag 1 produktiv, monatlich kündbar
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ============ AGENTUR VERGLEICH ============ */}
        <section className="agency" id="agency">
          <div className="wrap">
            <p className="eyebrow mono rv">Prinzip Nr. 2</p>
            <h2 className="rv rv-d1">
              Alles, was dir eine AI-Agentur baut.
              <br />
              Ohne Agentur.
            </h2>
            <p className="lede rv rv-d2">
              AI-Agenturen bauen dir genau das, was Axantilo kann — für das Fünfzigfache, in Wochen statt Minuten, und
              jedes Mal wenn sich etwas ändert, zahlst du wieder.
            </p>

            <div className="vs-table rv rv-d2">
              <div className="vs-row vs-head">
                <div />
                <div>AI-Agentur</div>
                <div className="vs-ax">Axantilo</div>
              </div>
              <div className="vs-row">
                <div className="vs-crit">Kosten</div>
                <div className="vs-old">
                  <span className="vs-price">€5.000–15.000</span> Setup, plus laufender Retainer
                </div>
                <div className="vs-new">
                  <span className="vs-price">ab €49/Monat</span> — keine Setup-Gebühr, monatlich kündbar
                </div>
              </div>
              <div className="vs-row">
                <div className="vs-crit">Zeit bis es läuft</div>
                <div className="vs-old">Wochen bis Monate: Workshops, Konzepte, Abstimmungsschleifen</div>
                <div className="vs-new">Ein Gespräch. Der Workflow läuft, bevor der Kaffee kalt ist.</div>
              </div>
              <div className="vs-row">
                <div className="vs-crit">Änderungen</div>
                <div className="vs-old">Ticket schreiben, Angebot abwarten, Change bezahlen</div>
                <div className="vs-new">Im Chat sagen. Sofort angepasst, ohne Aufpreis.</div>
              </div>
              <div className="vs-row">
                <div className="vs-crit">Vorkenntnisse</div>
                <div className="vs-old">Du musst briefen können und verstehen, was technisch möglich ist</div>
                <div className="vs-new">Null. Axantilo kennt die Makler-Prozesse und fragt nur nach deinen Variablen.</div>
              </div>
              <div className="vs-row">
                <div className="vs-crit">Abhängigkeit</div>
                <div className="vs-old">Das Wissen über deine Prozesse liegt bei der Agentur</div>
                <div className="vs-new">Du siehst jeden Workflow und jede Aktion im Protokoll. Volle Transparenz.</div>
              </div>
              <div className="vs-row">
                <div className="vs-crit">Datenschutz</div>
                <div className="vs-old">Abhängig davon, welche Tools die Agentur zusammensteckt</div>
                <div className="vs-new">DSGVO by design: EU-Hosting, EU-AI-Modelle, Auftragsverarbeitung inklusive</div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="how" id="how">
          <div className="wrap">
            <p className="eyebrow mono rv">So funktioniert&apos;s</p>
            <h2 className="rv rv-d1">
              Kein Demo. Kein PDF.
              <br />
              Ein laufender Workflow.
            </h2>
            <div className="how-grid">
              <div className="steps">
                <div className="step rv">
                  <div className="step-num">01</div>
                  <div>
                    <h3>Erzähl es im Chat</h3>
                    <p>
                      Du beschreibst, was bei dir liegen bleibt — Anfragen, Exposés, Abrechnung, egal was. Axantilo kennt
                      die Makler-Prozesse bereits und fragt nur nach deinen Variablen.
                    </p>
                  </div>
                </div>
                <div className="step rv rv-d1">
                  <div className="step-num">02</div>
                  <div>
                    <h3>Wir verbinden deine Tools</h3>
                    <p>
                      Axantilo verbindet sich mit justimmo, Postfach, Kalender und Portalen. Fehlt ein Baustein — etwa ein
                      Buchungstool — richten wir ihn automatisch mit ein.
                    </p>
                  </div>
                </div>
                <div className="step rv rv-d2">
                  <div className="step-num">03</div>
                  <div>
                    <h3>Es läuft</h3>
                    <p>
                      Der Workflow ist live — noch im selben Gespräch. Du siehst jede Aktion im Protokoll, kannst alles
                      pausieren und jederzeit im Chat anpassen.
                    </p>
                  </div>
                </div>
              </div>

              <div className="chat rv rv-d2" id="chatDemo">
                <div className="chat-head">
                  <span className="logo-dot" />
                  <span>AXANTILO ONBOARDING · LIVE</span>
                </div>
                <div className="chat-body">
                  <div className="chat-line ai">
                    Hallo! Ich kenne das Maklergeschäft — von der Anfrage bis zur Abrechnung. Was frisst bei dir am meisten
                    Zeit?
                  </div>
                  <div className="chat-line user">
                    Exposés dauern ewig, und Portalanfragen beantworte ich oft erst am nächsten Tag.
                  </div>
                  <div className="chat-line ai">
                    Übernehme ich beides: Exposés erstelle ich direkt aus deinen justimmo-Daten, Anfragen beantworte ich
                    sofort mit Exposé und Terminvorschlag. Welchen Kalender nutzt du?
                  </div>
                  <div className="chat-line user">Google Kalender.</div>
                  <div className="chat-line ai">
                    Perfekt. Ich verbinde justimmo, willhaben und deinen Kalender — ein Buchungstool für Besichtigungen
                    richte ich dir gleich mit ein.
                  </div>
                  <div className="chat-line sys">✓ 2 Workflows deployed — laufen</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ INTEGRATIONS ============ */}
        <section className="integr">
          <div className="wrap">
            <p className="eyebrow mono rv">Arbeitet mit deinem Stack</p>
            <h2 className="rv rv-d1" style={{ fontSize: 'clamp(1.4rem,2.4vw,1.9rem)' }}>
              Verbunden, nicht ersetzt.
            </h2>
            <div className="integr-row rv rv-d2">
              <span className="chip">justimmo</span>
              <span className="chip">onOffice</span>
              <span className="chip">ImmoScout24</span>
              <span className="chip">willhaben</span>
              <span className="chip">Gmail</span>
              <span className="chip">Outlook</span>
              <span className="chip">Google Kalender</span>
              <span className="chip">WhatsApp Business</span>
              <span className="chip">Meta Ads</span>
              <span className="chip">Buchhaltung</span>
              <span className="chip chip-more">+ Fehlt eins? Wir richten es ein.</span>
            </div>
          </div>
        </section>

        {/* ============ TESTPHASE (aktiv) ============ */}
        <section className="pricing" id="pricing">
          <div className="wrap">
            <p className="eyebrow mono rv">Testphase</p>
            <h2 className="rv rv-d1">
              Wir sind in der Testphase.
              <br />
              Und du kannst dabei sein.
            </h2>
            <p className="lede rv rv-d2">
              Axantilo läuft aktuell mit ausgewählten Maklern im Test. Jeder Testzugang enthält ein Credit-Kontingent —
              genug, um deine ersten Workflows live zu erleben.
            </p>
            <div className="prgrid">
              <div className="prcard prcard-pro rv">
                <span className="prbadge">Warteliste offen</span>
                <h3>Testzugang</h3>
                <div className="prprice">
                  €0<span> · Warteliste</span>
                </div>
                <p className="prsub">
                  Trag dich ein — Testplätze werden laufend freigeschaltet, mit der Chance auf kostenloses Testen.
                </p>
                <ul>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Inkludiertes Credit-Kontingent zum Testen
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Zugriff auf die Makler-Workflows
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Chat-Onboarding &amp; Aktionsprotokoll
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    DSGVO-konform, EU-Hosting
                  </li>
                </ul>
                <Link href="/warteliste" className="btn btn-live">
                  Auf die Warteliste
                </Link>
              </div>
              <div className="prcard rv rv-d1">
                <h3>Credit-Paket</h3>
                <div className="prprice">
                  €49<span> · mehr Credits</span>
                </div>
                <p className="prsub">Für alle, die intensiver testen wollen, sobald das Kontingent aufgebraucht ist.</p>
                <ul>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Erweitertes Credit-Kontingent
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Mehrere Workflows parallel betreiben
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Direkter Draht für Feedback &amp; Wünsche
                  </li>
                  <li>
                    <svg className="ic" viewBox="0 0 20 20" fill="none">
                      <path d="M4 10.5l4 4 8-9" stroke="#2F6BFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Keine Bindung — Credits statt Abo
                  </li>
                </ul>
                <Link href="/warteliste" className="btn btn-dark">
                  Credits anfragen
                </Link>
              </div>
            </div>
            <p className="pr-note rv rv-d2">
              Die finalen Abo-Preise kommen zum Launch am 17. August. Wer in der Testphase dabei ist, bekommt sie zuerst —
              und zu Konditionen, die es danach nicht mehr gibt.
            </p>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="final" id="cta">
          <div className="wrap">
            <div className="countchip mono rv">
              <span className="logo-dot" />
              Launch 17. August · Early-Access-Plätze limitiert
            </div>
            <h2 className="rv rv-d1">
              Die nächste Anfrage kommt heute Abend.
              <br />
              Das nächste Exposé wartet morgen früh.
            </h2>
            <p className="lede rv rv-d2">
              Sichere dir Early Access: Wir richten deinen Betrieb gemeinsam ein — und du startest vor allen anderen.
            </p>
            <div className="hero-ctas rv rv-d3">
              <Link href="/warteliste" className="btn btn-live">
                Auf die Warteliste
              </Link>
            </div>
            <p className="hero-note rv rv-d4">
              hello@axantilo.com · Antwort innerhalb von 24 Stunden. Versprochen — und automatisiert.
            </p>
          </div>
        </section>

        <footer>
          <div className="wrap foot">
            <span>©️ 2026 Axantilo · Graz, Österreich</span>
            <div className="foot-links">
              <a href="#">Impressum</a>
              <a href="#">Datenschutz</a>
              <a href="mailto:hello@axantilo.com">Kontakt</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
