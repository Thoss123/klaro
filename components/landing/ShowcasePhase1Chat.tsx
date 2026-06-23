'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Loader2, ArrowUp } from 'lucide-react';

const COACH_QUESTION =
  'Welche Aufgabe frisst bei euch jede Woche am meisten Zeit?';
const USER_MESSAGE = 'Angebote — jedes Mal von Null, 3–4 Stunden pro Woche.';
const COACH_REPLY =
  'Verstanden — klarer Hebel. Ich erfasse das als Ansatzpunkt und frage als Nächstes, wie der Ablauf bei euch genau läuft.';

type Phase =
  | 'coach-question'
  | 'typing-input'
  | 'user-bubble'
  | 'coach-thinking'
  | 'coach-stream'
  | 'plan-update';

function StreamingText({ text, speed = 26 }: { text: string; speed?: number }) {
  const [out, setOut] = useState('');

  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);

  return (
    <>
      {out}
      {out.length < text.length && (
        <span className="inline-block w-0.5 h-4 bg-indigo-500 ml-0.5 animate-pulse align-middle" />
      )}
    </>
  );
}

export default function ShowcasePhase1Chat() {
  const [phase, setPhase] = useState<Phase>('coach-question');
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let typeInterval: ReturnType<typeof setInterval> | undefined;

    timers.push(
      setTimeout(() => {
        setPhase('typing-input');
        let charIdx = 0;
        typeInterval = setInterval(() => {
          charIdx += 1;
          setInputText(USER_MESSAGE.slice(0, charIdx));
          if (charIdx >= USER_MESSAGE.length) {
            clearInterval(typeInterval);
            timers.push(setTimeout(() => setPhase('user-bubble'), 220));
            timers.push(setTimeout(() => setPhase('coach-thinking'), 900));
            timers.push(setTimeout(() => setPhase('coach-stream'), 1700));
            timers.push(
              setTimeout(
                () => setPhase('plan-update'),
                1700 + COACH_REPLY.length * 22 + 350,
              ),
            );
          }
        }, 36);
      }, COACH_QUESTION.length * 26 + 350),
    );

    return () => {
      timers.forEach(clearTimeout);
      if (typeInterval) clearInterval(typeInterval);
    };
  }, []);

  const showUserBubble =
    phase === 'user-bubble' ||
    phase === 'coach-thinking' ||
    phase === 'coach-stream' ||
    phase === 'plan-update';
  const showThinking = phase === 'coach-thinking';
  const showCoachReply = phase === 'coach-stream' || phase === 'plan-update';
  const showPlan = phase === 'plan-update';
  const showDemoInput = phase === 'typing-input' || phase === 'coach-question';

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <Bot size={18} className="text-blue-600" />
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-gray-800 text-sm leading-relaxed min-h-[3rem]">
          {phase === 'coach-question' ? (
            <StreamingText text={COACH_QUESTION} speed={26} />
          ) : (
            COACH_QUESTION
          )}
        </div>
      </div>

      <AnimatePresence>
        {showUserBubble && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="flex justify-end"
          >
            <p className="text-sm text-gray-800 rounded-2xl rounded-tr-sm bg-indigo-50 border border-indigo-100 px-4 py-3 max-w-[92%]">
              {USER_MESSAGE}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {showThinking && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Bot size={18} className="text-blue-600" />
          </div>
          <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-100">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
          </div>
        </motion.div>
      )}

      {showCoachReply && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3"
        >
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <Bot size={18} className="text-blue-600" />
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-gray-800 text-sm leading-relaxed min-h-[2.5rem]">
            {phase === 'coach-stream' ? (
              <StreamingText text={COACH_REPLY} speed={22} />
            ) : (
              COACH_REPLY
            )}
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showPlan && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3"
          >
            <p className="flex items-center gap-2 text-xs text-indigo-700 font-semibold mb-2">
              <Loader2 size={12} className="animate-spin" />
              Plan wird aktualisiert…
            </p>
            <div className="rounded-lg border border-indigo-100 bg-white px-3 py-2">
              <p className="text-xs font-semibold text-gray-900">Angebote manuell</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                3–4h/Woche · wiederkehrend · erster Ansatzpunkt
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showDemoInput && (
        <div
          className={`flex items-end gap-2 px-3 py-2 rounded-3xl border transition-colors pointer-events-none ${
            phase === 'typing-input'
              ? 'border-indigo-300 bg-white shadow-sm'
              : 'border-gray-200 bg-gray-50/80 opacity-60'
          }`}
        >
          <p className="flex-1 px-2 py-2 text-sm text-gray-800 min-h-[36px]">
            {inputText}
            {phase === 'typing-input' && (
              <span className="inline-block w-0.5 h-4 bg-indigo-500 ml-0.5 animate-pulse align-middle" />
            )}
            {!inputText && phase !== 'typing-input' && (
              <span className="text-gray-400">Schreib einfach drauf los…</span>
            )}
          </p>
          <span className="w-9 h-9 flex shrink-0 items-center justify-center bg-indigo-600 text-white rounded-full">
            <ArrowUp size={18} strokeWidth={2.5} />
          </span>
        </div>
      )}
    </div>
  );
}
