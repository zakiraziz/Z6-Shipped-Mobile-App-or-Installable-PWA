import { History, SlidersHorizontal, Timer } from 'lucide-react';

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
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 pb-safe backdrop-blur">
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
