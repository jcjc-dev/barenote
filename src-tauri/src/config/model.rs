use std::collections::HashMap;
use std::path::Path;
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
    map.insert("nextTab".to_string(), "CmdOrCtrl+Shift+]".to_string());
    map.insert("prevTab".to_string(), "CmdOrCtrl+Shift+[".to_string());
    map.insert("togglePreview".to_string(), "CmdOrCtrl+P".to_string());
    map.insert("settings".to_string(), "CmdOrCtrl+,".to_string());
    map.insert("saveAs".to_string(), "CmdOrCtrl+Shift+S".to_string());
    map.insert("toggleArchive".to_string(), "CmdOrCtrl+Shift+A".to_string());
    map.insert("renameTab".to_string(), "CmdOrCtrl+R".to_string());
    map.insert("moveTabLeft".to_string(), "Ctrl+Shift+Tab".to_string());
    map.insert("moveTabRight".to_string(), "Ctrl+Tab".to_string());
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

const VALID_THEMES: &[&str] = &["system", "light", "dark"];

impl AppConfig {
    /// Clamp and correct all config values to valid ranges.
    pub fn validate(&mut self) {
        self.editor.font_size = self.editor.font_size.clamp(8, 72);
        self.editor.tab_size = self.editor.tab_size.clamp(1, 8);
        self.snapshot_interval_edits = self.snapshot_interval_edits.clamp(1, 500);
        self.snapshot_interval_ms = self.snapshot_interval_ms.clamp(1000, 60000);

        if !VALID_THEMES.contains(&self.theme.as_str()) {
            self.theme = "system".to_string();
        }
    }

    /// Load config from disk, merging with defaults for any missing fields
    pub fn load(app_dir: &Path) -> Self {
        let path = app_dir.join("config.json");
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(mut config) = serde_json::from_str::<AppConfig>(&content) {
                    config.validate();
                    return config;
                }
            }
        }
        AppConfig::default()
    }

    /// Save config to disk
    pub fn save(&self, app_dir: &Path) -> std::io::Result<()> {
        let mut config = self.clone();
        config.validate();
        let path = app_dir.join("config.json");
        let json = serde_json::to_string_pretty(&config)
            .map_err(std::io::Error::other)?;
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

    #[test]
    fn test_validate_clamps_font_size() {
        let mut config = AppConfig::default();
        config.editor.font_size = 0;
        config.validate();
        assert_eq!(config.editor.font_size, 8);

        config.editor.font_size = 200;
        config.validate();
        assert_eq!(config.editor.font_size, 72);
    }

    #[test]
    fn test_validate_clamps_tab_size() {
        let mut config = AppConfig::default();
        config.editor.tab_size = 0;
        config.validate();
        assert_eq!(config.editor.tab_size, 1);

        config.editor.tab_size = 100;
        config.validate();
        assert_eq!(config.editor.tab_size, 8);
    }

    #[test]
    fn test_validate_clamps_snapshot_intervals() {
        let mut config = AppConfig::default();
        config.snapshot_interval_edits = 0;
        config.snapshot_interval_ms = 100;
        config.validate();
        assert_eq!(config.snapshot_interval_edits, 1);
        assert_eq!(config.snapshot_interval_ms, 1000);

        config.snapshot_interval_edits = 9999;
        config.snapshot_interval_ms = 999999;
        config.validate();
        assert_eq!(config.snapshot_interval_edits, 500);
        assert_eq!(config.snapshot_interval_ms, 60000);
    }

    #[test]
    fn test_validate_resets_invalid_theme() {
        let mut config = AppConfig::default();
        config.theme = "neon".to_string();
        config.validate();
        assert_eq!(config.theme, "system");

        config.theme = "dark".to_string();
        config.validate();
        assert_eq!(config.theme, "dark");
    }

    #[test]
    fn test_load_validates_out_of_range_values() {
        let tmp = TempDir::new().unwrap();
        let bad = r#"{ "editor": { "font_size": 999, "tab_size": 0 }, "theme": "invalid", "snapshot_interval_edits": 0, "snapshot_interval_ms": 50 }"#;
        fs::write(tmp.path().join("config.json"), bad).unwrap();

        let config = AppConfig::load(&tmp.path().to_path_buf());
        assert_eq!(config.editor.font_size, 72);
        assert_eq!(config.editor.tab_size, 1);
        assert_eq!(config.theme, "system");
        assert_eq!(config.snapshot_interval_edits, 1);
        assert_eq!(config.snapshot_interval_ms, 1000);
    }

    #[test]
    fn test_save_validates_before_writing() {
        let tmp = TempDir::new().unwrap();
        let mut config = AppConfig::default();
        config.editor.font_size = 999;
        config.theme = "bogus".to_string();
        config.save(&tmp.path().to_path_buf()).unwrap();

        let loaded = AppConfig::load(&tmp.path().to_path_buf());
        assert_eq!(loaded.editor.font_size, 72);
        assert_eq!(loaded.theme, "system");
    }
}
