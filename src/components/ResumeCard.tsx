import { formatClock } from '../lib/format';
import { buildSegments } from '../lib/presets';
import type { StoredSession } from '../lib/session-store';

type Props = {
  session: StoredSession;
  onResume: () => void;
  onDiscard: () => void;
};

/** Where in the plan was the saved session sitting? (round + phase) */
function positionOf(session: StoredSession): { round: number; kind: 'work' | 'rest' } {
  const segments = buildSegments({
    id: session.presetId,
    name: session.presetName,
    workSec: session.workSec,
    restSec: session.restSec,
    rounds: session.rounds,
  });
  let acc = 0;
  for (const segment of segments) {
    if (session.elapsedMs < acc + segment.durationMs) {
      return { round: segment.round, kind: segment.kind };
    }
    acc += segment.durationMs;
  }
  const last = segments[segments.length - 1];
  return { round: last?.round ?? session.rounds, kind: last?.kind ?? 'work' };
}

/**
 * #1 Resume-after-kill: offered on cold launch when a session was interrupted
 * (force-quit, OS tab eviction, crash). Deliberately non-blocking — it sits
 * above the app instead of over it, so nothing else stops working if it's
 * ignored.
 */
export function ResumeCard({ session, onResume, onDiscard }: Props) {
  const { round, kind } = positionOf(session);

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-4">
      <section
        aria-label="Resume session"
        className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 shadow-lg shadow-black/40"
      >
        <p className="text-sm font-semibold text-amber-200">Resume session?</p>
        <p className="mt-1 text-sm text-amber-100/90">
          <span className="font-bold tabular-nums">{formatClock(session.elapsedMs)}</span> into{' '}
          {session.presetName} · round {round} of {session.rounds} · currently{' '}
          {kind === 'work' ? 'work' : 'rest'}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onResume}
            className="flex-1 rounded-full bg-lime-400 py-2.5 text-sm font-bold text-slate-950 transition active:scale-95"
          >
            Resume
          </button>
          <button
            onClick={onDiscard}
            className="flex-1 rounded-full border border-slate-700 bg-slate-900 py-2.5 text-sm font-semibold text-slate-300 transition active:scale-95"
          >
            Discard
          </button>
        </div>
      </section>
    </div>
  );
}
