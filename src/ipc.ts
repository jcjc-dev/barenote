import { invoke } from "@tauri-apps/api/core";
import type { Tab, AppConfig } from "./types";

export async function createTab(title: string): Promise<Tab> {
  return invoke<Tab>("create_tab", { title });
}

export async function renameTab(id: string, title: string): Promise<void> {
  return invoke("rename_tab", { id, title });
}

export async function closeTab(id: string): Promise<void> {
  return invoke("close_tab", { id });
}

export async function archiveTab(id: string): Promise<void> {
  return invoke("archive_tab", { id });
}

export async function restoreTab(id: string): Promise<void> {
  return invoke("restore_tab", { id });
}

export async function listTabs(): Promise<Tab[]> {
  return invoke<Tab[]>("list_tabs");
}

export async function listArchivedTabs(): Promise<Tab[]> {
  return invoke<Tab[]>("list_archived_tabs");
}

export async function getTabContent(id: string): Promise<string> {
  return invoke<string>("get_tab_content", { id });
}

export async function updateTabContent(id: string, content: string): Promise<void> {
  return invoke("update_tab_content", { id, content });
}

export async function appendDelta(id: string, position: number, deleteCount: number, inserted: string): Promise<void> {
  return invoke("append_delta", { id, position, delete_count: deleteCount, inserted });
}

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("get_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_config", { config });
}

export async function setWindowTheme(theme: string): Promise<void> {
  return invoke("set_window_theme", { theme });
}

export async function saveTabToPath(id: string, path: string): Promise<void> {
  return invoke("save_tab_to_path", { id, path });
}

export async function reorderTabs(order: string[]): Promise<void> {
  return invoke("reorder_tabs", { order });
}

export async function deleteTab(id: string): Promise<void> {
  return invoke("delete_tab", { id });
}

export async function appendDeltaBatch(
  id: string,
  deltas: { position: number; deleteCount: number; inserted: string }[]
): Promise<void> {
  return invoke("append_delta_batch", {
    id,
    deltas: deltas.map((d) => ({
      position: d.position,
      delete_count: d.deleteCount,
      inserted: d.inserted,
    })),
  });
}

export async function openFile(path: string): Promise<string> {
  return invoke<string>("open_file", { path });
}
