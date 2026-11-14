import { describe, expect, it } from 'vitest';
import PreviewStatus from '../src/shared/ui/PreviewStatus';
import PrintGuide from '../src/shared/ui/PrintGuide';
import { isEmbeddedBrowser } from '../src/shared/ui/print-guide-utils';
import StickyActionBar from '../src/shared/ui/StickyActionBar';
import ModeNavigation from '../src/app/ModeNavigation';

function textOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join('');
  if (value && typeof value === 'object' && 'props' in value) return textOf((value as { props: { children?: unknown } }).props.children);
  return '';
}

describe('shared worksheet UI affordances', () => {
  it('recognises in-app browsers without depending on the test environment', () => {
    expect(isEmbeddedBrowser('Mozilla/5.0 MicroMessenger')).toBe(true);
    expect(isEmbeddedBrowser('Mozilla/5.0 (Linux; Android 14; wv)')).toBe(true);
    expect(isEmbeddedBrowser('Mozilla/5.0 Chrome/128 Safari/537.36')).toBe(false);
  });

  it('keeps print guidance out of print output and explains both routes', () => {
    const embedded = PrintGuide({ userAgent: 'MicroMessenger/8.0' });
    const browser = PrintGuide({ userAgent: 'Chrome/128' });
    expect(embedded.props.className).toContain('no-print');
    expect(textOf(embedded)).toContain('内置浏览器');
    expect(textOf(browser)).toContain('A4');
    expect(textOf(browser)).toContain('100%');
  });

  it('uses a focused live status instead of making the worksheet itself live', () => {
    const status = PreviewStatus({ summary: '1 张练习纸', stale: true });
    expect(status?.props.className).toContain('preview-status');
    expect(status?.props.children[0].props['aria-live']).toBe('polite');
    expect(status?.props.children[1].props.role).toBe('status');
  });

  it('exposes the mobile action as a labelled group', () => {
    const actions = StickyActionBar({ label: '数独生成操作', children: 'action' });
    expect(actions.props.className).toContain('no-print');
    expect(actions.props.role).toBe('group');
    expect(actions.props['aria-label']).toBe('数独生成操作');
  });

  it('connects keyboard-navigable mode tabs to their panels', () => {
    const navigation = ModeNavigation({ mode: 'math', onChange: () => undefined });
    const tabs = navigation.props.children as Array<{ props: Record<string, unknown> }>;
    expect(navigation.props.role).toBe('tablist');
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      expect(tab.props.role).toBe('tab');
      expect(tab.props.tabIndex).toBe(0);
      expect(tab.props['aria-controls']).toBe(`${String(tab.props.id).replace(/-tab$/, '')}-panel`);
    }
  });
});
