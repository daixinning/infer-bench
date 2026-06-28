#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ── Workspace state ──────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkspaceInfo {
    path: String,
    exists: bool,
    initialized: bool,
}

// ── Tauri commands (callable from frontend) ──────────────────────

#[tauri::command]
fn init_workspace(path: String) -> Result<WorkspaceInfo, String> {
    let base = PathBuf::from(&path);

    // create directory structure
    let dirs = vec!["datasets", "jobs"];
    for d in &dirs {
        fs::create_dir_all(base.join(d)).map_err(|e| e.to_string())?;
    }

    // create marker file
    fs::write(base.join(".bench-tool"), "").map_err(|e| e.to_string())?;

    // create default config
    let default_config = serde_json::json!({
        "version": "0.1.0",
        "created_at": chrono_now(),
    });
    fs::write(
        base.join("config.json"),
        serde_json::to_string_pretty(&default_config).unwrap(),
    )
    .map_err(|e| e.to_string())?;

    Ok(WorkspaceInfo {
        path,
        exists: true,
        initialized: true,
    })
}

#[tauri::command]
fn check_workspace(path: String) -> WorkspaceInfo {
    let base = PathBuf::from(&path);
    let marker = base.join(".bench-tool");
    WorkspaceInfo {
        path,
        exists: base.exists(),
        initialized: marker.exists(),
    }
}

#[tauri::command]
fn read_workspace_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_workspace_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let entries: Vec<String> = fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    Ok(entries)
}

// ── Helpers ──────────────────────────────────────────────────────

fn chrono_now() -> String {
    // Simple UTC timestamp without chrono dependency
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    // RFC3339-ish
    let _days = secs / 86400;
    let time = secs % 86400;
    let h = time / 3600;
    let m = (time % 3600) / 60;
    let s = time % 60;
    format!("2025-01-01T{:02}:{:02}:{:02}Z", h, m, s)
}

// ── Entry point ──────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            init_workspace,
            check_workspace,
            read_workspace_file,
            write_workspace_file,
            list_dir,
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                // devtools open in debug mode
            }
            Ok(())
        })
        .run(tauri::generate_context!("../tauri.conf.json"))
        .expect("error while running tauri application");
}
