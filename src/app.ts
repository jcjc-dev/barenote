import { RawNoteEditor, type ChangeCallback } from "./editor";
import { TabBar } from "./tabs";
import { ArchivePanel } from "./archive";
import { MarkdownPreview } from "./preview";
import { KeybindingManager } from "./keybindings";
import * as ipc from "./ipc";
import type { Tab, AppConfig } from "./types";

export class App {
  private editor: RawNoteEditor | null = null;
  private tabBar: TabBar | null = null;
  private archive: ArchivePanel | null = null;
  private preview: MarkdownPreview | null = null;
  private keybindings: KeybindingManager;
  private config: AppConfig | null = null;
  private currentTabId: string | null = null;
  private editCount: number = 0;
  private snapshotTimer: number | null = null;

  constructor() {
    this.keybindings = new KeybindingManager();
  }

  async init(): Promise<void> {
    try {
      this.config = await ipc.getConfig();
    } catch {
      this.config = {
        keybindings: {
          newTab: "CmdOrCtrl+N",
          closeTab: "CmdOrCtrl+W",
          find: "CmdOrCtrl+F",
          togglePreview: "CmdOrCtrl+P",
        },
        editor: { font_size: 14, tab_size: 2, word_wrap: true, line_numbers: true },
        snapshot_interval_edits: 50,
        snapshot_interval_ms: 5000,
      };
    }

    this.setupUI();
    this.setupKeybindings();
    await this.loadTabs();
  }

  private setupUI(): void {
    const app = document.getElementById("app")!;
    app.innerHTML = `
      <div class="tab-bar-container" id="tab-bar"></div>
      <div class="main-area">
        <div class="editor-container" id="editor-container"></div>
        <div class="preview-panel" id="preview-panel"></div>
        <div class="archive-panel" id="archive-panel"></div>
      </div>
    `;

    this.tabBar = new TabBar(
      document.getElementById("tab-bar")!,
      (action, tab) => { this.handleTabAction(action, tab); }
    );

    const editorContainer = document.getElementById("editor-container")!;
    const onChange: ChangeCallback = (changes) => this.handleEditorChanges(changes);
    this.editor = new RawNoteEditor(editorContainer, "", onChange);

    this.preview = new MarkdownPreview(document.getElementById("preview-panel")!);

    this.archive = new ArchivePanel(
      document.getElementById("archive-panel")!,
      (tab) => { this.handleTabRestored(tab); }
    );
  }

  private setupKeybindings(): void {
    if (!this.config) return;
    this.keybindings.loadFromConfig(this.config);
    this.keybindings.register("newTab", () => { this.createNewTab(); });
    this.keybindings.register("closeTab", () => { this.closeCurrentTab(); });
    this.keybindings.register("find", () => this.editor?.openSearch());
    this.keybindings.register("togglePreview", () => this.togglePreview());
    this.keybindings.register("toggleArchive", () => { this.archive?.toggle(); });
  }

  private async loadTabs(): Promise<void> {
    try {
      const tabs = await ipc.listTabs();
      if (tabs.length === 0) {
        const tab = await ipc.createTab("Untitled");
        this.tabBar?.setTabs([tab], tab.id);
        this.currentTabId = tab.id;
      } else {
        this.tabBar?.setTabs(tabs);
        this.currentTabId = this.tabBar?.getActiveTabId() || tabs[0].id;
        await this.loadTabContent(this.currentTabId);
      }
    } catch (e) {
      console.error("Failed to load tabs:", e);
    }
  }

  private async loadTabContent(tabId: string): Promise<void> {
    try {
      const content = await ipc.getTabContent(tabId);
      this.editor?.setContent(content);
      this.editCount = 0;
      this.resetSnapshotTimer();
    } catch (e) {
      console.error("Failed to load tab content:", e);
      this.editor?.setContent("");
    }
  }

  private handleEditorChanges(changes: { fromA: number; toA: number; inserted: string }[]): void {
    if (!this.currentTabId) return;

    for (const change of changes) {
      ipc.appendDelta(
        this.currentTabId,
        change.fromA,
        change.toA - change.fromA,
        change.inserted
      ).catch(console.error);
    }

    this.editCount++;

    const threshold = this.config?.snapshot_interval_edits ?? 50;
    if (this.editCount >= threshold) {
      this.saveSnapshot();
    }

    if (this.preview?.isVisible()) {
      this.preview.update(this.editor?.getContent() || "");
    }
  }

  private saveSnapshot(): void {
    if (!this.currentTabId || !this.editor) return;
    const content = this.editor.getContent();
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
      case "create":
        this.createNewTab();
        break;
      case "select":
        if (tab && tab.id !== this.currentTabId) {
          if (this.currentTabId && this.editCount > 0) this.saveSnapshot();
          this.currentTabId = tab.id;
          this.loadTabContent(tab.id);
        }
        break;
      case "close":
        if (tab) this.archiveTab(tab.id);
        break;
    }
  }

  private async createNewTab(): Promise<void> {
    try {
      if (this.currentTabId && this.editCount > 0) this.saveSnapshot();
      const tab = await ipc.createTab("Untitled");
      const tabs = await ipc.listTabs();
      this.tabBar?.setTabs(tabs, tab.id);
      this.currentTabId = tab.id;
      this.editor?.setContent("");
      this.editCount = 0;
      this.editor?.focus();
    } catch (e) {
      console.error("Failed to create tab:", e);
    }
  }

  private async archiveTab(id: string): Promise<void> {
    try {
      if (id === this.currentTabId && this.editCount > 0) this.saveSnapshot();
      await ipc.closeTab(id);
      const tabs = await ipc.listTabs();
      this.tabBar?.setTabs(tabs);
      if (tabs.length > 0) {
        this.currentTabId = this.tabBar?.getActiveTabId() || tabs[0].id;
        await this.loadTabContent(this.currentTabId);
      } else {
        await this.createNewTab();
      }
    } catch (e) {
      console.error("Failed to archive tab:", e);
    }
  }

  private async closeCurrentTab(): Promise<void> {
    if (this.currentTabId) await this.archiveTab(this.currentTabId);
  }

  private async handleTabRestored(tab: Tab): Promise<void> {
    const tabs = await ipc.listTabs();
    this.tabBar?.setTabs(tabs, tab.id);
    this.currentTabId = tab.id;
    await this.loadTabContent(tab.id);
  }

  private togglePreview(): void {
    if (!this.preview) return;
    const visible = this.preview.toggle();
    const editorContainer = document.getElementById("editor-container");
    if (editorContainer) {
      editorContainer.classList.toggle("with-preview", visible);
    }
    if (visible && this.editor) {
      this.preview.update(this.editor.getContent());
    }
  }
}
