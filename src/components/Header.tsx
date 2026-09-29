import { Volume2, VolumeX, Vibrate, VibrateOff, WifiOff } from 'lucide-react';
import { useAppState } from '../state';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const iconButton =
  'rounded-lg p-2 transition active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-400/60';

export function Header() {
  const { settings, toggleSound, toggleVibrate } = useAppState();
  const online = useOnlineStatus();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center gap-3 px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400/10">
          <svg viewBox="0 0 100 100" className="h-5 w-5" aria-hidden="true">
            <rect x="44" y="11" width="12" height="6" rx="3" fill="#a3e635" />
            <rect x="47" y="15" width="6" height="6" fill="#a3e635" />
            <circle cx="50" cy="55" r="24" fill="none" stroke="#a3e635" stroke-width="7" />
            <line x1="50" y1="55" x2="50" y2="39" stroke="#e2e8f0" stroke-width="6" strokeLinecap="round" />
            <line x1="50" y1="55" x2="62" y2="62" stroke="#e2e8f0" stroke-width="6" strokeLinecap="round" />
          </svg>
        </span>
        <div className="leading-tight">
          <h1 className="text-base font-bold tracking-tight">Beep</h1>
          <p className="text-[11px] text-slate-400">offline interval timer</p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {!online && (
            <span className="mr-1 flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
              <WifiOff size={12} />
              Offline
            </span>
          )}
          <button
            onClick={toggleSound}
            aria-label={settings.sound ? 'Mute beeps' : 'Unmute beeps'}
            aria-pressed={settings.sound}
            className={`${iconButton} ${settings.sound ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}
          >
            {settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={toggleVibrate}
            aria-label={settings.vibrate ? 'Disable vibration' : 'Enable vibration'}
            aria-pressed={settings.vibrate}
            className={`${iconButton} ${settings.vibrate ? 'bg-slate-800 text-slate-100' : 'text-slate-500'}`}
          >
            {settings.vibrate ? <Vibrate size={18} /> : <VibrateOff size={18} />}
          </button>
        </div>
      </div>
    </header>
  );
}
