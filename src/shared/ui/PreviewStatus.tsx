import type { ReactNode } from 'react';

export interface PreviewStatusProps {
  summary?: ReactNode;
  stale?: boolean;
  staleMessage?: ReactNode;
  className?: string;
}

/** Small, shared live region for generation state; the worksheet itself is not live. */
export function PreviewStatus({ summary, stale = false, staleMessage = '设置已更改；当前预览仍使用上次生成的内容，请重新生成后再打印。', className = '' }: PreviewStatusProps) {
  if (!summary && !stale) return null;
  return <div className={`preview-status ${className}`.trim()}>
    {summary && <p className="preview-meta" role="status" aria-live="polite" aria-atomic="true">{summary}</p>}
    {stale && <p className="preview-stale" role="status" aria-live="polite" aria-atomic="true">{staleMessage}</p>}
  </div>;
}

export default PreviewStatus;
