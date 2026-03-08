import type { AppConfig } from './types';

export type ActionHandler = () => void;

const isMac =
  typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

function normalizeShortcut(shortcut: string): string {
  return shortcut.replace('CmdOrCtrl', isMac ? 'Meta' : 'Ctrl').replace('Cmd', 'Meta');
}

function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = normalizeShortcut(shortcut).toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const needCtrl = parts.includes('ctrl');
  const needMeta = parts.includes('meta');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');

  const eventKey = e.key.toLowerCase();
  const bracketMap: Record<string, string> = { '[': 'bracketleft', ']': 'bracketright' };
  const keyMatches =
    eventKey === key || (key in bracketMap && e.code.toLowerCase() === bracketMap[key]);

  return (
    keyMatches &&
    e.ctrlKey === needCtrl &&
    e.metaKey === needMeta &&
    e.shiftKey === needShift &&
    e.altKey === needAlt
  );
}

export class KeybindingManager {
  private handlers: Map<string, ActionHandler> = new Map();
  private config: Record<string, string> = {};

  constructor() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  loadFromConfig(config: AppConfig): void {
    this.config = config.keybindings;
  }

  register(action: string, handler: ActionHandler): void {
    this.handlers.set(action, handler);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    for (const [action, shortcut] of Object.entries(this.config)) {
      if (matchesShortcut(e, shortcut)) {
        const handler = this.handlers.get(action);
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler();
          return;
        }
      }
    }
  }
}
