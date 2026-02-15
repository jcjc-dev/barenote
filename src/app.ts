import { RawNoteEditor, type ChangeCallback } from "./editor";
import { TabBar } from "./tabs";
import { ArchivePanel } from "./archive";
import { MarkdownPreview } from "./preview";
import { KeybindingManager } from "./keybindings";
import { SettingsView } from "./settings";
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
  private settingsView: SettingsView | null = null;
  private isSettingsActive: boolean = false;

  constructor() {
    this.keybindings = new KeybindingManager();
  }

  async init(): Promise<void> {
    try {
      this.config = await ipc.getConfig();
    } catch {
      this.config = {
        theme: "system",
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

    // Initialize theme system
    try {
      const { initThemeSystem } = await import("./theme");
      const themeMode = (this.config.theme || "system") as string;
      initThemeSystem(themeMode as any);
    } catch {
      // theme module may not be available yet
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
    this.keybindings.register("saveAs", () => { this.saveAs(); });
    this.keybindings.register("settings", () => { this.openSettings(); });
    this.keybindings.register("renameTab", () => { this.tabBar?.renameActiveTab(); });
    this.keybindings.register("nextTab", () => { this.tabBar?.switchTab(1); });
    this.keybindings.register("prevTab", () => { this.tabBar?.switchTab(-1); });
    this.keybindings.register("moveTabLeft", () => { this.tabBar?.moveActiveTab(-1); });
    this.keybindings.register("moveTabRight", () => { this.tabBar?.moveActiveTab(1); });
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
          if (tab.id === "__settings__") {
            this.openSettings();
          } else {
            if (this.isSettingsActive) {
              this.closeSettings();
            }
            if (this.currentTabId && this.currentTabId !== "__settings__" && this.editCount > 0) {
              this.saveSnapshot();
            }
            this.currentTabId = tab.id;
            this.loadTabContent(tab.id);
          }
        }
        break;
      case "close":
        if (tab) {
          if (tab.id === "__settings__") {
            this.closeSettings();
            ipc.listTabs().then(tabs => {
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
      case "archive":
        this.archive?.toggle();
        break;
      case "reorder":
        this.persistTabOrder();
        break;
      case "rename":
        this.tabBar?.renameActiveTab();
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
      this.archive?.refresh();
      if (tabs.length > 0) {
        const newActiveId = this.tabBar?.getActiveTabId() || tabs[0].id;
        this.currentTabId = newActiveId;
        this.tabBar?.setActiveTab(newActiveId);
        await this.loadTabContent(newActiveId);
        this.editor?.focus();
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

  private async persistTabOrder(): Promise<void> {
    const tabs = this.tabBar?.getTabs() || [];
    const order = tabs.map(t => t.id).filter(id => id !== "__settings__");
    try {
      await ipc.reorderTabs(order);
    } catch (e) {
      console.error("Failed to persist tab order:", e);
    }
  }

  private async handleTabRestored(tab: Tab): Promise<void> {
    const tabs = await ipc.listTabs();
    this.tabBar?.setTabs(tabs, tab.id);
    this.currentTabId = tab.id;
    await this.loadTabContent(tab.id);
  }

  private async saveAs(): Promise<void> {
    if (!this.currentTabId || this.currentTabId === "__settings__") return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({
        defaultPath: this.tabBar?.getActiveTabId() ? undefined : "untitled.md",
        filters: [{ name: "Markdown", extensions: ["md", "txt"] }],
      });
      if (path) {
        if (this.editCount > 0) this.saveSnapshot();
        await ipc.saveTabToPath(this.currentTabId, path);
        const tabs = await ipc.listTabs();
        this.tabBar?.setTabs(tabs, this.currentTabId!);
      }
    } catch (e) {
      console.error("Save As failed:", e);
    }
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

  private openSettings(): void {
    if (this.isSettingsActive) return;

    if (this.currentTabId && this.currentTabId !== "__settings__" && this.editCount > 0) {
      this.saveSnapshot();
    }

    this.isSettingsActive = true;
    this.currentTabId = "__settings__";

    const settingsTab = {
      id: "__settings__",
      title: "⚙ Settings",
      created_at: "",
      updated_at: "",
      archived: false,
    } as Tab;

    ipc.listTabs().then(tabs => {
      if (!tabs.find(t => t.id === "__settings__")) {
        tabs.push(settingsTab);
      }
      this.tabBar?.setTabs(tabs, "__settings__");
    });

    const editorContainer = document.getElementById("editor-container")!;
    editorContainer.style.display = "none";

    let settingsContainer = document.getElementById("settings-container");
    if (!settingsContainer) {
      settingsContainer = document.createElement("div");
      settingsContainer.id = "settings-container";
      settingsContainer.style.flex = "1";
      settingsContainer.style.overflow = "auto";
      editorContainer.parentElement?.insertBefore(settingsContainer, editorContainer);
    }
    settingsContainer.style.display = "flex";

    this.settingsView = new SettingsView(settingsContainer, this.config!, (newConfig) => {
      this.handleSettingsChange(newConfig);
    });
  }

  private closeSettings(): void {
    if (!this.isSettingsActive) return;
    this.isSettingsActive = false;
    this.settingsView?.destroy();
    this.settingsView = null;

    const editorContainer = document.getElementById("editor-container")!;
    editorContainer.style.display = "flex";

    const settingsContainer = document.getElementById("settings-container");
    if (settingsContainer) {
      settingsContainer.style.display = "none";
    }
  }

  private handleSettingsChange(newConfig: AppConfig): void {
    this.config = newConfig;
    // Apply theme change immediately
    if (newConfig.theme) {
      import("./theme").then(({ applyTheme }) => {
        applyTheme(newConfig.theme as any);
      }).catch(() => {});
    }
    this.keybindings.loadFromConfig(newConfig);
  }
}
