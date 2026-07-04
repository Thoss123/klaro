// Gemeinsames Stylesheet für die Landing-v2-Seiten (/ und /immobilienmakler).
// Blau/Schwarz/Grau/Weiß-Palette + geschwungene Akzentschrift (Caveat) statt Versalien.
export const landingCss = `
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
.landing-v2 .mono{font-family:var(--font-body);font-size:.85rem;font-weight:500;letter-spacing:0;text-transform:none}

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
.landing-v2 .hero-eyebrow{font-size:0.95rem}
.landing-v2 .hero-eyebrow{display:block;color:var(--live);margin-bottom:1.2rem;padding:0;border:none;background:transparent;border-radius:0}
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
.landing-v2 .nav-links a.btn-live{color:#fff}
.landing-v2 .nav-links a.btn-live:hover{color:#fff}
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
.landing-v2 .hero h1{font-family:var(--font-display);font-weight:800;font-size:clamp(2.4rem,5.4vw,4.1rem);line-height:1.06;letter-spacing:-.02em;max-width:16ch}
.landing-v2 .hero h1 em{font-style:normal;color:var(--live)}
.landing-v2 .hero-sub{margin-top:1.4rem;font-size:clamp(1.05rem,1.6vw,1.25rem);color:var(--text-on-dark-mute);max-width:56ch}
.landing-v2 .hero-ctas{display:flex;gap:1rem;margin-top:2.2rem;flex-wrap:wrap}
.landing-v2 .hero-note{margin-top:1.1rem;color:var(--text-on-dark-mute);font-size:.85rem}

/* ---------- usp bar ---------- */
.landing-v2 .uspbar{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:2.4rem}
.landing-v2 .usp{display:inline-flex;align-items:center;gap:.55rem;font-family:var(--font-body);font-size:.82rem;font-weight:500;letter-spacing:0;text-transform:none;color:var(--text-on-dark);border:1px solid var(--line-dark);border-radius:999px;padding:.5rem 1rem;background:rgba(233,238,247,.04)}
.landing-v2 .usp b{color:var(--live);font-weight:500}

/* ---------- graph ---------- */
.landing-v2 .graph-shell{margin:3.5rem auto 0;position:relative;padding-bottom:3.5rem}
.landing-v2 .graph{width:100%;height:auto;display:block}
.landing-v2 .graph-shell--desktop{display:block}
.landing-v2 .graph-shell--mobile{display:none}
.landing-v2 .gnode{fill:var(--ink-soft);stroke:var(--line-dark);stroke-width:1}
.landing-v2 .gnode-core{fill:#0F1B33;stroke:rgba(47,107,255,.5);stroke-width:1.5}
.landing-v2 .glabel{font-family:var(--font-body);font-size:11.5px;font-weight:600;fill:var(--text-on-dark);letter-spacing:0}
.landing-v2 .glabel-sub{font-family:var(--font-body);font-size:10px;fill:var(--text-on-dark-mute)}
.landing-v2 .gpath{stroke:rgba(233,238,247,.14);stroke-width:1.5;fill:none}
.landing-v2 .gpulse{fill:var(--live);filter:drop-shadow(0 0 5px rgba(47,107,255,.9))}
.landing-v2 .gout{font-family:var(--font-body);font-size:12px;fill:var(--text-on-dark)}
.landing-v2 .gcheck{fill:none;stroke:var(--live);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.landing-v2 .gcore-ring{fill:none;stroke:var(--live);stroke-width:1;opacity:.35}
@media(max-width:720px){
  .landing-v2 .graph-shell--desktop{display:none}
  .landing-v2 .graph-shell--mobile{display:block;margin-top:2rem;padding-bottom:2rem}
  .landing-v2 .graph-mobile .glabel{font-size:13px}
  .landing-v2 .graph-mobile .glabel-sub{font-size:11px}
  .landing-v2 .graph-mobile .gout{font-size:13px}
  .landing-v2 .graph-mobile .gchip-label{font-family:var(--font-body);font-size:12.5px;font-weight:600;fill:var(--text-on-dark)}
  .landing-v2 .graph-mobile .gpath{stroke-width:1.5}
}
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
.landing-v2 .ptime{font-family:var(--font-body);font-size:.9rem;color:var(--text-mute);font-weight:500}
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
.landing-v2 .fflow{margin-top:1rem;font-family:var(--font-body);font-size:.78rem;color:var(--teal);letter-spacing:0;line-height:1.9}
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
.landing-v2 .vs-cell-label{display:none}
@media(max-width:760px){
  /* Mobil: jede Zeile wird eine eigene Karte mit klar beschrifteten Zellen. */
  .landing-v2 .vs-table{border:none;background:transparent;overflow:visible}
  .landing-v2 .vs-head{display:none}
  .landing-v2 .vs-row{grid-template-columns:1fr;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:#fff;margin-bottom:.9rem;box-shadow:0 6px 18px rgba(11,18,32,.05)}
  .landing-v2 .vs-row:last-child{margin-bottom:0;border-bottom:1px solid var(--line)}
  .landing-v2 .vs-row>div{padding:1rem 1.2rem}
  .landing-v2 .vs-crit{background:var(--ink);color:var(--text-on-dark);font-family:var(--font-display);font-weight:700;font-size:1.02rem;padding:.8rem 1.2rem}
  .landing-v2 .vs-cell-label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-mute);margin-bottom:.3rem}
  .landing-v2 .vs-old{border-bottom:1px dashed var(--line)}
  .landing-v2 .vs-new{background:rgba(47,107,255,.06)}
  .landing-v2 .vs-new .vs-cell-label{color:var(--live)}
}

/* ---------- how + chat ---------- */
.landing-v2 .how{background:var(--paper-warm)}
.landing-v2 .how-grid{display:grid;grid-template-columns:1fr 1fr;gap:4rem;margin-top:3rem;align-items:center}
.landing-v2 .steps{display:flex;flex-direction:column}
.landing-v2 .step{display:flex;gap:1.4rem;padding:1.6rem 0;border-bottom:1px solid var(--line)}
.landing-v2 .step:last-child{border-bottom:none}
.landing-v2 .step-num{font-family:var(--font-body);font-size:.82rem;color:var(--live);background:var(--ink);border-radius:8px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:600}
.landing-v2 .step h3{font-family:var(--font-display);font-weight:600;font-size:1.2rem;margin-bottom:.35rem}
.landing-v2 .step p{color:var(--text-mute);font-size:.95rem}
.landing-v2 .chat{background:var(--ink);border-radius:20px;padding:1.6rem;box-shadow:0 30px 70px rgba(11,18,32,.25)}
.landing-v2 .chat-head{display:flex;align-items:center;gap:.7rem;padding-bottom:1.1rem;border-bottom:1px solid var(--line-dark);margin-bottom:1.1rem}
.landing-v2 .chat-head span{font-family:var(--font-body);font-size:.78rem;font-weight:500;color:var(--text-on-dark-mute);letter-spacing:0}
.landing-v2 .chat-body{display:flex;flex-direction:column;gap:.75rem;min-height:360px}
.landing-v2 .chat-line{max-width:85%;padding:.75rem 1rem;border-radius:14px;font-size:.9rem;line-height:1.5;opacity:0;transform:translateY(10px);animation:chat-in .5s ease forwards;animation-play-state:paused}
.landing-v2 .chat.play .chat-line{animation-play-state:running}
.landing-v2 .chat-line.ai{background:#182545;color:var(--text-on-dark);border-bottom-left-radius:4px;align-self:flex-start}
.landing-v2 .chat-line.user{background:var(--live);color:#fff;border-bottom-right-radius:4px;align-self:flex-end;font-weight:500}
.landing-v2 .chat-line.sys{background:transparent;border:1px dashed rgba(47,107,255,.4);color:var(--live);font-family:var(--font-body);font-size:.78rem;font-weight:500;align-self:center;max-width:100%;text-align:center}
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
.landing-v2 .chip{display:inline-flex;align-items:center;gap:.55rem;font-family:var(--font-body);font-size:.85rem;font-weight:500;padding:.55rem 1.1rem;border:1px solid var(--line);border-radius:999px;color:var(--text-mute);background:#fff;transition:all .2s}
.landing-v2 .chip:hover{border-color:var(--live);color:var(--text)}
.landing-v2 .chip img,.landing-v2 .chip svg{width:18px;height:18px;flex-shrink:0;border-radius:4px}
.landing-v2 .chip-more{border-style:dashed;color:var(--live);border-color:rgba(47,107,255,.5)}

/* ---------- pricing ---------- */
.landing-v2 .pricing{background:var(--paper)}
.landing-v2 .prgrid{display:grid;grid-template-columns:1fr 1fr;gap:1.4rem;margin-top:3rem;max-width:840px}
.landing-v2 .prcard{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:2.4rem;position:relative}
.landing-v2 .prcard-pro{border:2px solid var(--ink);box-shadow:0 24px 60px rgba(11,18,32,.12)}
.landing-v2 .prbadge{position:absolute;top:-13px;left:2.4rem;background:var(--live);color:#fff;font-family:var(--font-body);font-size:.72rem;font-weight:600;padding:.25rem .8rem;border-radius:999px;letter-spacing:0;text-transform:none}
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
.landing-v2 .foot-links{display:flex;flex-wrap:wrap;gap:.6rem 1.5rem;justify-content:center}
`;
