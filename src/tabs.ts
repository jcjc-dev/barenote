import type { Tab } from "./types";
import * as ipc from "./ipc";

export type TabAction = "select" | "close" | "create" | "archive" | "reorder" | "rename";
export type TabCallback = (action: TabAction, tab?: Tab) => void;

export class TabBar {
  private container: HTMLElement;
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private callback: TabCallback;
  private draggedTab: string | null = null;

  constructor(container: HTMLElement, callback: TabCallback) {
    this.container = container;
    this.callback = callback;
    this.container.classList.add("tab-bar");
    this.render();
  }

  setTabs(tabs: Tab[], activeId?: string): void {
    this.tabs = tabs;
    if (activeId) this.activeTabId = activeId;
    else if (tabs.length > 0 && !this.activeTabId) this.activeTabId = tabs[0].id;
    this.render();
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  setActiveTab(id: string): void {
    this.activeTabId = id;
    this.render();
  }

  getTabs(): Tab[] {
    return [...this.tabs];
  }

  /** Trigger rename on the currently active tab */
  renameActiveTab(): void {
    if (!this.activeTabId) return;
    const titleEl = this.container.querySelector(`.tab-item.active .tab-title`) as HTMLElement | null;
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (titleEl && tab) {
      this.startRename(tab, titleEl);
    }
  }

  /** Move the active tab by offset (-1 = left, +1 = right) */
  moveActiveTab(offset: number): void {
    if (!this.activeTabId) return;
    const idx = this.tabs.findIndex(t => t.id === this.activeTabId);
    if (idx < 0) return;
    const newIdx = idx + offset;
    if (newIdx < 0 || newIdx >= this.tabs.length) return;
    const [moved] = this.tabs.splice(idx, 1);
    this.tabs.splice(newIdx, 0, moved);
    this.render();
    this.callback("reorder");
  }

  /** Switch to the next/previous tab */
  switchTab(offset: number): void {
    if (this.tabs.length === 0) return;
    const idx = this.tabs.findIndex(t => t.id === this.activeTabId);
    let newIdx = idx + offset;
    if (newIdx < 0) newIdx = this.tabs.length - 1;
    if (newIdx >= this.tabs.length) newIdx = 0;
    const tab = this.tabs[newIdx];
    this.activeTabId = tab.id;
    this.render();
    this.callback("select", tab);
  }

  private render(): void {
    this.container.innerHTML = "";

    const tabList = document.createElement("div");
    tabList.className = "tab-list";

    for (const tab of this.tabs) {
      const tabEl = document.createElement("div");
      tabEl.className = `tab-item${tab.id === this.activeTabId ? " active" : ""}`;
      tabEl.draggable = true;
      tabEl.dataset.tabId = tab.id;

      const title = document.createElement("span");
      title.className = "tab-title";
      // Unsaved tabs (no file_path) show with "~ " prefix and unsaved style
      const isSettingsTab = tab.id === "__settings__";
      if (!tab.file_path && !isSettingsTab) {
        title.classList.add("unsaved");
        title.textContent = "~ " + tab.title;
      } else {
        title.textContent = tab.title;
      }
      title.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this.startRename(tab, title);
      });

      const closeBtn = document.createElement("button");
      closeBtn.className = "tab-close";
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callback("close", tab);
      });

      tabEl.appendChild(title);
      tabEl.appendChild(closeBtn);

      tabEl.addEventListener("click", () => {
        this.activeTabId = tab.id;
        this.render();
        this.callback("select", tab);
      });

      tabEl.addEventListener("dragstart", (e) => {
        this.draggedTab = tab.id;
        tabEl.classList.add("dragging");
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      tabEl.addEventListener("dragend", () => {
        tabEl.classList.remove("dragging");
        this.draggedTab = null;
      });
      tabEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });
      tabEl.addEventListener("drop", (e) => {
        e.preventDefault();
        if (this.draggedTab && this.draggedTab !== tab.id) {
          const fromIdx = this.tabs.findIndex((t) => t.id === this.draggedTab);
          const toIdx = this.tabs.findIndex((t) => t.id === tab.id);
          if (fromIdx >= 0 && toIdx >= 0) {
            const [moved] = this.tabs.splice(fromIdx, 1);
            this.tabs.splice(toIdx, 0, moved);
            this.render();
            this.callback("reorder");
          }
        }
      });

      tabList.appendChild(tabEl);
    }

    const newBtn = document.createElement("button");
    newBtn.className = "tab-new";
    newBtn.textContent = "+";
    newBtn.title = "New tab";
    newBtn.addEventListener("click", () => this.callback("create"));

    const archiveBtn = document.createElement("button");
    archiveBtn.className = "tab-archive-btn";
    archiveBtn.innerHTML = "📦";
    archiveBtn.title = "Toggle Archive";
    archiveBtn.addEventListener("click", () => this.callback("archive" as TabAction));

    this.container.appendChild(tabList);
    this.container.appendChild(newBtn);
    this.container.appendChild(archiveBtn);
  }

  private startRename(tab: Tab, titleEl: HTMLElement): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "tab-rename-input";
    input.value = tab.title;

    const finish = async (): Promise<void> => {
      const newTitle = input.value.trim() || tab.title;
      tab.title = newTitle;
      try { await ipc.renameTab(tab.id, newTitle); } catch (e) { console.error(e); }
      this.render();
    };

    input.addEventListener("blur", () => { finish(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") { input.value = tab.title; input.blur(); }
    });

    titleEl.replaceWith(input);
    input.focus();
    input.select();
  }
}
