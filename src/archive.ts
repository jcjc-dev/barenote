import type { Tab } from "./types";
import * as ipc from "./ipc";

export class ArchivePanel {
  private container: HTMLElement;
  private visible: boolean = false;
  private onRestore: (tab: Tab) => void;

  constructor(container: HTMLElement, onRestore: (tab: Tab) => void) {
    this.container = container;
    this.onRestore = onRestore;
    this.container.classList.add("archive-panel");
    this.container.style.display = "none";
  }

  async toggle(): Promise<void> {
    this.visible = !this.visible;
    if (this.visible) {
      await this.fetchAndRender();
      this.container.style.display = "flex";
    } else {
      this.container.style.display = "none";
    }
  }

  async refresh(): Promise<void> {
    if (!this.visible) return;
    await this.fetchAndRender();
  }

  private async fetchAndRender(): Promise<void> {
    try {
      const tabs = await ipc.listArchivedTabs();
      this.render(tabs);
    } catch (e) {
      console.error("Failed to load archived tabs:", e);
      this.render([]);
    }
  }

  private render(tabs: Tab[]): void {
    this.container.innerHTML = "";

    const header = document.createElement("div");
    header.className = "archive-header";

    const h3 = document.createElement("h3");
    h3.textContent = "Archive";
    header.appendChild(h3);

    const closeBtn = document.createElement("button");
    closeBtn.className = "archive-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => { this.toggle(); });
    header.appendChild(closeBtn);

    this.container.appendChild(header);

    if (tabs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "archive-empty";
      empty.textContent = "No archived tabs";
      this.container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "archive-list";

    for (const tab of tabs) {
      const item = document.createElement("div");
      item.className = "archive-item";

      const info = document.createElement("div");
      info.className = "archive-item-info";

      const titleSpan = document.createElement("span");
      titleSpan.className = "archive-item-title";
      titleSpan.textContent = tab.title;

      const dateSpan = document.createElement("span");
      dateSpan.className = "archive-item-date";
      dateSpan.textContent = new Date(tab.updated_at).toLocaleDateString();

      info.appendChild(titleSpan);
      info.appendChild(dateSpan);

      const restoreBtn = document.createElement("button");
      restoreBtn.className = "archive-restore-btn";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", async () => {
        try {
          await ipc.restoreTab(tab.id);
          tab.archived = false;
          this.onRestore(tab);
          await this.refresh();
        } catch (e) {
          console.error("Failed to restore tab:", e);
        }
      });

      item.appendChild(info);
      item.appendChild(restoreBtn);
      list.appendChild(item);
    }

    this.container.appendChild(list);
  }
}
