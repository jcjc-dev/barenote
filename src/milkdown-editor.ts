import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { getMarkdown, replaceAll } from "@milkdown/kit/utils";
import { markdownTableDetectPlugin } from "./markdown-table-input";
import "@milkdown/prose/view/style/prosemirror.css";

export type ChangeCallback = () => void;

export class MilkdownEditor {
  private container: HTMLElement;
  private editor: Editor | null = null;
  private onChange: ChangeCallback | undefined;
  private wrapper: HTMLElement;
  private ready: Promise<void>;

  constructor(container: HTMLElement, content: string, onChange?: ChangeCallback) {
    this.container = container;
    this.onChange = onChange;

    this.wrapper = document.createElement("div");
    this.wrapper.classList.add("milkdown-container");
    this.container.appendChild(this.wrapper);

    this.ready = this.initEditor(content);
  }

  private async initEditor(content: string): Promise<void> {
    try {
      console.log("[Milkdown] initEditor called, content length:", content.length);
      this.editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, this.wrapper);
          ctx.set(defaultValueCtx, content);
        })
        .use(listener)
        .use(commonmark)
        .use(gfm)
        .use(markdownTableDetectPlugin)
        .use(history)
        .use(clipboard)
        .use(indent)
        .use(trailing)
        .create();

      // Set up change listener after editor is fully created
      if (this.onChange) {
        const onChangeFn = this.onChange;
        this.editor.action((ctx) => {
          ctx.get(listenerCtx).markdownUpdated(() => {
            onChangeFn();
          });
        });
      }

      console.log("[Milkdown] Editor created. DOM:", this.wrapper.innerHTML.substring(0, 300));
    } catch (e) {
      console.error("[Milkdown] init FAILED:", e);
    }
  }

  async waitForReady(): Promise<void> {
    await this.ready;
  }

  getContent(): string {
    if (!this.editor) return "";
    try {
      const md = this.editor.action(getMarkdown());
      // Process line-by-line: keep <br> in table rows (they preserve cell structure),
      // replace <br> with newline only outside tables.
      const lines = md.split('\n');
      const result: string[] = [];
      let inTable = false;
      for (const line of lines) {
        const trimmed = line.trim();
        const isTableRow = trimmed.startsWith('|') && trimmed.includes('|', 1);
        if (isTableRow) {
          inTable = true;
          // Inside table: remove <br> tags entirely (they were just hard breaks in cells)
          result.push(line.replace(/<br\s*\/?>/g, ' '));
        } else if (inTable && trimmed === '') {
          // Blank line after table: end of table
          inTable = false;
          result.push(line);
        } else {
          inTable = false;
          result.push(line.replace(/<br\s*\/?>/g, '\n'));
        }
      }
      return result.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    } catch {
      return "";
    }
  }

  async setContent(text: string): Promise<void> {
    await this.ready;
    if (!this.editor) return;
    try {
      this.editor.action(replaceAll(text));
    } catch (e) {
      console.error("Milkdown setContent failed:", e);
    }
  }

  async focus(): Promise<void> {
    await this.ready;
    if (!this.editor) return;
    try {
      this.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.focus();
      });
    } catch {
      // Editor may not be ready yet
    }
  }

  show(): void {
    this.wrapper.style.display = "flex";
    this.container.classList.add('mode-wysiwyg');
  }

  hide(): void {
    this.wrapper.style.display = "none";
    this.container.classList.remove('mode-wysiwyg');
  }

  isReady(): boolean {
    return this.editor !== null;
  }

  destroy(): void {
    this.editor?.destroy();
    this.editor = null;
    this.wrapper.remove();
  }
}
