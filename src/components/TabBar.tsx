import { History, Pause, SlidersHorizontal, Timer } from 'lucide-react';
import { formatClock } from '../lib/format';
import { useAppState } from '../state';

export type TabId = 'timer' | 'presets' | 'history';

const TABS = [
  { id: 'timer', label: 'Timer', Icon: Timer },
  { id: 'presets', label: 'Presets', Icon: SlidersHorizontal },
  { id: 'history', label: 'History', Icon: History },
] as const;

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (id: TabId) => void;
}) {
  const { timer } = useAppState();
  const live = timer.status === 'running' || timer.status === 'paused';

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-safe backdrop-blur">
      {/* Glanceable remaining time — the session stays visible on any tab. */}
      {live && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-lime-400/40 bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-lime-300 shadow-lg shadow-black/50"
        >
          {timer.status === 'paused' && <Pause size={9} className="mr-1 inline align-[-1px]" />}
          {formatClock(timer.segmentRemainingMs)} · {timer.segment.label.toUpperCase()}
        </div>
      )}
      <div className="mx-auto flex h-16 max-w-md">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                isActive ? 'text-lime-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon size={20} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
