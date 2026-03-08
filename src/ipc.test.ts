import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import * as ipc from './ipc';

const mockInvoke = vi.mocked(invoke);

describe('ipc', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('createTab calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue({ id: '1', title: 'New' });
    const result = await ipc.createTab('New');
    expect(mockInvoke).toHaveBeenCalledWith('create_tab', { title: 'New' });
    expect(result).toEqual({ id: '1', title: 'New' });
  });

  it('renameTab calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.renameTab('1', 'Renamed');
    expect(mockInvoke).toHaveBeenCalledWith('rename_tab', { id: '1', title: 'Renamed' });
  });

  it('closeTab calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.closeTab('1');
    expect(mockInvoke).toHaveBeenCalledWith('close_tab', { id: '1' });
  });

  it('archiveTab calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.archiveTab('1');
    expect(mockInvoke).toHaveBeenCalledWith('archive_tab', { id: '1' });
  });

  it('restoreTab calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.restoreTab('1');
    expect(mockInvoke).toHaveBeenCalledWith('restore_tab', { id: '1' });
  });

  it('listTabs calls invoke with no args', async () => {
    const tabs = [{ id: '1', title: 'Tab1' }];
    mockInvoke.mockResolvedValue(tabs);
    const result = await ipc.listTabs();
    expect(mockInvoke).toHaveBeenCalledWith('list_tabs');
    expect(result).toEqual(tabs);
  });

  it('listArchivedTabs calls invoke with no args', async () => {
    mockInvoke.mockResolvedValue([]);
    const result = await ipc.listArchivedTabs();
    expect(mockInvoke).toHaveBeenCalledWith('list_archived_tabs');
    expect(result).toEqual([]);
  });

  it('getTabContent calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue('hello');
    const result = await ipc.getTabContent('1');
    expect(mockInvoke).toHaveBeenCalledWith('get_tab_content', { id: '1' });
    expect(result).toBe('hello');
  });

  it('updateTabContent calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.updateTabContent('1', 'new content');
    expect(mockInvoke).toHaveBeenCalledWith('update_tab_content', {
      id: '1',
      content: 'new content',
    });
  });

  it('appendDelta converts deleteCount to snake_case', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.appendDelta('1', 5, 3, 'abc');
    expect(mockInvoke).toHaveBeenCalledWith('append_delta', {
      id: '1',
      position: 5,
      delete_count: 3,
      inserted: 'abc',
    });
  });

  it('getConfig calls invoke with no args', async () => {
    const config = { theme: 'dark' };
    mockInvoke.mockResolvedValue(config);
    const result = await ipc.getConfig();
    expect(mockInvoke).toHaveBeenCalledWith('get_config');
    expect(result).toEqual(config);
  });

  it('saveConfig calls invoke with correct args', async () => {
    const config = { theme: 'light' } as any;
    mockInvoke.mockResolvedValue(undefined);
    await ipc.saveConfig(config);
    expect(mockInvoke).toHaveBeenCalledWith('save_config', { config });
  });

  it('setWindowTheme calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.setWindowTheme('dark');
    expect(mockInvoke).toHaveBeenCalledWith('set_window_theme', { theme: 'dark' });
  });

  it('saveTabToPath calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.saveTabToPath('1', '/tmp/file.txt');
    expect(mockInvoke).toHaveBeenCalledWith('save_tab_to_path', { id: '1', path: '/tmp/file.txt' });
  });

  it('reorderTabs calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.reorderTabs(['1', '2', '3']);
    expect(mockInvoke).toHaveBeenCalledWith('reorder_tabs', { order: ['1', '2', '3'] });
  });

  it('deleteTab calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.deleteTab('1');
    expect(mockInvoke).toHaveBeenCalledWith('delete_tab', { id: '1' });
  });

  it('appendDeltaBatch converts deleteCount to snake_case for each delta', async () => {
    mockInvoke.mockResolvedValue(undefined);
    await ipc.appendDeltaBatch('1', [
      { position: 0, deleteCount: 1, inserted: 'a' },
      { position: 5, deleteCount: 0, inserted: 'b' },
    ]);
    expect(mockInvoke).toHaveBeenCalledWith('append_delta_batch', {
      id: '1',
      deltas: [
        { position: 0, delete_count: 1, inserted: 'a' },
        { position: 5, delete_count: 0, inserted: 'b' },
      ],
    });
  });

  it('openFile calls invoke with correct args', async () => {
    mockInvoke.mockResolvedValue('file contents');
    const result = await ipc.openFile('/tmp/file.txt');
    expect(mockInvoke).toHaveBeenCalledWith('open_file', { path: '/tmp/file.txt' });
    expect(result).toBe('file contents');
  });

  it('propagates errors from invoke', async () => {
    mockInvoke.mockRejectedValue(new Error('backend error'));
    await expect(ipc.createTab('fail')).rejects.toThrow('backend error');
  });
});
