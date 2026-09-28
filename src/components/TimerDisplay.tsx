import { formatClock } from '../lib/format';
import { useAppState } from '../state';
import type { Segment, TimerStatus } from '../types';

type Props = {
  status: TimerStatus;
  segment: Segment;
  nextSegment: Segment | null;
  remainingMs: number;
  segmentProgress: number;
  totalProgress: number;
  totalRemainingMs: number;
  round: number;
  rounds: number;
};

const RADIUS = 140;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Warm = work (high effort), cool = rest — readable without reading. */
const PHASES: Record<string, { label: string; color: string }> = {
  ready: { label: 'READY', color: '#94a3b8' },
  work: { label: 'WORK', color: '#fb923c' },
  rest: { label: 'REST', color: '#38bdf8' },
  paused: { label: 'PAUSED', color: '#e2e8f0' },
  done: { label: 'DONE', color: '#34d399' },
};

export function TimerDisplay({
  status,
  segment,
  nextSegment,
  remainingMs,
  segmentProgress,
  totalProgress,
  totalRemainingMs,
  round,
  rounds,
}: Props) {
  const { settings } = useAppState();
  const phase =
    status === 'finished'
      ? 'done'
      : status === 'paused'
        ? 'paused'
        : status === 'idle'
          ? 'ready'
          : segment.kind === 'rest'
            ? 'rest'
            : 'work';
  const { label, color } = PHASES[phase];
  const ringProgress = status === 'idle' ? 0 : segmentProgress;
  const showFinal =
    round === rounds && rounds > 1 && (status === 'running' || status === 'paused');

  return (
    <div className="mt-6 flex flex-col items-center">
      <div className="relative h-72 w-72">
        <svg viewBox="0 0 320 320" className="h-full w-full -rotate-90">
          <circle cx="160" cy="160" r={RADIUS} fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle
            cx="160"
            cy="160"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - ringProgress)}
            style={{
              // Gentle spring overshoot instead of flat linear — "designed".
              transition: 'stroke-dashoffset 240ms cubic-bezier(0.34, 1.45, 0.64, 1), stroke 400ms ease',
            }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold tracking-[0.25em]"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            {label}
          </span>
          <span
            className={`font-semibold leading-none tracking-tight tabular-nums ${
              settings.bigNumbers ? 'text-[96px]' : 'text-[64px]'
            }`}
          >
            {formatClock(remainingMs)}
          </span>
          <span className="text-sm text-slate-400">
            Round {round} of {rounds}
          </span>
          {showFinal && (
            <span
              className="rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-[0.2em]"
              style={{ backgroundColor: `${color}26`, color }}
            >
              FINAL ROUND
            </span>
          )}
        </div>
      </div>

      {/* What's coming — the thing users actually need to prepare for (#2) */}
      <div className="mt-4 flex h-6 items-center gap-2 text-sm">
        <span className="text-[11px] font-bold tracking-[0.18em] text-slate-500">NEXT</span>
        {nextSegment ? (
          <>
            <span
              className="font-medium"
              style={{ color: PHASES[nextSegment.kind].color }}
            >
              {nextSegment.kind === 'work' ? 'Work' : 'Rest'}{' '}
              {formatClock(nextSegment.durationMs)}
            </span>
            <span className="text-slate-600">· round {nextSegment.round}</span>
          </>
        ) : (
          <span className="text-[11px] font-bold tracking-[0.18em] text-slate-500">
            SESSION END
          </span>
        )}
      </div>

      <div className="mt-3 w-full">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
          <span>{formatClock(totalRemainingMs)} left in session</span>
          <span className="tabular-nums">{Math.round(totalProgress * 100)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${totalProgress * 100}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}
