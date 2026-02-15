import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, highlightSpecialChars, rectangularSelection, crosshairCursor, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";

export type ChangeCallback = (changes: { fromA: number; toA: number; inserted: string }[]) => void;

export class RawNoteEditor {
  private view: EditorView;
  private onChange: ChangeCallback | null = null;

  constructor(container: HTMLElement, content: string = "", onChange?: ChangeCallback) {
    this.onChange = onChange || null;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && this.onChange) {
        const changes: { fromA: number; toA: number; inserted: string }[] = [];
        update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
          changes.push({ fromA, toA, inserted: inserted.toString() });
        });
        this.onChange(changes);
      }
    });

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      updateListener,
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: "14px",
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
        },
        ".cm-content": {
          caretColor: "var(--editor-caret)",
        },
        ".cm-activeLine": {
          backgroundColor: "var(--editor-active-line)",
        },
        ".cm-gutters": {
          backgroundColor: "var(--editor-gutter)",
          color: "var(--text-secondary)",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "var(--editor-active-line)",
        },
      }),
      EditorView.baseTheme({
        "&.cm-editor": {
          backgroundColor: "var(--editor-bg)",
          color: "var(--text-primary)",
        }
      }),
    ];

    this.view = new EditorView({
      state: EditorState.create({ doc: content, extensions }),
      parent: container,
    });
  }

  getContent(): string {
    return this.view.state.doc.toString();
  }

  setContent(text: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
    });
  }

  openSearch(): void {
    openSearchPanel(this.view);
  }

  focus(): void {
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }

  show(): void {
    this.view.dom.style.display = '';
    this.view.dom.parentElement?.classList.remove('mode-wysiwyg');
  }

  hide(): void {
    this.view.dom.style.display = 'none';
  }

  getView(): EditorView {
    return this.view;
  }
}
