import type { ReactNode } from 'react';
import { isEmbeddedBrowser } from './print-guide-utils';

export interface PrintGuideProps {
  className?: string;
  /** Allows tests and embedded hosts to provide a deterministic user-agent. */
  userAgent?: string;
  children?: ReactNode;
}

/** Shared A4/PDF instructions, including the common in-app browser limitation. */
export function PrintGuide({ className = '', userAgent, children }: PrintGuideProps) {
  const embedded = isEmbeddedBrowser(userAgent);
  return <aside className={`print-guide no-print${embedded ? ' print-guide--warning' : ''}${className ? ` ${className}` : ''}`.trim()} role="note">
    <b>{embedded ? '当前可能位于微信/QQ 或内置浏览器' : '打印建议'}</b>
    <p>{embedded
      ? <>内置浏览器通常不能稳定保存 PDF；请点击右上角菜单，选择“在浏览器中打开”，再使用系统 Chrome、Edge 或 Safari 打印。</>
      : <>选择 A4、缩放 100%，关闭浏览器页眉页脚；不要再次启用“适合页面”缩放。需要 PDF 时选择“保存为 PDF”。</>}
    </p>
    {children}
  </aside>;
}

export default PrintGuide;
