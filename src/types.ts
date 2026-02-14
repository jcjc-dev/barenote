// Shared TypeScript types for RawNote
export interface Tab {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
}

export interface Delta {
  position: number;
  delete_count: number;
  inserted: string;
}

export interface EditorConfig {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
}

export interface AppConfig {
  keybindings: Record<string, string>;
  editor: EditorConfig;
  snapshotIntervalEdits: number;
  snapshotIntervalMs: number;
}
