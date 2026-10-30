#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod http;
mod live_csv;
mod plugins;
mod providers;
mod scraping;
mod uploads;

use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::{Emitter, Manager, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
};

type Reply = Result<Value, String>;
struct Bridge {
    stdin: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Reply>>>,
    sequence: AtomicU64,
    _child: Mutex<Child>,
}
#[derive(Default)]
struct Server(Mutex<Option<Arc<Bridge>>>);

impl Bridge {
    async fn write(&self, message: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(format!("{message}\n").as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())
    }
    async fn rpc(&self, method: &str, params: Value) -> Reply {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        if let Err(error) = self
            .write(json!({"id":id,"method":method,"params":params}))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(error);
        }
        match tokio::time::timeout(Duration::from_secs(120), rx).await {
            Ok(Ok(result)) => result,
            _ => {
                self.pending.lock().await.remove(&id);
                Err(format!("Codex request timed out: {method}"))
            }
        }
    }
}

fn codex_binary() -> std::path::PathBuf {
    if let Some(path) = std::env::var_os("MCP_WORKFLOW_CODEX") {
        return path.into();
    }
    // The desktop distribution may not be on Explorer's PATH.
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        let root = std::path::PathBuf::from(local).join("OpenAI/Codex/bin");
        if let Ok(entries) = std::fs::read_dir(root) {
            let mut paths: Vec<_> = entries
                .flatten()
                .map(|e| e.path().join("codex.exe"))
                .filter(|p| p.is_file())
                .collect();
            paths.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
            if let Some(path) = paths.pop() {
                return path;
            }
        }
    }
    "codex".into()
}

#[tauri::command]
async fn connect(app: tauri::AppHandle, state: State<'_, Server>) -> Reply {
    let mut slot = state.0.lock().await;
    if let Some(bridge) = slot.as_ref() {
        return bridge.rpc("account/read", json!({})).await;
    }
    let mut command = Command::new(codex_binary());
    command
        .args(["app-server", "--listen", "stdio://"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|e| format!("Cannot start Codex: {e}. Install Codex or set MCP_WORKFLOW_CODEX to the executable path."))?;
    let stdin = child.stdin.take().ok_or("Codex stdin unavailable")?;
    let stdout = child.stdout.take().ok_or("Codex stdout unavailable")?;
    let bridge = Arc::new(Bridge {
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        sequence: AtomicU64::new(1),
        _child: Mutex::new(child),
    });
    let reader_bridge = Arc::downgrade(&bridge);
    let reader_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let Some(bridge) = reader_bridge.upgrade() else {
                break;
            };
            if message.get("method").is_none() {
                if let Some(id) = message["id"].as_u64() {
                    if let Some(tx) = bridge.pending.lock().await.remove(&id) {
                        let result = if let Some(error) = message.get("error") {
                            Err(error.to_string())
                        } else {
                            Ok(message["result"].clone())
                        };
                        let _ = tx.send(result);
                    }
                }
            } else {
                let _ = reader_app.emit("codex-event", message);
            }
        }
        if let Some(bridge) = reader_bridge.upgrade() {
            for (_, tx) in bridge.pending.lock().await.drain() {
                let _ = tx.send(Err("Codex disconnected".into()));
            }
        }
        // Clear the dead process so Connect can start another one.
        let state = reader_app.state::<Server>();
        let mut slot = state.0.lock().await;
        if slot
            .as_ref()
            .is_some_and(|current| reader_bridge.ptr_eq(&Arc::downgrade(current)))
        {
            *slot = None;
        }
        let _ = reader_app.emit("codex-disconnected", ());
    });
    bridge.rpc("initialize", json!({"clientInfo":{"name":"mcp_workflow","title":"MCP Workflow","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}})).await?;
    bridge.write(json!({"method":"initialized"})).await?;
    let account = bridge.rpc("account/read", json!({})).await?;
    *slot = Some(bridge);
    Ok(account)
}

#[tauri::command]
async fn rpc(state: State<'_, Server>, method: String, params: Value) -> Reply {
    const ALLOWED: &[&str] = &[
        "account/read",
        "config/read",
        "account/login/start",
        "account/login/cancel",
        "skills/list",
        "mcpServerStatus/list",
        "plugin/list",
        "app/list",
        "model/list",
        "thread/start",
        "turn/start",
        "turn/interrupt",
    ];
    if !ALLOWED.contains(&method.as_str()) {
        return Err("Unsupported method".into());
    }
    let bridge = state
        .0
        .lock()
        .await
        .clone()
        .ok_or("Connect to Codex first")?;
    bridge.rpc(&method, params).await
}

#[tauri::command]
async fn respond(
    state: State<'_, Server>,
    id: Value,
    result: Option<Value>,
    error: Option<Value>,
) -> Result<(), String> {
    let bridge = state.0.lock().await.clone().ok_or("Codex disconnected")?;
    let message = if let Some(error) = error {
        json!({"id":id,"error":error})
    } else {
        json!({"id":id,"result":result})
    };
    bridge.write(message).await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Server::default())
        .manage(live_csv::LiveCsv::default())
        .manage(providers::ClaudeState::default())
        .invoke_handler(tauri::generate_handler![
            providers::provider_check,
            providers::claude_turn,
            providers::claude_control,
            live_csv::write_live_csv,
            live_csv::release_live_csv,
            connect,
            rpc,
            respond,
            plugins::plugin_catalog,
            plugins::install_plugin,
            uploads::choose_uploads,
            scraping::fetch_page,
            scraping::extract_rows,
            scraping::export_rows,
            http::http_request
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run MCP Workflow");
}
