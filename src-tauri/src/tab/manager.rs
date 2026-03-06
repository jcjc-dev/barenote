use std::collections::HashMap;
use std::path::PathBuf;
use std::fs;
use serde::{Serialize, Deserialize};
use super::model::Tab;

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionState {
    pub active_tabs: Vec<String>,
    pub selected_tab: Option<String>,
}

pub struct TabManager {
    pub tabs: HashMap<String, Tab>,
    pub tab_order: Vec<String>,
    pub selected_tab: Option<String>,
    pub app_dir: PathBuf,
}

impl TabManager {
    pub fn new(app_dir: PathBuf) -> Self {
        TabManager {
            tabs: HashMap::new(),
            tab_order: Vec::new(),
            selected_tab: None,
            app_dir,
        }
    }

    /// Load all tabs from disk (scan tabs/ directory for meta.json files)
    pub fn load_all_tabs(&mut self) -> std::io::Result<()> {
        let tabs_dir = self.app_dir.join("tabs");
        if !tabs_dir.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(&tabs_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                let meta_path = entry.path().join("meta.json");
                if meta_path.exists() {
                    let content = fs::read_to_string(&meta_path)?;
                    if let Ok(tab) = serde_json::from_str::<Tab>(&content) {
                        self.tabs.insert(tab.id.clone(), tab);
                    }
                }
            }
        }
        Ok(())
    }

    /// Create a new tab, write meta.json, create its directory
    pub fn create_tab(&mut self, title: &str) -> std::io::Result<Tab> {
        let tab = Tab::new(title);
        let tab_dir = self.app_dir.join("tabs").join(&tab.id);
        fs::create_dir_all(&tab_dir)?;

        let meta_path = tab_dir.join("meta.json");
        let json = serde_json::to_string_pretty(&tab)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        fs::write(&meta_path, json)?;

        self.tab_order.push(tab.id.clone());
        self.selected_tab = Some(tab.id.clone());
        self.tabs.insert(tab.id.clone(), tab.clone());
        self.save_session()?;

        Ok(tab)
    }

    /// Rename a tab
    pub fn rename_tab(&mut self, id: &str, new_title: &str) -> std::io::Result<()> {
        if let Some(tab) = self.tabs.get_mut(id) {
            tab.title = new_title.to_string();
            tab.touch();
            self.write_meta(id)?;
        }
        Ok(())
    }

    /// Reorder tabs
    #[allow(dead_code)]
    pub fn reorder_tabs(&mut self, new_order: Vec<String>) -> std::io::Result<()> {
        self.tab_order = new_order;
        self.save_session()?;
        Ok(())
    }

    /// Archive a tab (soft delete)
    pub fn archive_tab(&mut self, id: &str) -> std::io::Result<()> {
        if let Some(tab) = self.tabs.get_mut(id) {
            tab.archived = true;
            tab.touch();
            self.write_meta(id)?;
            self.tab_order.retain(|t| t != id);
            if self.selected_tab.as_deref() == Some(id) {
                self.selected_tab = self.tab_order.first().cloned();
            }
            self.save_session()?;
        }
        Ok(())
    }

    /// Restore a tab from archive
    pub fn restore_tab(&mut self, id: &str) -> std::io::Result<()> {
        if let Some(tab) = self.tabs.get_mut(id) {
            tab.archived = false;
            tab.touch();
            self.write_meta(id)?;
            if !self.tab_order.contains(&id.to_string()) {
                self.tab_order.push(id.to_string());
            }
            self.selected_tab = Some(id.to_string());
            self.save_session()?;
        }
        Ok(())
    }

    /// List active (non-archived) tabs in order
    pub fn list_active(&self) -> Vec<Tab> {
        self.tab_order.iter()
            .filter_map(|id| self.tabs.get(id))
            .filter(|t| !t.archived)
            .cloned()
            .collect()
    }

    /// List archived tabs
    pub fn list_archived(&self) -> Vec<Tab> {
        self.tabs.values()
            .filter(|t| t.archived)
            .cloned()
            .collect()
    }

    /// Permanently delete a tab (remove from memory and disk)
    pub fn delete_tab(&mut self, id: &str) -> std::io::Result<()> {
        self.tabs.remove(id);
        self.tab_order.retain(|t| t != id);
        if self.selected_tab.as_deref() == Some(id) {
            self.selected_tab = self.tab_order.first().cloned();
        }
        let tab_dir = self.app_dir.join("tabs").join(id);
        if tab_dir.exists() {
            fs::remove_dir_all(&tab_dir)?;
        }
        self.save_session()?;
        Ok(())
    }

    /// Check if a tab's content is empty
    pub fn is_tab_empty(&self, id: &str) -> bool {
        let tab_dir = self.app_dir.join("tabs").join(id);
        let content_path = tab_dir.join("content.txt");
        let wal_path = tab_dir.join("wal.log");
        // Empty if no content file, or content file is empty and no WAL
        let content_empty = if content_path.exists() {
            fs::read_to_string(&content_path)
                .map(|s| s.trim().is_empty())
                .unwrap_or(true)
        } else {
            true
        };
        let wal_empty = if wal_path.exists() {
            fs::read_to_string(&wal_path)
                .map(|s| s.trim().is_empty())
                .unwrap_or(true)
        } else {
            true
        };
        content_empty && wal_empty
    }

    /// Save session state (tab order + selected tab) using atomic write
    pub fn save_session(&self) -> std::io::Result<()> {
        let session = SessionState {
            active_tabs: self.tab_order.clone(),
            selected_tab: self.selected_tab.clone(),
        };
        let json = serde_json::to_string_pretty(&session)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let session_path = self.app_dir.join("session.json");
        let tmp_path = self.app_dir.join("session.json.tmp");

        let mut file = fs::File::create(&tmp_path)?;
        std::io::Write::write_all(&mut file, json.as_bytes())?;
        file.sync_all()?;
        fs::rename(&tmp_path, &session_path)?;

        Ok(())
    }

    /// Load session state
    pub fn load_session(&mut self) -> std::io::Result<()> {
        let path = self.app_dir.join("session.json");
        if path.exists() {
            let content = fs::read_to_string(&path)?;
            if let Ok(session) = serde_json::from_str::<SessionState>(&content) {
                self.tab_order = session.active_tabs;
                self.selected_tab = session.selected_tab;
            }
        }
        Ok(())
    }

    /// Set the file_path on a tab and persist to meta.json
    pub fn set_file_path(&mut self, id: &str, path: &str) -> std::io::Result<()> {
        if let Some(tab) = self.tabs.get_mut(id) {
            tab.file_path = Some(path.to_string());
            tab.touch();
            self.write_meta(id)?;
        }
        Ok(())
    }

    /// Write meta.json for a specific tab using atomic write
    fn write_meta(&self, id: &str) -> std::io::Result<()> {
        if let Some(tab) = self.tabs.get(id) {
            let tab_dir = self.app_dir.join("tabs").join(id);
            let meta_path = tab_dir.join("meta.json");
            let tmp_path = tab_dir.join("meta.json.tmp");
            let json = serde_json::to_string_pretty(tab)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let mut file = fs::File::create(&tmp_path)?;
            std::io::Write::write_all(&mut file, json.as_bytes())?;
            file.sync_all()?;
            fs::rename(&tmp_path, &meta_path)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_create_tab() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = TabManager::new(tmp.path().to_path_buf());
        let tab = mgr.create_tab("My Tab").unwrap();
        assert_eq!(tab.title, "My Tab");
        assert!(!tab.archived);

        let active = mgr.list_active();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, tab.id);
    }

    #[test]
    fn test_rename_tab() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = TabManager::new(tmp.path().to_path_buf());
        let tab = mgr.create_tab("Original").unwrap();
        mgr.rename_tab(&tab.id, "Renamed").unwrap();

        let active = mgr.list_active();
        assert_eq!(active[0].title, "Renamed");
    }

    #[test]
    fn test_archive_and_restore() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = TabManager::new(tmp.path().to_path_buf());
        let tab = mgr.create_tab("Archivable").unwrap();

        mgr.archive_tab(&tab.id).unwrap();
        assert_eq!(mgr.list_active().len(), 0);
        assert_eq!(mgr.list_archived().len(), 1);

        mgr.restore_tab(&tab.id).unwrap();
        assert_eq!(mgr.list_active().len(), 1);
        assert_eq!(mgr.list_archived().len(), 0);
    }

    #[test]
    fn test_reorder_tabs() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = TabManager::new(tmp.path().to_path_buf());
        let t1 = mgr.create_tab("First").unwrap();
        let t2 = mgr.create_tab("Second").unwrap();
        let t3 = mgr.create_tab("Third").unwrap();

        mgr.reorder_tabs(vec![t3.id.clone(), t1.id.clone(), t2.id.clone()]).unwrap();
        let active = mgr.list_active();
        assert_eq!(active[0].id, t3.id);
        assert_eq!(active[1].id, t1.id);
        assert_eq!(active[2].id, t2.id);
    }

    #[test]
    fn test_load_tabs_from_disk() {
        let tmp = TempDir::new().unwrap();
        let mut mgr = TabManager::new(tmp.path().to_path_buf());
        let t1 = mgr.create_tab("Persist1").unwrap();
        let t2 = mgr.create_tab("Persist2").unwrap();

        // Create a fresh manager and load from disk
        let mut mgr2 = TabManager::new(tmp.path().to_path_buf());
        mgr2.load_all_tabs().unwrap();
        mgr2.load_session().unwrap();

        assert_eq!(mgr2.tabs.len(), 2);
        assert!(mgr2.tabs.contains_key(&t1.id));
        assert!(mgr2.tabs.contains_key(&t2.id));
        assert_eq!(mgr2.tab_order.len(), 2);
    }
}
