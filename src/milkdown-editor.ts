import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { getMarkdown, replaceAll } from "@milkdown/kit/utils";
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
      return this.editor.action(getMarkdown());
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
