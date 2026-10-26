import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLogViewer } from './workspace-log-viewer';
import { workspaceCache } from '@/lib/workspace-cache';
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/tauri', () => ({ safeInvoke: mocks.invoke, isTauri: () => true }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
const cursor = { identity: 'file', offset: 4, prefix: 'hash', prefix_len: 4 };
const base = { path: 'C:/test/error.log', size: 4, cursor, missing: false, reset: false, skipped: false };
beforeEach(() => { workspaceCache.reset(); workspaceCache.setVisible(true); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); });
afterEach(() => { workspaceCache.reset(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
async function mount(management = false) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><WorkspaceLogViewer service="apache" management={management} /></MemoryRouter>));
  return { host, click: async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    await act(async () => button.click());
  }, dispose: async () => { await act(async () => root.unmount()); host.remove(); } };
}
describe('log workspace actions', () => {
  it('loads shared management without polling a service log', async () => {
    mocks.invoke.mockImplementation(async (command) => {
      if (command === 'list_log_archives') return [];
      if (command === 'get_log_policy') return { enabled: false, rotate_mib: 20, retention_days: 14, per_log: 10, budget_mib: 200 };
      throw new Error(`Unexpected ${command}`);
    });
    const ui = await mount(true);
    try {
      await ui.click('Rotation & retention');
      expect(ui.host.textContent).toContain('One shared policy');
      expect(mocks.invoke.mock.calls.some(([name]) => name === 'read_log_chunk')).toBe(false);
    } finally { await ui.dispose(); }
  });
  it('keeps Clear view empty on refresh, then restores history explicitly', async () => {
    mocks.invoke.mockImplementation(async (command, args) => {
      if (command === 'read_log_chunk') return { ...base, text: args.clear || args.cursor ? '' : 'old\n', reset: !args.cursor };
      throw new Error(`Unexpected ${command}`);
    });
    const ui = await mount();
    try {
      expect(ui.host.querySelector('pre')?.textContent).toContain('old');
      await ui.click('Clear view'); await ui.click('Refresh');
      expect(ui.host.querySelector('pre')?.textContent).not.toContain('old');
      expect(ui.host.textContent).toContain('The log file is unchanged');
      await ui.click('Show recent history'); expect(ui.host.querySelector('pre')?.textContent).toContain('old');
      expect(mocks.invoke.mock.calls.some(([name]) => name === 'delete_log_contents')).toBe(false);
    } finally { await ui.dispose(); }
  });
  it('shows a locked-writer refusal without clearing displayed history', async () => {
    mocks.invoke.mockImplementation(async (command) => {
      if (command === 'read_log_chunk') return { ...base, text: 'old\n', reset: true };
      if (command === 'archive_log') throw new Error('Stop httpd.exe before archiving');
      throw new Error(`Unexpected ${command}`);
    });
    const ui = await mount();
    try { await ui.click('Archive current log'); expect(ui.host.textContent).toContain('Stop httpd.exe'); expect(ui.host.querySelector('pre')?.textContent).toContain('old'); }
    finally { await ui.dispose(); }
  });
});
