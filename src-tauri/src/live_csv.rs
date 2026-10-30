use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashMap},
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::State;
struct LiveFile {
    path: PathBuf,
    columns: Vec<String>,
    rows: Vec<Value>,
    created: Instant,
}
#[derive(Default)]
pub struct LiveCsv(Mutex<HashMap<String, LiveFile>>);
pub(crate) fn write(
    state: &LiveCsv,
    cwd: &str,
    name: &str,
    session: Option<String>,
    rows: Value,
) -> Result<Value, String> {
    let rows = rows.as_array().ok_or("Live CSV needs object rows")?;
    if rows.is_empty()
        || rows.len() > 100000
        || rows.iter().any(|r| !r.is_object())
        || serde_json::to_string(rows)
            .map_err(|e| e.to_string())?
            .len()
            > 20 * 1024 * 1024
    {
        return Err("Live CSV needs 1–100000 object rows, within 20 MB".into());
    }
    let mut files = state.0.lock().map_err(|e| e.to_string())?;
    let session = if let Some(id) = session {
        if !files.contains_key(&id) {
            return Err("This live CSV session is no longer available".into());
        }
        id
    } else {
        files.retain(|_, f| f.created.elapsed().as_secs() < 7200);
        if files.len() >= 256 {
            return Err("Too many live CSV sessions; finish a run first".into());
        }
        let folder = Path::new(cwd)
            .canonicalize()
            .map_err(|_| "Choose an existing workspace")?;
        if !folder.is_dir()
            || name.is_empty()
            || name.len() > 80
            || !name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err("Use a simple live CSV name (letters, digits, - or _)".into());
        }
        let id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
            .to_string();
        let path = folder.join(format!("{name}-{id}.csv"));
        let columns = rows
            .iter()
            .flat_map(|r| r.as_object().unwrap().keys().cloned())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        let header = columns
            .iter()
            .map(|k| crate::scraping::cell(&json!(k)))
            .collect::<Vec<_>>()
            .join(",")
            + "\r\n";
        if let Err(e) = file.write_all(header.as_bytes()).and_then(|_| file.flush()) {
            drop(file);
            let _ = std::fs::remove_file(&path);
            return Err(e.to_string());
        }
        files.insert(
            id.clone(),
            LiveFile {
                path,
                columns,
                rows: vec![],
                created: Instant::now(),
            },
        );
        id
    };
    let record = files
        .get_mut(&session)
        .ok_or("Live CSV session is missing")?;
    if !rows.starts_with(&record.rows) {
        return Err("Live CSV data must preserve previously written rows".into());
    }
    if rows.iter().any(|r| {
        r.as_object()
            .unwrap()
            .keys()
            .any(|k| !record.columns.contains(k))
    }) {
        return Err("Live CSV columns cannot change after writing begins".into());
    }
    let mut text = String::new();
    for row in &rows[record.rows.len()..] {
        text.push_str(
            &record
                .columns
                .iter()
                .map(|k| crate::scraping::cell(&row[k]))
                .collect::<Vec<_>>()
                .join(","),
        );
        text.push_str("\r\n");
    }
    let old_size = record.path.metadata().map_err(|e| e.to_string())?.len();
    if old_size + text.len() as u64 > 20 * 1024 * 1024 {
        return Err("Live CSV exceeds 20 MB".into());
    }
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&record.path)
        .map_err(|e| e.to_string())?;
    if let Err(e) = file.write_all(text.as_bytes()).and_then(|_| file.flush()) {
        let _ = file.set_len(old_size);
        return Err(format!("Could not update live CSV: {e}"));
    }
    record.rows = rows.clone();
    let contents = std::fs::read_to_string(&record.path).map_err(|e| e.to_string())?;
    Ok(
        json!({"sessionId":session,"path":record.path.to_string_lossy(),"contents":contents,"rows":rows.len(),"format":"csv"}),
    )
}
#[tauri::command]
pub fn write_live_csv(
    state: State<'_, LiveCsv>,
    cwd: String,
    name: String,
    session_id: Option<String>,
    rows: Value,
) -> Result<Value, String> {
    write(&state, &cwd, &name, session_id, rows)
}
#[tauri::command]
pub fn release_live_csv(state: State<'_, LiveCsv>, session_id: String) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&session_id);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn appends_real_rows_and_reads_back_the_actual_csv() {
        let dir = std::env::temp_dir().join(format!(
            "live-csv-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&dir).unwrap();
        let state = LiveCsv::default();
        let first = write(
            &state,
            dir.to_str().unwrap(),
            "products",
            None,
            json!([{"id":"a","title":"One"},{"id":"b","title":"Two"},{"id":"c","title":"Three"}]),
        )
        .unwrap();
        let id = first["sessionId"].as_str().unwrap().to_owned();
        let next=write(&state,dir.to_str().unwrap(),"products",Some(id.clone()),json!([{"id":"a","title":"One"},{"id":"b","title":"Two"},{"id":"c","title":"Three"},{"id":"d","title":"Four"},{"id":"e","title":"Five"}])).unwrap();
        assert_eq!(first["path"], next["path"]);
        assert_eq!(next["rows"], 5);
        assert!(next["contents"]
            .as_str()
            .unwrap()
            .starts_with(first["contents"].as_str().unwrap()));
        assert_eq!(
            std::fs::read_to_string(next["path"].as_str().unwrap()).unwrap(),
            next["contents"].as_str().unwrap()
        );
        assert!(write(
            &state,
            dir.to_str().unwrap(),
            "products",
            Some(id),
            json!([{"id":"changed"}])
        )
        .is_err());
        assert!(write(
            &state,
            dir.to_str().unwrap(),
            "../outside",
            None,
            json!([{"id":"x"}])
        )
        .is_err());
        std::fs::remove_file(next["path"].as_str().unwrap()).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
