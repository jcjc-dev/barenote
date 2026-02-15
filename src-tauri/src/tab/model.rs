use serde::{Serialize, Deserialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tab {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived: bool,
    #[serde(default)]
    pub file_path: Option<String>,
}

impl Tab {
    pub fn new(title: &str) -> Self {
        let now = Utc::now().to_rfc3339();
        Tab {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            created_at: now.clone(),
            updated_at: now,
            archived: false,
            file_path: None,
        }
    }

    #[allow(dead_code)]
    pub fn is_saved(&self) -> bool {
        self.file_path.is_some()
    }

    pub fn touch(&mut self) {
        self.updated_at = Utc::now().to_rfc3339();
    }
}
