import type { Tab } from "./types";
import * as ipc from "./ipc";

export type TabAction = "select" | "close" | "create" | "archive" | "reorder" | "rename";
export type TabCallback = (action: TabAction, tab?: Tab) => void;

export class TabBar {
  private container: HTMLElement;
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private callback: TabCallback;
  private dragState: { tabId: string; startX: number; el: HTMLElement | null } | null = null;
  private dropIndicator: HTMLElement | null = null;

  constructor(container: HTMLElement, callback: TabCallback) {
    this.container = container;
    this.callback = callback;
    this.container.classList.add("tab-bar");
    this.render();
  }

  setTabs(tabs: Tab[], activeId?: string): void {
    this.tabs = tabs;
    if (activeId) {
      this.activeTabId = activeId;
    } else if (!this.activeTabId || !tabs.find(t => t.id === this.activeTabId)) {
      this.activeTabId = tabs.length > 0 ? tabs[0].id : null;
    }
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

  renameActiveTab(): void {
    if (!this.activeTabId) return;
    const titleEl = this.container.querySelector(`.tab-item.active .tab-title`) as HTMLElement | null;
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (titleEl && tab) {
      this.startRename(tab, titleEl);
    }
  }

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
      tabEl.dataset.tabId = tab.id;

      const title = document.createElement("span");
      title.className = "tab-title";
      const isSettingsTab = tab.id === "__settings__";
      if (!tab.file_path && !isSettingsTab) {
        title.classList.add("unsaved");
        title.textContent = "~ " + tab.title;
      } else {
        title.textContent = tab.title;
      }
      title.addEventListener("dblclick", (e) => {
        e.preventDefault();
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

      // Single click to select (with delay to not conflict with dblclick)
      tabEl.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).classList.contains("tab-close")) return;
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        // Start potential drag
        this.dragState = { tabId: tab.id, startX: e.clientX, el: null };
      });

      tabEl.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("tab-close")) return;
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        if (this.activeTabId !== tab.id) {
          this.activeTabId = tab.id;
          this.render();
          this.callback("select", tab);
        }
      });

      tabList.appendChild(tabEl);
    }

    // Global mouse handlers for drag
    const onMouseMove = (e: MouseEvent) => {
      if (!this.dragState) return;

      const dx = Math.abs(e.clientX - this.dragState.startX);
      if (dx < 5 && !this.dragState.el) return; // threshold before starting drag

      // Start visual drag
      if (!this.dragState.el) {
        const srcEl = tabList.querySelector(`[data-tab-id="${this.dragState.tabId}"]`) as HTMLElement;
        if (srcEl) {
          srcEl.classList.add("dragging");
          this.dragState.el = srcEl;
          document.body.style.userSelect = "none";
          document.body.style.webkitUserSelect = "none";
          document.body.style.cursor = "grabbing";
        }
      }

      // Find drop target
      const tabItems = Array.from(tabList.querySelectorAll(".tab-item")) as HTMLElement[];
      this.removeDropIndicator();

      for (const item of tabItems) {
        if (item.dataset.tabId === this.dragState.tabId) continue;
        const rect = item.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;

        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          if (e.clientX < midX) {
            this.showDropIndicator(item, "before");
          } else {
            this.showDropIndicator(item, "after");
          }
          break;
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!this.dragState) return;

      const wasDragging = this.dragState.el !== null;

      if (wasDragging) {
        // Find where to drop
        const tabItems = Array.from(tabList.querySelectorAll(".tab-item")) as HTMLElement[];
        let targetIdx = -1;

        for (let i = 0; i < tabItems.length; i++) {
          const item = tabItems[i];
          if (item.dataset.tabId === this.dragState.tabId) continue;
          const rect = item.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;

          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            const itemTabIdx = this.tabs.findIndex(t => t.id === item.dataset.tabId);
            if (e.clientX < midX) {
              targetIdx = itemTabIdx;
            } else {
              targetIdx = itemTabIdx + 1;
            }
            break;
          }
        }

        if (targetIdx >= 0) {
          const fromIdx = this.tabs.findIndex(t => t.id === this.dragState!.tabId);
          if (fromIdx >= 0 && fromIdx !== targetIdx) {
            const [moved] = this.tabs.splice(fromIdx, 1);
            // Adjust target index after removal
            const adjustedIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
            this.tabs.splice(adjustedIdx, 0, moved);
            this.callback("reorder");
          }
        }

        this.removeDropIndicator();
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
        document.body.style.cursor = "";
        this.render();
      }

      this.dragState = null;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp, { once: true });

    // Clean up listeners when re-rendering (store reference for cleanup)
    const oldCleanup = (this.container as any)._dragCleanup;
    if (oldCleanup) oldCleanup();
    (this.container as any)._dragCleanup = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

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

  private showDropIndicator(target: HTMLElement, position: "before" | "after"): void {
    this.removeDropIndicator();
    this.dropIndicator = document.createElement("div");
    this.dropIndicator.className = "tab-drop-indicator";
    if (position === "before") {
      target.parentElement?.insertBefore(this.dropIndicator, target);
    } else {
      target.parentElement?.insertBefore(this.dropIndicator, target.nextSibling);
    }
  }

  private removeDropIndicator(): void {
    if (this.dropIndicator) {
      this.dropIndicator.remove();
      this.dropIndicator = null;
    }
  }

  private startRename(tab: Tab, titleEl: HTMLElement): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "tab-rename-input";
    input.value = tab.title;
    let finished = false;

    const finish = async (): Promise<void> => {
      if (finished) return;
      finished = true;
      const newTitle = input.value.trim() || tab.title;
      tab.title = newTitle;
      try { await ipc.renameTab(tab.id, newTitle); } catch (e) { console.error(e); }
      this.render();
    };

    input.addEventListener("blur", () => { finish(); });
    input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // prevent keybinding manager from catching these
      if (e.key === "Enter") input.blur();
      if (e.key === "Escape") { input.value = tab.title; input.blur(); }
    });

    titleEl.replaceWith(input);
    input.focus();
    input.select();
  }
}
