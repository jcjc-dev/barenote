import type { AppConfig } from "./types";
import * as ipc from "./ipc";

export type SettingsChangeCallback = (config: AppConfig) => void;

export class SettingsView {
  private container: HTMLElement;
  private config: AppConfig;
  private onChange: SettingsChangeCallback;

  constructor(container: HTMLElement, config: AppConfig, onChange: SettingsChangeCallback) {
    this.container = container;
    this.config = structuredClone(config);
    this.onChange = onChange;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = "";
    
    const page = document.createElement("div");
    page.className = "settings-page";
    page.innerHTML = `
      <h1>Settings</h1>

      <section class="settings-section">
        <h2>Appearance</h2>
        <div class="settings-row">
          <label for="setting-theme">Theme</label>
          <select id="setting-theme">
            <option value="system"${this.config.theme === "system" ? " selected" : ""}>System (follow OS)</option>
            <option value="dark"${this.config.theme === "dark" ? " selected" : ""}>Dark</option>
            <option value="light"${this.config.theme === "light" ? " selected" : ""}>Light</option>
          </select>
        </div>
      </section>

      <section class="settings-section">
        <h2>Editor</h2>
        <div class="settings-row">
          <label for="setting-font-size">Font Size</label>
          <input type="number" id="setting-font-size" value="${this.config.editor.font_size}" min="8" max="48" />
        </div>
        <div class="settings-row">
          <label for="setting-tab-size">Tab Size</label>
          <input type="number" id="setting-tab-size" value="${this.config.editor.tab_size}" min="1" max="8" />
        </div>
        <div class="settings-row">
          <label for="setting-word-wrap">Word Wrap</label>
          <label class="toggle">
            <input type="checkbox" id="setting-word-wrap"${this.config.editor.word_wrap ? " checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <label for="setting-line-numbers">Line Numbers</label>
          <label class="toggle">
            <input type="checkbox" id="setting-line-numbers"${this.config.editor.line_numbers ? " checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="settings-row">
          <label for="setting-default-editor-mode">Default Editor Mode</label>
          <select id="setting-default-editor-mode">
            <option value="raw"${(this.config.editor.default_editor_mode ?? 'raw') === 'raw' ? " selected" : ""}>Raw</option>
            <option value="wysiwyg"${this.config.editor.default_editor_mode === 'wysiwyg' ? " selected" : ""}>WYSIWYG</option>
          </select>
        </div>
      </section>

      <section class="settings-section">
        <h2>Keyboard Shortcuts</h2>
        <p class="settings-hint">Click a shortcut to edit. Use format like "CmdOrCtrl+N" for cross-platform shortcuts.</p>
        <div class="keybindings-list">
          ${Object.entries(this.config.keybindings).map(([action, shortcut]) => `
            <div class="settings-row">
              <label>${this.formatActionName(action)}</label>
              <input type="text" class="keybinding-input" data-action="${action}" value="${shortcut}" />
            </div>
          `).join("")}
        </div>
      </section>

      <section class="settings-section">
        <h2>Persistence</h2>
        <div class="settings-row">
          <label for="setting-snapshot-edits">Snapshot every N edits</label>
          <input type="number" id="setting-snapshot-edits" value="${this.config.snapshot_interval_edits}" min="1" max="500" />
        </div>
        <div class="settings-row">
          <label for="setting-snapshot-ms">Snapshot interval (ms)</label>
          <input type="number" id="setting-snapshot-ms" value="${this.config.snapshot_interval_ms}" min="1000" max="60000" step="1000" />
        </div>
      </section>
    `;

    this.container.appendChild(page);

    // Wire event listeners
    this.bindInput("setting-theme", "change", (val) => { this.config.theme = val; });
    this.bindInput("setting-font-size", "change", (val) => { this.config.editor.font_size = parseInt(val); });
    this.bindInput("setting-tab-size", "change", (val) => { this.config.editor.tab_size = parseInt(val); });
    this.bindCheckbox("setting-word-wrap", (val) => { this.config.editor.word_wrap = val; });
    this.bindCheckbox("setting-line-numbers", (val) => { this.config.editor.line_numbers = val; });
    this.bindInput("setting-default-editor-mode", "change", (val) => { this.config.editor.default_editor_mode = val as 'raw' | 'wysiwyg'; });
    this.bindInput("setting-snapshot-edits", "change", (val) => { this.config.snapshot_interval_edits = parseInt(val); });
    this.bindInput("setting-snapshot-ms", "change", (val) => { this.config.snapshot_interval_ms = parseInt(val); });

    // Keybinding inputs
    this.container.querySelectorAll(".keybinding-input").forEach((input) => {
      input.addEventListener("change", (e) => {
        const el = e.target as HTMLInputElement;
        const action = el.dataset.action!;
        this.config.keybindings[action] = el.value;
        this.save();
      });
    });
  }

  private bindInput(id: string, event: string, setter: (val: string) => void): void {
    const el = this.container.querySelector(`#${id}`);
    el?.addEventListener(event, (e) => {
      setter((e.target as HTMLInputElement).value);
      this.save();
    });
  }

  private bindCheckbox(id: string, setter: (val: boolean) => void): void {
    const el = this.container.querySelector(`#${id}`);
    el?.addEventListener("change", (e) => {
      setter((e.target as HTMLInputElement).checked);
      this.save();
    });
  }

  private formatActionName(action: string): string {
    return action.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
  }

  private async save(): Promise<void> {
    try {
      await ipc.saveConfig(this.config);
      this.onChange(this.config);
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  }

  destroy(): void {
    this.container.innerHTML = "";
  }
}
