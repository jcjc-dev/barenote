import type { Tab } from './types';
import * as ipc from './ipc';

export type TabAction = 'select' | 'close' | 'create' | 'archive' | 'reorder' | 'rename';
export type TabCallback = (action: TabAction, tab?: Tab) => void;

export class TabBar {
  private container: HTMLElement;
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private callback: TabCallback;
  private dragState: { tabId: string; startX: number; el: HTMLElement | null } | null = null;
  private dropIndicator: HTMLElement | null = null;

  // Persistent DOM elements (created once in constructor)
  private tabList: HTMLElement;
  private newBtn: HTMLButtonElement;
  private archiveBtn: HTMLButtonElement;

  // Typed drag listener references for safe cleanup
  private boundDragMove: ((e: MouseEvent) => void) | null = null;
  private boundDragUp: ((e: MouseEvent) => void) | null = null;

  constructor(container: HTMLElement, callback: TabCallback) {
    this.container = container;
    this.callback = callback;
    this.container.classList.add('tab-bar');

    this.tabList = document.createElement('div');
    this.tabList.className = 'tab-list';

    this.newBtn = document.createElement('button');
    this.newBtn.className = 'tab-new';
    this.newBtn.textContent = '+';
    this.newBtn.title = 'New tab';

    this.archiveBtn = document.createElement('button');
    this.archiveBtn.className = 'tab-archive-btn';
    this.archiveBtn.innerHTML = '📦';
    this.archiveBtn.title = 'Toggle Archive';

    this.container.appendChild(this.tabList);
    this.container.appendChild(this.newBtn);
    this.container.appendChild(this.archiveBtn);

    this.setupEventDelegation();
    this.render();
  }

  /* ── Event delegation (attached once) ─────────────────────────── */

  private setupEventDelegation(): void {
    this.newBtn.addEventListener('click', () => this.callback('create'));
    this.archiveBtn.addEventListener('click', () => this.callback('archive'));

    this.tabList.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('tab-close')) return;
      if (target.tagName === 'INPUT') return;
      const tabEl = target.closest('[data-tab-id]') as HTMLElement | null;
      if (!tabEl) return;
      this.dragState = { tabId: tabEl.dataset.tabId!, startX: e.clientX, el: null };
      this.attachDragListeners();
    });

    this.tabList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;

      // Close button
      if (target.classList.contains('tab-close')) {
        const tabEl = target.closest('[data-tab-id]') as HTMLElement | null;
        if (!tabEl) return;
        const tab = this.tabs.find((t) => t.id === tabEl.dataset.tabId);
        if (tab) this.callback('close', tab);
        return;
      }

      // Tab selection
      const tabEl = target.closest('[data-tab-id]') as HTMLElement | null;
      if (!tabEl) return;
      const tabId = tabEl.dataset.tabId!;
      if (this.activeTabId !== tabId) {
        this.activeTabId = tabId;
        this.render();
        const tab = this.tabs.find((t) => t.id === tabId);
        if (tab) this.callback('select', tab);
      }
    });

    this.tabList.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('tab-title')) return;
      e.preventDefault();
      e.stopPropagation();
      const tabEl = target.closest('[data-tab-id]') as HTMLElement | null;
      if (!tabEl) return;
      const tab = this.tabs.find((t) => t.id === tabEl.dataset.tabId);
      if (tab) this.startRename(tab, target);
    });
  }

  /* ── Drag listeners (attached per-drag, properly cleaned up) ── */

  private attachDragListeners(): void {
    this.detachDragListeners();

    this.boundDragMove = (e: MouseEvent) => {
      if (!this.dragState) return;

      const dx = Math.abs(e.clientX - this.dragState.startX);
      if (dx < 5 && !this.dragState.el) return;

      if (!this.dragState.el) {
        const srcEl = this.tabList.querySelector(
          `[data-tab-id="${this.dragState.tabId}"]`,
        ) as HTMLElement;
        if (srcEl) {
          srcEl.classList.add('dragging');
          this.dragState.el = srcEl;
          document.body.style.userSelect = 'none';
          document.body.style.webkitUserSelect = 'none';
          document.body.style.cursor = 'grabbing';
        }
      }

      const tabItems = Array.from(this.tabList.querySelectorAll('.tab-item')) as HTMLElement[];
      this.removeDropIndicator();

      for (const item of tabItems) {
        if (item.dataset.tabId === this.dragState.tabId) continue;
        const rect = item.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          this.showDropIndicator(item, e.clientX < midX ? 'before' : 'after');
          break;
        }
      }
    };

    this.boundDragUp = (e: MouseEvent) => {
      if (!this.dragState) {
        this.detachDragListeners();
        return;
      }

      const wasDragging = this.dragState.el !== null;

      if (wasDragging) {
        const tabItems = Array.from(this.tabList.querySelectorAll('.tab-item')) as HTMLElement[];
        let targetIdx = -1;

        for (let i = 0; i < tabItems.length; i++) {
          const item = tabItems[i];
          if (item.dataset.tabId === this.dragState.tabId) continue;
          const rect = item.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;

          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            const itemTabIdx = this.tabs.findIndex((t) => t.id === item.dataset.tabId);
            targetIdx = e.clientX < midX ? itemTabIdx : itemTabIdx + 1;
            break;
          }
        }

        if (targetIdx >= 0) {
          const fromIdx = this.tabs.findIndex((t) => t.id === this.dragState!.tabId);
          if (fromIdx >= 0 && fromIdx !== targetIdx) {
            const [moved] = this.tabs.splice(fromIdx, 1);
            const adjustedIdx = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
            this.tabs.splice(adjustedIdx, 0, moved);
            this.callback('reorder');
          }
        }

        this.removeDropIndicator();
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        document.body.style.cursor = '';
        this.render();
      }

      this.dragState = null;
      this.detachDragListeners();
    };

    document.addEventListener('mousemove', this.boundDragMove);
    document.addEventListener('mouseup', this.boundDragUp);
  }

  private detachDragListeners(): void {
    if (this.boundDragMove) {
      document.removeEventListener('mousemove', this.boundDragMove);
      this.boundDragMove = null;
    }
    if (this.boundDragUp) {
      document.removeEventListener('mouseup', this.boundDragUp);
      this.boundDragUp = null;
    }
  }

  /* ── Public API ────────────────────────────────────────────────── */

  setTabs(tabs: Tab[], activeId?: string): void {
    this.tabs = tabs;
    if (activeId) {
      this.activeTabId = activeId;
    } else if (!this.activeTabId || !tabs.find((t) => t.id === this.activeTabId)) {
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
    const titleEl = this.container.querySelector(
      `.tab-item.active .tab-title`,
    ) as HTMLElement | null;
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    if (titleEl && tab) {
      this.startRename(tab, titleEl);
    }
  }

  moveActiveTab(offset: number): void {
    if (!this.activeTabId) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeTabId);
    if (idx < 0) return;
    const newIdx = idx + offset;
    if (newIdx < 0 || newIdx >= this.tabs.length) return;
    const [moved] = this.tabs.splice(idx, 1);
    this.tabs.splice(newIdx, 0, moved);
    this.render();
    this.callback('reorder');
  }

  switchTab(offset: number): void {
    if (this.tabs.length === 0) return;
    const idx = this.tabs.findIndex((t) => t.id === this.activeTabId);
    let newIdx = idx + offset;
    if (newIdx < 0) newIdx = this.tabs.length - 1;
    if (newIdx >= this.tabs.length) newIdx = 0;
    const tab = this.tabs[newIdx];
    this.activeTabId = tab.id;
    this.render();
    this.callback('select', tab);
  }

  destroy(): void {
    this.detachDragListeners();
    this.removeDropIndicator();
    this.container.innerHTML = '';
  }

  /* ── Incremental render ────────────────────────────────────────── */

  private render(): void {
    const existingEls = new Map<string, HTMLElement>();
    for (const el of Array.from(
      this.tabList.querySelectorAll<HTMLElement>('.tab-item[data-tab-id]'),
    )) {
      existingEls.set(el.dataset.tabId!, el);
    }

    const desiredIds = new Set(this.tabs.map((t) => t.id));

    // Remove tabs no longer in the model
    for (const [id, el] of existingEls) {
      if (!desiredIds.has(id)) {
        el.remove();
        existingEls.delete(id);
      }
    }

    // Update or create tab elements, ensuring correct order
    let prevSibling: HTMLElement | null = null;
    for (const tab of this.tabs) {
      let tabEl = existingEls.get(tab.id);

      if (tabEl) {
        this.updateTabElement(tabEl, tab);
      } else {
        tabEl = this.createTabElement(tab);
      }

      // Place after previous sibling (or at the start of the list)
      const expectedNext: ChildNode | null = prevSibling
        ? prevSibling.nextSibling
        : this.tabList.firstChild;
      if (tabEl !== expectedNext) {
        if (prevSibling) {
          prevSibling.after(tabEl);
        } else {
          this.tabList.prepend(tabEl);
        }
      }

      prevSibling = tabEl;
    }
  }

  private createTabElement(tab: Tab): HTMLElement {
    const tabEl = document.createElement('div');
    tabEl.className = `tab-item${tab.id === this.activeTabId ? ' active' : ''}`;
    tabEl.dataset.tabId = tab.id;

    const title = document.createElement('span');
    title.className = 'tab-title';
    const isSettingsTab = tab.id === '__settings__';
    if (!tab.file_path && !isSettingsTab) {
      title.classList.add('unsaved');
      title.textContent = '~ ' + tab.title;
    } else {
      title.textContent = tab.title;
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';

    tabEl.appendChild(title);
    tabEl.appendChild(closeBtn);
    return tabEl;
  }

  private updateTabElement(tabEl: HTMLElement, tab: Tab): void {
    tabEl.classList.toggle('active', tab.id === this.activeTabId);

    const isSettingsTab = tab.id === '__settings__';
    const isUnsaved = !tab.file_path && !isSettingsTab;
    const expectedText = isUnsaved ? '~ ' + tab.title : tab.title;

    let titleEl = tabEl.querySelector('.tab-title') as HTMLElement | null;

    if (!titleEl) {
      // Title span was replaced by rename input — recreate it
      titleEl = document.createElement('span');
      titleEl.className = 'tab-title';
      const inputEl = tabEl.querySelector('.tab-rename-input');
      if (inputEl) {
        inputEl.replaceWith(titleEl);
      } else {
        tabEl.prepend(titleEl);
      }
    }

    if (titleEl.textContent !== expectedText) {
      titleEl.textContent = expectedText;
    }
    titleEl.classList.toggle('unsaved', isUnsaved);
  }

  /* ── Helpers ───────────────────────────────────────────────────── */

  private showDropIndicator(target: HTMLElement, position: 'before' | 'after'): void {
    this.removeDropIndicator();
    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'tab-drop-indicator';
    if (position === 'before') {
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
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tab-rename-input';
    input.value = tab.title;
    let finished = false;

    const finish = async (): Promise<void> => {
      if (finished) return;
      finished = true;
      const newTitle = input.value.trim() || tab.title;
      tab.title = newTitle;
      try {
        await ipc.renameTab(tab.id, newTitle);
      } catch (e) {
        console.error(e);
      }
      this.render();
    };

    input.addEventListener('blur', () => {
      finish();
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // prevent keybinding manager from catching these
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = tab.title;
        input.blur();
      }
    });

    titleEl.replaceWith(input);
    input.focus();
    input.select();
  }
}
