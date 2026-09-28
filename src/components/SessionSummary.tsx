import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { formatClock } from '../lib/format';
import { splitSession } from '../lib/presets';
import { buildShareUrl } from '../lib/presets-io';
import { useAppState } from '../state';

/**
 * #5 — the end-of-session payoff: what you actually did, plus one-tap share.
 * Work/rest split is computed from the real segments consumed, so partial
 * sessions report honest numbers too.
 */
export function SessionSummary() {
  const { activePreset, timer } = useAppState();
  const [shareStatus, setShareStatus] = useState('');

  const { workMs, restMs, roundsCompleted } = splitSession(timer.segments, timer.elapsed);
  const completed = timer.elapsed >= timer.totalMs;

  const share = async () => {
    const url = buildShareUrl(activePreset);
    const text = `I just did ${activePreset.name} with Beep — ${formatClock(timer.elapsed)}, ${roundsCompleted} rounds.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Beep workout', text, url });
        setShareStatus('Shared!');
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareStatus('Copied to clipboard');
      }
    } catch {
      setShareStatus('Sharing cancelled');
    }
    window.setTimeout(() => setShareStatus(''), 2500);
  };

  const stats = [
    { label: 'Total', value: formatClock(timer.elapsed) },
    { label: 'Rounds', value: `${roundsCompleted}/${activePreset.rounds}` },
    { label: 'Work', value: formatClock(workMs) },
    { label: 'Rest', value: formatClock(restMs) },
  ];

  return (
    <section
      aria-label="Session summary"
      className="mt-7 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <Check size={16} className="shrink-0" />
          {completed ? 'Session complete' : 'Stopped early'} — saved to history
        </p>
        <button
          onClick={share}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 active:scale-95"
        >
          <Share2 size={13} /> Share
        </button>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {activePreset.name} · {activePreset.workSec}s work · {activePreset.restSec}s rest
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-slate-950/50 px-1 py-2.5 text-center">
            <p className="text-sm font-bold tabular-nums">{stat.value}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {shareStatus && (
        <p className="mt-2 text-xs text-lime-300" role="status">
          {shareStatus}
        </p>
      )}
    </section>
  );
}
