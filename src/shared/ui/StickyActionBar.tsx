import type { ReactNode } from 'react';

export function StickyActionBar({ children, className = '', label = '主要操作' }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={`sticky-action-bar no-print ${className}`.trim()} role="group" aria-label={label}>{children}</div>;
}

export default StickyActionBar;
