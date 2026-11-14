import { STUDIO_MODES, type StudioMode } from './app-config';

export interface ModeNavigationProps {
  mode: StudioMode;
  onChange: (mode: StudioMode) => void;
}

export function ModeNavigation({ mode, onChange }: ModeNavigationProps) {
  return <nav className="mode-switch no-print" aria-label="练习模式" role="tablist">
    {STUDIO_MODES.map((option, index) => <button
      type="button"
      role="tab"
      id={`${option.id}-tab`}
      className={mode === option.id ? 'selected' : ''}
      aria-pressed={mode === option.id}
      aria-selected={mode === option.id}
      aria-controls={`${option.id}-panel`}
      tabIndex={0}
      onClick={() => onChange(option.id)}
      onKeyDown={event => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const next = STUDIO_MODES[(index + delta + STUDIO_MODES.length) % STUDIO_MODES.length];
        onChange(next.id);
        window.setTimeout(() => document.getElementById(`${next.id}-tab`)?.focus(), 0);
      }}
      key={option.id}
    ><span aria-hidden="true">{option.icon}</span>{option.label}</button>)}
  </nav>;
}

export default ModeNavigation;
