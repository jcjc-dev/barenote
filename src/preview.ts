import { marked } from "marked";

export class MarkdownPreview {
  private container: HTMLElement;
  private visible: boolean = false;
  private debounceTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.classList.add("preview-panel");
    this.container.style.display = "none";
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? "flex" : "none";
    return this.visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  update(markdown: string): void {
    if (!this.visible) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.render(markdown);
    }, 300);
  }

  private render(markdown: string): void {
    const html = marked.parse(markdown) as string;
    this.container.innerHTML = `<div class="preview-content">${html}</div>`;
  }
}
