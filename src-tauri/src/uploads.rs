use serde_json::{json, Value};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri_plugin_dialog::DialogExt;

fn copy_selected(cwd: &str, paths: Vec<std::path::PathBuf>) -> Result<Value, String> {
    let workspace = Path::new(cwd)
        .canonicalize()
        .map_err(|_| "Choose an existing workspace folder first")?;
    if !workspace.is_dir() {
        return Err("Workspace must be a folder".into());
    }
    if paths.len() > 100 {
        return Err("Select at most 100 files at a time".into());
    }
    let root = workspace.join(".mcp-workflow");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    if !root.starts_with(&workspace) {
        return Err("Upload folder must remain inside the workspace".into());
    }
    let target = root.join(format!(
        "uploads-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    // Validate the whole selection before creating copies.
    for path in &paths {
        let meta = path.metadata().map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.len() > 50 * 1024 * 1024 {
            return Err("Uploads must be files no larger than 50 MB each".into());
        }
    }
    std::fs::create_dir(&target).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for (index, path) in paths.iter().enumerate() {
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("Unsupported file name")?;
        let copy = target.join(format!("{index}-{name}"));
        std::fs::copy(path, &copy).map_err(|e| e.to_string())?;
        result.push(json!({"name":name,"path":copy.to_string_lossy(),"size":copy.metadata().map_err(|e|e.to_string())?.len()}));
    }
    Ok(json!(result))
}

#[tauri::command]
pub async fn choose_uploads(app: tauri::AppHandle, cwd: String) -> Result<Value, String> {
    if !Path::new(&cwd).is_absolute() || !Path::new(&cwd).is_dir() {
        return Err("Set an existing absolute workspace folder before uploading files".into());
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Add workflow files (single or multiple)")
        .pick_files(move |files| {
            let _ = tx.send(files);
        });
    let Some(files) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(json!([]));
    };
    let paths = files
        .into_iter()
        .map(|p| p.into_path().map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    tauri::async_runtime::spawn_blocking(move || copy_selected(&cwd, paths))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_single_and_multiple_files_without_overwriting_same_names() {
        let folder = std::env::temp_dir().join(format!(
            "workflow-upload-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&folder).unwrap();
        let source = folder.join("source.txt");
        std::fs::write(&source, "sample").unwrap();
        let result = copy_selected(
            folder.to_str().unwrap(),
            vec![source.clone(), source.clone()],
        )
        .unwrap();
        assert_ne!(result[0]["path"], result[1]["path"]);
        assert_eq!(
            std::fs::read_to_string(result[0]["path"].as_str().unwrap()).unwrap(),
            "sample"
        );
        assert_eq!(
            copy_selected(folder.to_str().unwrap(), vec![source])
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        std::fs::remove_dir_all(folder).unwrap();
    }
}
