export interface Tab {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
  file_path: string | null;
}

export interface Delta {
  position: number;
  delete_count: number;
  inserted: string;
}

export interface EditorConfig {
  font_size: number;
  tab_size: number;
  word_wrap: boolean;
  line_numbers: boolean;
  default_editor_mode?: 'raw' | 'wysiwyg';
}

export interface AppConfig {
  keybindings: Record<string, string>;
  editor: EditorConfig;
  snapshot_interval_edits: number;
  snapshot_interval_ms: number;
  theme: string;
}
