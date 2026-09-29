import { formatClock } from '../lib/format';
import type { Segment, TimerStatus } from '../types';

type Props = {
  status: TimerStatus;
  segment: Segment;
  remainingMs: number;
  segmentProgress: number;
  totalProgress: number;
  totalRemainingMs: number;
  round: number;
  rounds: number;
};

const RADIUS = 140;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const PHASES: Record<string, { label: string; color: string }> = {
  ready: { label: 'READY', color: '#94a3b8' },
  work: { label: 'WORK', color: '#a3e635' },
  rest: { label: 'REST', color: '#38bdf8' },
  paused: { label: 'PAUSED', color: '#fbbf24' },
  done: { label: 'DONE', color: '#34d399' },
};

export function TimerDisplay({
  status,
  segment,
  remainingMs,
  segmentProgress,
  totalProgress,
  totalRemainingMs,
  round,
  rounds,
}: Props) {
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
            style={{ transition: 'stroke-dashoffset 150ms linear, stroke 300ms ease' }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <span
            className="rounded-full px-3 py-1 text-xs font-bold tracking-[0.25em]"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            {label}
          </span>
          <span className="text-[64px] font-semibold leading-none tracking-tight tabular-nums">
            {formatClock(remainingMs)}
          </span>
          <span className="text-sm text-slate-400">
            Round {round} of {rounds}
          </span>
        </div>
      </div>

      <div className="mt-6 w-full">
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
          <span>{formatClock(totalRemainingMs)} left in session</span>
          <span className="tabular-nums">{Math.round(totalProgress * 100)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-lime-400 transition-all duration-150"
            style={{ width: `${totalProgress * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
