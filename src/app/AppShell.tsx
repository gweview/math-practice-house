import type { ReactNode } from 'react';
import type { StudioMode } from './app-config';
import ModeNavigation from './ModeNavigation';

export interface AppShellProps {
  mode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
  children: ReactNode;
}

export function AppShell({ mode, onModeChange, children }: AppShellProps) {
  return <div className={`app mode-${mode}`}>
    <a className="skip-link" href="#app-main">跳到主要内容</a>
    <div className="sky-decor" aria-hidden="true"><span className="sun">☀</span><span className="cloud c1">☁</span><span className="cloud c2">☁</span><span className="tiny-star s1">★</span><span className="tiny-star s2">★</span></div>
    <header className="hero"><div className="brand-mark" aria-hidden="true">∑</div><div><p className="eyebrow">每天一点点，数学大进步</p><h1>快乐数学练习屋</h1><p>启蒙至六年级 · 丰富题库 · 清晰打印 · 本地生成</p></div></header>
    <ModeNavigation mode={mode} onChange={onModeChange} />
    <main id="app-main" tabIndex={-1}>{children}</main>
    <footer className="privacy no-print"><span aria-hidden="true">⌂</span><p><strong>隐私优先</strong><br />题目只在浏览器本地生成，不收集或上传儿童个人信息。</p></footer>
  </div>;
}

export default AppShell;
