use serde_json::{json, Value};
use std::{path::PathBuf, process::Stdio};
use tauri::{Emitter, Manager, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, Command},
    sync::Mutex,
};
#[derive(Default)]
pub struct ClaudeState {
    input: Mutex<Option<ChildStdin>>,
    active: std::sync::atomic::AtomicBool,
}
fn executable() -> PathBuf {
    if let Some(path) = std::env::var_os("MCP_WORKFLOW_CLAUDE") {
        return path.into();
    }
    if let Some(home) = std::env::var_os("USERPROFILE") {
        let path = PathBuf::from(home).join(".local/bin/claude.exe");
        if path.is_file() {
            return path;
        }
    }
    PathBuf::from("claude")
}
fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
}
#[tauri::command]
pub async fn provider_check(provider: Value) -> Result<Value, String> {
    let kind = provider["kind"].as_str().ok_or("Choose a provider")?;
    if kind == "openai-api" || kind == "anthropic-api" {
        let default = if kind == "openai-api" {
            "OPENAI_API_KEY"
        } else {
            "ANTHROPIC_API_KEY"
        };
        let name = provider["keyEnv"]
            .as_str()
            .filter(|s| !s.is_empty())
            .unwrap_or(default);
        if std::env::var(name).unwrap_or_default().is_empty() {
            return Err(format!(
                "Missing environment variable: {name}. Set it before launching the app."
            ));
        }
    }
    if ["claude", "anthropic-api", "bedrock"].contains(&kind) {
        let node = command("node")
            .arg("--version")
            .output()
            .await
            .map_err(|_| "Install Node.js 20 or later for Claude providers")?;
        if !node.status.success() {
            return Err("Node.js is unavailable".into());
        }
        let cli = command(executable())
            .arg("--version")
            .output()
            .await
            .map_err(|_| {
                "Install Claude Code and sign in using its own CLI, then restart this app"
            })?;
        if !cli.status.success() {
            return Err("Claude Code runtime check failed".into());
        }
    }
    Ok(
        json!({"ready":true,"message":"Runtime ready. Authentication and model access are checked when the step runs."}),
    )
}
#[tauri::command]
pub async fn claude_turn(
    app: tauri::AppHandle,
    state: State<'_, ClaudeState>,
    mut request: Value,
) -> Result<Value, String> {
    use std::sync::atomic::Ordering;
    if state.active.swap(true, Ordering::SeqCst) {
        return Err("A Claude turn is already running".into());
    }
    let result=async {
  provider_check(request["provider"].clone()).await?;
  let resource=app.path().resource_dir().map_err(|e|e.to_string())?.join("claude-runner.mjs");
  let source=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/claude-runner.mjs");
  let helper=if resource.is_file(){resource}else{source};
  if !helper.is_file(){return Err("Claude helper is missing; run npm run build:helper or reinstall the app".into());}
  let cwd=request["cwd"].as_str().ok_or("Missing workspace")?;
  if !std::path::Path::new(cwd).is_absolute() || !std::path::Path::new(cwd).is_dir(){return Err("Choose an existing absolute workspace folder".into());}
  request["executable"]=json!(executable());
  let mut child=command("node").arg(helper).arg("--stdio").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true).spawn().map_err(|e|e.to_string())?;
  let mut stdin=child.stdin.take().ok_or("Missing provider input")?;
  stdin.write_all(format!("{request}\n").as_bytes()).await.map_err(|e|e.to_string())?;
  *state.input.lock().await=Some(stdin);
  let mut lines=BufReader::new(child.stdout.take().ok_or("Missing provider output")?).lines();
  while let Some(line)=lines.next_line().await.map_err(|e|e.to_string())?{
   let event:Value=serde_json::from_str(&line).map_err(|_|"Invalid Claude helper response")?;
   match event["kind"].as_str(){
    Some("result")=>return Ok(event),
    Some("error")=>return Err(format!("{}{}",if event["unsafe"].as_bool().unwrap_or(false){"UNFINISHED_AGENT_WORK: "}else{""},event["message"].as_str().unwrap_or("Claude failed"))),
    _=>{let _=app.emit("provider-event",event);}
   }
  }
  Err("Claude process ended without a result. Check its CLI sign-in and provider configuration.".into())
 }.await;
    *state.input.lock().await = None;
    state.active.store(false, Ordering::SeqCst);
    result
}
#[tauri::command]
pub async fn claude_control(state: State<'_, ClaudeState>, message: Value) -> Result<(), String> {
    let mut slot = state.input.lock().await;
    let input = slot.as_mut().ok_or("No active Claude turn")?;
    if ![Some("answer"), Some("stop")].contains(&message["type"].as_str()) {
        return Err("Unsupported control message".into());
    }
    input
        .write_all(format!("{message}\n").as_bytes())
        .await
        .map_err(|e| e.to_string())
}
