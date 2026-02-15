use std::collections::HashMap;
use std::path::PathBuf;
use std::fs;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorConfig {
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    #[serde(default = "default_tab_size")]
    pub tab_size: u32,
    #[serde(default = "default_true")]
    pub word_wrap: bool,
    #[serde(default = "default_true")]
    pub line_numbers: bool,
}

fn default_font_size() -> u32 { 14 }
fn default_tab_size() -> u32 { 2 }
fn default_true() -> bool { true }

impl Default for EditorConfig {
    fn default() -> Self {
        EditorConfig {
            font_size: 14,
            tab_size: 2,
            word_wrap: true,
            line_numbers: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_keybindings")]
    pub keybindings: HashMap<String, String>,
    #[serde(default)]
    pub editor: EditorConfig,
    #[serde(default = "default_snapshot_edits")]
    pub snapshot_interval_edits: u32,
    #[serde(default = "default_snapshot_ms")]
    pub snapshot_interval_ms: u64,
    #[serde(default = "default_theme")]
    pub theme: String,
}

fn default_snapshot_edits() -> u32 { 50 }
fn default_snapshot_ms() -> u64 { 5000 }
fn default_theme() -> String { "system".to_string() }

fn default_keybindings() -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert("newTab".to_string(), "CmdOrCtrl+N".to_string());
    map.insert("closeTab".to_string(), "CmdOrCtrl+W".to_string());
    map.insert("find".to_string(), "CmdOrCtrl+F".to_string());
    map.insert("nextTab".to_string(), "Ctrl+Tab".to_string());
    map.insert("prevTab".to_string(), "Ctrl+Shift+Tab".to_string());
    map.insert("togglePreview".to_string(), "CmdOrCtrl+P".to_string());
    map.insert("settings".to_string(), "CmdOrCtrl+,".to_string());
    map.insert("saveAs".to_string(), "CmdOrCtrl+Shift+S".to_string());
    map.insert("toggleArchive".to_string(), "CmdOrCtrl+Shift+A".to_string());
    map.insert("renameTab".to_string(), "CmdOrCtrl+R".to_string());
    map.insert("moveTabLeft".to_string(), "CmdOrCtrl+Shift+[".to_string());
    map.insert("moveTabRight".to_string(), "CmdOrCtrl+Shift+]".to_string());
    map
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            keybindings: default_keybindings(),
            editor: EditorConfig::default(),
            snapshot_interval_edits: 50,
            snapshot_interval_ms: 5000,
            theme: "system".to_string(),
        }
    }
}

impl AppConfig {
    /// Load config from disk, merging with defaults for any missing fields
    pub fn load(app_dir: &PathBuf) -> Self {
        let path = app_dir.join("config.json");
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<AppConfig>(&content) {
                    return config;
                }
            }
        }
        AppConfig::default()
    }

    /// Save config to disk
    pub fn save(&self, app_dir: &PathBuf) -> std::io::Result<()> {
        let path = app_dir.join("config.json");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        fs::write(&path, json)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_default_config() {
        let config = AppConfig::default();
        assert_eq!(config.editor.font_size, 14);
        assert_eq!(config.editor.tab_size, 2);
        assert!(config.editor.word_wrap);
        assert!(config.editor.line_numbers);
        assert_eq!(config.snapshot_interval_edits, 50);
        assert_eq!(config.snapshot_interval_ms, 5000);
        assert!(config.keybindings.contains_key("newTab"));
    }

    #[test]
    fn test_save_and_load() {
        let tmp = TempDir::new().unwrap();
        let mut config = AppConfig::default();
        config.editor.font_size = 18;
        config.save(&tmp.path().to_path_buf()).unwrap();

        let loaded = AppConfig::load(&tmp.path().to_path_buf());
        assert_eq!(loaded.editor.font_size, 18);
        assert_eq!(loaded.editor.tab_size, 2);
    }

    #[test]
    fn test_load_missing_file() {
        let tmp = TempDir::new().unwrap();
        let config = AppConfig::load(&tmp.path().to_path_buf());
        assert_eq!(config.editor.font_size, 14);
        assert_eq!(config.snapshot_interval_edits, 50);
    }

    #[test]
    fn test_partial_config() {
        let tmp = TempDir::new().unwrap();
        let partial = r#"{ "editor": { "font_size": 20 } }"#;
        fs::write(tmp.path().join("config.json"), partial).unwrap();

        let config = AppConfig::load(&tmp.path().to_path_buf());
        assert_eq!(config.editor.font_size, 20);
        assert_eq!(config.editor.tab_size, 2); // default filled in
        assert!(config.editor.word_wrap); // default filled in
        assert_eq!(config.snapshot_interval_edits, 50); // default filled in
    }
}
