import { BareNoteEditor, type ChangeCallback } from './editor';
import { TabBar } from './tabs';
import { ArchivePanel } from './archive';
import { MarkdownPreview } from './preview';
import { KeybindingManager } from './keybindings';
import { SettingsView } from './settings';
import { Toast } from './toast';
import * as ipc from './ipc';
import type { Tab, AppConfig } from './types';

export class App {
  private editor: BareNoteEditor | null = null;
  private milkdownEditor: import('./milkdown-editor').MilkdownEditor | null = null;
  private toast: Toast;
  private tabModes: Map<string, 'raw' | 'wysiwyg'> = new Map();
  private modeIndicator: HTMLElement | null = null;
  private tabBar: TabBar | null = null;
  private archive: ArchivePanel | null = null;
  private preview: MarkdownPreview | null = null;
  private keybindings: KeybindingManager;
  private config: AppConfig | null = null;
  private currentTabId: string | null = null;
  private editCount: number = 0;
  private snapshotTimer: number | null = null;
  private pendingDeltas: { fromA: number; toA: number; inserted: string }[] = [];
  private batchTimer: number | null = null;
  private settingsView: SettingsView | null = null;
  private isSettingsActive: boolean = false;
  private isLoadingContent: boolean = false;

  constructor() {
    this.keybindings = new KeybindingManager();
    this.toast = new Toast();
  }

  async init(): Promise<void> {
    const defaults: AppConfig = {
      theme: 'system',
      keybindings: {
        newTab: 'CmdOrCtrl+N',
        closeTab: 'CmdOrCtrl+W',
        find: 'CmdOrCtrl+F',
        replace: 'CmdOrCtrl+H',
        togglePreview: 'CmdOrCtrl+P',
        toggleEditorMode: 'CmdOrCtrl+Shift+M',
        openFile: 'CmdOrCtrl+O',
      },
      editor: { font_size: 14, tab_size: 2, word_wrap: true, line_numbers: true },
      snapshot_interval_edits: 50,
      snapshot_interval_ms: 5000,
    };

    try {
      const loaded = await ipc.getConfig();
      this.config = {
        ...defaults,
        ...loaded,
        keybindings: { ...defaults.keybindings, ...loaded.keybindings },
        editor: { ...defaults.editor, ...loaded.editor },
      };
    } catch {
      this.config = defaults;
    }

    // Initialize theme system
    try {
      const { initThemeSystem } = await import('./theme');
      const themeMode = (this.config.theme || 'system') as string;
      initThemeSystem(themeMode as any);
    } catch {
      // theme module may not be available yet
    }

    this.setupUI();
    this.setupKeybindings();
    await this.loadTabs();
  }

  private setupUI(): void {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <div class="tab-bar-container" id="tab-bar"></div>
      <div class="main-area">
        <div class="editor-container" id="editor-container"></div>
        <div class="preview-panel" id="preview-panel"></div>
        <div class="archive-panel" id="archive-panel"></div>
      </div>
    `;

    this.tabBar = new TabBar(document.getElementById('tab-bar')!, (action, tab) => {
      this.handleTabAction(action, tab);
    });

    const editorContainer = document.getElementById('editor-container')!;
    const onChange: ChangeCallback = (changes) => this.handleEditorChanges(changes);
    this.editor = new BareNoteEditor(editorContainer, '', onChange);

    this.preview = new MarkdownPreview(document.getElementById('preview-panel')!);

    this.modeIndicator = document.createElement('div');
    this.modeIndicator.classList.add('mode-indicator');
    this.modeIndicator.textContent = 'Raw';
    editorContainer.style.position = 'relative';
    editorContainer.appendChild(this.modeIndicator);

    this.archive = new ArchivePanel(document.getElementById('archive-panel')!, (tab) => {
      this.handleTabRestored(tab);
    });
  }

  private setupKeybindings(): void {
    if (!this.config) return;
    this.keybindings.loadFromConfig(this.config);
    this.keybindings.register('newTab', () => {
      this.createNewTab();
    });
    this.keybindings.register('closeTab', () => {
      this.closeCurrentTab();
    });
    this.keybindings.register('find', () => this.editor?.openSearch());
    this.keybindings.register('replace', () => this.editor?.openReplace());
    this.keybindings.register('togglePreview', () => this.togglePreview());
    this.keybindings.register('toggleEditorMode', () => this.toggleEditorMode());
    this.keybindings.register('toggleArchive', () => {
      this.archive?.toggle();
    });
    this.keybindings.register('saveAs', () => {
      this.saveAs();
    });
    this.keybindings.register('openFile', () => {
      this.openFileDialog();
    });
    this.keybindings.register('settings', () => {
      this.openSettings();
    });
    this.keybindings.register('renameTab', () => {
      this.tabBar?.renameActiveTab();
    });
    this.keybindings.register('nextTab', () => {
      this.tabBar?.switchTab(1);
    });
    this.keybindings.register('prevTab', () => {
      this.tabBar?.switchTab(-1);
    });
    this.keybindings.register('moveTabLeft', () => {
      this.tabBar?.moveActiveTab(-1);
    });
    this.keybindings.register('moveTabRight', () => {
      this.tabBar?.moveActiveTab(1);
    });
  }

  private async loadTabs(): Promise<void> {
    try {
      const tabs = await ipc.listTabs();
      if (tabs.length === 0) {
        const tab = await ipc.createTab('Untitled');
        this.tabBar?.setTabs([tab], tab.id);
        this.currentTabId = tab.id;
      } else {
        this.tabBar?.setTabs(tabs);
        this.currentTabId = this.tabBar?.getActiveTabId() || tabs[0].id;
        await this.loadTabContent(this.currentTabId);
      }
    } catch (e) {
      console.error('Failed to load tabs:', e);
      this.toast.show('Failed to load tabs', 'error');
    }
  }

  private async loadTabContent(tabId: string): Promise<void> {
    this.isLoadingContent = true;
    try {
      const content = await ipc.getTabContent(tabId);
      const mode = this.tabModes.get(tabId) || (this.config?.editor?.default_editor_mode ?? 'raw');

      if (mode === 'wysiwyg') {
        this.editor?.hide();
        if (!this.milkdownEditor) {
          const editorContainer = document.getElementById('editor-container')!;
          editorContainer.classList.add('mode-wysiwyg');
          await this.ensureMilkdownEditor(editorContainer, content);
        } else {
          this.milkdownEditor.show();
          await this.milkdownEditor.setContent(content);
        }
      } else {
        this.milkdownEditor?.hide();
        this.editor?.show();
        this.editor?.setContent(content);
      }

      this.tabModes.set(tabId, mode);
      this.updateModeIndicator(mode);
      this.editCount = 0;
      this.resetSnapshotTimer();
    } catch (e) {
      console.error('Failed to load tab content:', e);
      this.toast.show('Failed to load note content', 'error');
      this.milkdownEditor?.hide();
      this.editor?.show();
      this.editor?.setContent('');
    } finally {
      this.isLoadingContent = false;
    }
  }

  private handleEditorChanges(changes: { fromA: number; toA: number; inserted: string }[]): void {
    if (!this.currentTabId || this.isLoadingContent) return;

    this.pendingDeltas.push(...changes);

    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
    }
    this.batchTimer = window.setTimeout(() => {
      this.flushDeltaBatch();
      this.batchTimer = null;
    }, 50);

    this.editCount++;

    const threshold = this.config?.snapshot_interval_edits ?? 50;
    if (this.editCount >= threshold) {
      this.saveSnapshot();
    }

    if (this.preview?.isVisible()) {
      this.preview.update(this.editor?.getContent() || '');
    }
  }

  private flushDeltaBatch(): void {
    if (!this.currentTabId || this.pendingDeltas.length === 0) return;
    const deltas = this.pendingDeltas.map((d) => ({
      position: d.fromA,
      deleteCount: d.toA - d.fromA,
      inserted: d.inserted,
    }));
    this.pendingDeltas = [];
    ipc.appendDeltaBatch(this.currentTabId, deltas).catch(console.error);
  }

  private saveSnapshot(): void {
    if (!this.currentTabId) return;
    // Flush any pending deltas before snapshotting
    this.flushDeltaBatch();
    const currentMode = this.tabModes.get(this.currentTabId) || 'raw';
    const content =
      currentMode === 'wysiwyg'
        ? this.milkdownEditor?.getContent() || ''
        : this.editor?.getContent() || '';
    if (!content && content !== '') return;
    ipc.updateTabContent(this.currentTabId, content).catch(console.error);
    this.editCount = 0;
    this.resetSnapshotTimer();
  }

  private resetSnapshotTimer(): void {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    const interval = this.config?.snapshot_interval_ms ?? 5000;
    this.snapshotTimer = window.setTimeout(() => {
      if (this.editCount > 0) this.saveSnapshot();
    }, interval);
  }

  private handleTabAction(action: string, tab?: Tab): void {
    switch (action) {
      case 'create':
        this.createNewTab();
        break;
      case 'select':
        if (tab && tab.id !== this.currentTabId) {
          if (tab.id === '__settings__') {
            this.openSettings();
          } else {
            if (this.isSettingsActive) {
              this.closeSettings();
            }
            if (this.currentTabId && this.currentTabId !== '__settings__' && this.editCount > 0) {
              this.saveSnapshot();
            }
            this.currentTabId = tab.id;
            this.loadTabContent(tab.id);
          }
        }
        break;
      case 'close':
        if (tab) {
          if (tab.id === '__settings__') {
            this.closeSettings();
            ipc.listTabs().then((tabs) => {
              this.tabBar?.setTabs(tabs);
              if (tabs.length > 0) {
                this.currentTabId = this.tabBar?.getActiveTabId() || tabs[0].id;
                this.loadTabContent(this.currentTabId);
              }
            });
          } else {
            this.archiveTab(tab.id);
          }
        }
        break;
      case 'archive':
        this.archive?.toggle();
        break;
      case 'reorder':
        this.persistTabOrder();
        break;
      case 'rename':
        this.tabBar?.renameActiveTab();
        break;
    }
  }

  private async createNewTab(): Promise<void> {
    try {
      if (this.currentTabId && this.editCount > 0) this.saveSnapshot();
      const tab = await ipc.createTab('Untitled');
      const tabs = await ipc.listTabs();
      this.tabBar?.setTabs(tabs, tab.id);
      this.currentTabId = tab.id;
      this.editor?.setContent('');
      this.editCount = 0;

      const defaultMode = this.config?.editor?.default_editor_mode ?? 'raw';
      if (defaultMode === 'wysiwyg' && this.currentTabId) {
        this.tabModes.set(this.currentTabId, 'wysiwyg');
        this.editor?.hide();
        if (!this.milkdownEditor) {
          const editorContainer = document.getElementById('editor-container')!;
          await this.ensureMilkdownEditor(editorContainer, '');
        } else {
          this.milkdownEditor.show();
          await this.milkdownEditor.setContent('');
        }
        this.updateModeIndicator('wysiwyg');
        await this.milkdownEditor?.focus();
      } else {
        this.tabModes.set(this.currentTabId!, 'raw');
        this.milkdownEditor?.hide();
        this.editor?.show();
        this.updateModeIndicator('raw');
        this.editor?.focus();
      }
    } catch (e) {
      console.error('Failed to create tab:', e);
      this.toast.show('Failed to create new tab', 'error');
    }
  }

  private async archiveTab(id: string): Promise<void> {
    try {
      if (id === this.currentTabId && this.editCount > 0) this.saveSnapshot();
      // Find adjacent tab before closing (prefer left neighbor, fallback to right)
      const oldTabs = this.tabBar?.getTabs() || [];
      const closedIdx = oldTabs.findIndex((t) => t.id === id);
      let nextTabId: string | null = null;
      if (closedIdx > 0) {
        nextTabId = oldTabs[closedIdx - 1].id;
      } else if (closedIdx === 0 && oldTabs.length > 1) {
        nextTabId = oldTabs[1].id;
      }

      await ipc.closeTab(id);
      const tabs = await ipc.listTabs();
      // Use the pre-computed adjacent tab, or fall back to first
      const activeId =
        nextTabId && tabs.find((t) => t.id === nextTabId) ? nextTabId : (tabs[0]?.id ?? null);
      this.tabBar?.setTabs(tabs, activeId ?? undefined);
      this.archive?.refresh();
      if (activeId) {
        this.currentTabId = activeId;
        await this.loadTabContent(activeId);
        this.editor?.focus();
      } else {
        await this.createNewTab();
      }
    } catch (e) {
      console.error('Failed to archive tab:', e);
      this.toast.show('Failed to close tab', 'error');
    }
  }

  private async closeCurrentTab(): Promise<void> {
    if (this.currentTabId) await this.archiveTab(this.currentTabId);
  }

  private async persistTabOrder(): Promise<void> {
    const tabs = this.tabBar?.getTabs() || [];
    const order = tabs.map((t) => t.id).filter((id) => id !== '__settings__');
    try {
      await ipc.reorderTabs(order);
    } catch (e) {
      console.error('Failed to persist tab order:', e);
      this.toast.show('Failed to save tab order', 'error');
    }
  }

  private async handleTabRestored(tab: Tab): Promise<void> {
    const tabs = await ipc.listTabs();
    this.tabBar?.setTabs(tabs, tab.id);
    this.currentTabId = tab.id;
    await this.loadTabContent(tab.id);
  }

  private async saveAs(): Promise<void> {
    if (!this.currentTabId || this.currentTabId === '__settings__') return;
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: this.tabBar?.getActiveTabId() ? undefined : 'untitled.md',
        filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }],
      });
      if (path) {
        if (this.editCount > 0) this.saveSnapshot();
        await ipc.saveTabToPath(this.currentTabId, path);
        const tabs = await ipc.listTabs();
        this.tabBar?.setTabs(tabs, this.currentTabId!);
      }
    } catch (e) {
      console.error('Save As failed:', e);
      this.toast.show('Failed to save file', 'error');
    }
  }

  private async openFileDialog(): Promise<void> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });
      if (selected) {
        const tabId = await ipc.openFile(selected);
        await this.loadTabs();
        await this.switchTab(tabId);
      }
    } catch (e) {
      console.error('Open file failed:', e);
      this.toast.show('Failed to open file', 'error');
    }
  }

  private async switchTab(tabId: string): Promise<void> {
    this.currentTabId = tabId;
    this.tabBar?.setActiveTab(tabId);
    await this.loadTabContent(tabId);
  }

  private async toggleEditorMode(): Promise<void> {
    if (!this.currentTabId || this.isSettingsActive) return;

    const currentMode = this.tabModes.get(this.currentTabId) || 'raw';
    const newMode = currentMode === 'raw' ? 'wysiwyg' : 'raw';
    console.log('[App] toggleEditorMode:', currentMode, '->', newMode);

    // Get content from whichever editor is active — must await milkdown readiness
    let content: string;
    if (currentMode === 'raw') {
      content = this.editor?.getContent() || '';
    } else {
      if (this.milkdownEditor) {
        await this.milkdownEditor.waitForReady();
      }
      content = this.milkdownEditor?.getContent() || '';
    }
    // Normalize to prevent newline accumulation between mode switches
    content = content.replace(/\n{3,}/g, '\n\n').trimEnd();
    console.log(
      '[App] content to transfer, length:',
      content.length,
      'preview:',
      content.substring(0, 80),
    );

    if (this.currentTabId && this.editCount > 0) {
      this.saveSnapshot();
    }

    if (newMode === 'wysiwyg') {
      this.editor?.hide();

      if (!this.milkdownEditor) {
        const editorContainer = document.getElementById('editor-container')!;
        console.log('[App] Creating new MilkdownEditor');
        await this.ensureMilkdownEditor(editorContainer, content);
        console.log('[App] MilkdownEditor ready');
      } else {
        console.log('[App] Reusing existing MilkdownEditor, setting content');
        this.milkdownEditor.show();
        await this.milkdownEditor.setContent(content);
      }

      // Debug: check DOM state
      const ec = document.getElementById('editor-container');
      if (ec) {
        console.log('[App] editor-container children:', ec.children.length);
        for (let i = 0; i < ec.children.length; i++) {
          const c = ec.children[i] as HTMLElement;
          console.log(
            `[App]   child ${i}: <${c.tagName} class="${c.className}"> display="${c.style.display}" offsetHeight=${c.offsetHeight}`,
          );
        }
      }

      if (this.preview?.isVisible()) {
        this.togglePreview();
      }

      await this.milkdownEditor?.focus();
    } else {
      this.milkdownEditor?.hide();
      this.editor?.show();
      this.isLoadingContent = true;
      this.editor?.setContent(content);
      this.isLoadingContent = false;
      this.editor?.focus();
    }

    this.tabModes.set(this.currentTabId, newMode);
    this.updateModeIndicator(newMode);
    this.editCount = 0;
    this.resetSnapshotTimer();
  }

  private async ensureMilkdownEditor(container: HTMLElement, content: string): Promise<void> {
    const { MilkdownEditor } = await import('./milkdown-editor');
    container.classList.add('mode-wysiwyg');
    this.milkdownEditor = new MilkdownEditor(container, content, () => {
      this.handleMilkdownChange();
    });
    await this.milkdownEditor.waitForReady();
  }

  private handleMilkdownChange(): void {
    if (!this.currentTabId) return;
    this.editCount++;
    const threshold = this.config?.snapshot_interval_edits ?? 50;
    if (this.editCount >= threshold) {
      this.saveSnapshot();
    }
  }

  private updateModeIndicator(mode: 'raw' | 'wysiwyg'): void {
    if (this.modeIndicator) {
      this.modeIndicator.textContent = mode === 'raw' ? 'Raw' : 'MD';
      this.modeIndicator.classList.toggle('wysiwyg-active', mode === 'wysiwyg');
    }
  }

  private togglePreview(): void {
    if (!this.preview) return;
    const visible = this.preview.toggle();
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
      editorContainer.classList.toggle('with-preview', visible);
    }
    if (visible && this.editor) {
      this.preview.update(this.editor.getContent());
    }
  }

  private openSettings(): void {
    if (this.isSettingsActive) return;

    if (this.currentTabId && this.currentTabId !== '__settings__' && this.editCount > 0) {
      this.saveSnapshot();
    }

    this.isSettingsActive = true;
    this.currentTabId = '__settings__';

    const settingsTab = {
      id: '__settings__',
      title: '⚙ Settings',
      created_at: '',
      updated_at: '',
      archived: false,
    } as Tab;

    ipc.listTabs().then((tabs) => {
      if (!tabs.find((t) => t.id === '__settings__')) {
        tabs.push(settingsTab);
      }
      this.tabBar?.setTabs(tabs, '__settings__');
    });

    const editorContainer = document.getElementById('editor-container')!;
    editorContainer.style.display = 'none';

    let settingsContainer = document.getElementById('settings-container');
    if (!settingsContainer) {
      settingsContainer = document.createElement('div');
      settingsContainer.id = 'settings-container';
      settingsContainer.style.flex = '1';
      settingsContainer.style.overflow = 'auto';
      editorContainer.parentElement?.insertBefore(settingsContainer, editorContainer);
    }
    settingsContainer.style.display = 'flex';

    this.settingsView = new SettingsView(settingsContainer, this.config!, (newConfig) => {
      this.handleSettingsChange(newConfig);
    });
  }

  private closeSettings(): void {
    if (!this.isSettingsActive) return;
    this.isSettingsActive = false;
    this.settingsView?.destroy();
    this.settingsView = null;

    const editorContainer = document.getElementById('editor-container')!;
    editorContainer.style.display = 'flex';

    const settingsContainer = document.getElementById('settings-container');
    if (settingsContainer) {
      settingsContainer.style.display = 'none';
    }
  }

  private handleSettingsChange(newConfig: AppConfig): void {
    this.config = newConfig;
    // Apply theme change immediately
    if (newConfig.theme) {
      import('./theme')
        .then(({ applyTheme }) => {
          applyTheme(newConfig.theme as any);
        })
        .catch(() => {});
    }
    this.keybindings.loadFromConfig(newConfig);
  }
}
