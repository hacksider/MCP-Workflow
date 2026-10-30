//! Local benchmark adapter. Calls the production parser and file writers, without a UI.
#[path = "../http.rs"] mod http;
#[path = "../scraping.rs"] mod scraping;
#[path = "../live_csv.rs"] mod live_csv;
use serde_json::{json, Value};
use std::io::{BufRead, Write};

fn string(v: &Value, key: &str) -> Result<String, String> {
    v[key].as_str().map(str::to_owned).ok_or_else(|| format!("Missing {key}"))
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 { return Err("Usage: workflow-benchmark-backend RUN_FOLDER FROZEN_FIXTURE_JSON".into()); }
    let root = std::path::Path::new(&args[1]).canonicalize()?;
    if !root.is_dir() { return Err("Run folder must exist".into()); }
    let fixture: Value = serde_json::from_slice(&std::fs::read(&args[2])?)?;
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build()?;
    let state = live_csv::LiveCsv::default();
    let stdout = std::io::stdout();
    let mut output = stdout.lock();
    writeln!(output, "{}", json!({"ready":true}))?; output.flush()?;
    for line in std::io::stdin().lock().lines() {
        let line = line?;
        let response = (|| -> Result<Value, String> {
            let request: Value = serde_json::from_str(&line).map_err(|e|e.to_string())?;
            let p = &request["params"];
            match request["method"].as_str() {
                Some("fetch_page") => {
                    let url = string(p,"url")?;
                    if !["fixture://amazon-demo/page-1","fixture://amazon-demo/page-2"].contains(&url.as_str()) { return Err("Only the two frozen benchmark fixture URLs are allowed".into()); }
                    let mut page = runtime.block_on(scraping::fetch_page(url.clone()))?;
                    page["html"] = fixture["pages"][&url].as_str().ok_or("Frozen fixture is missing a page")?.into();
                    Ok(page)
                }
                Some("extract_rows") => scraping::extract_rows(string(p,"html")?,string(p,"baseUrl")?,string(p,"rowSelector")?,p["fields"].clone(),string(p,"nextSelector")?),
                Some("write_live_csv") | Some("export_rows") => {
                    let cwd = std::path::PathBuf::from(string(p,"cwd")?).canonicalize().map_err(|e|e.to_string())?;
                    if cwd != root { return Err("Writes must stay in the benchmark run folder".into()); }
                    let folder = root.to_string_lossy().to_string();
                    if request["method"] == "write_live_csv" {
                        live_csv::write(&state,&folder,&string(p,"name")?,p["sessionId"].as_str().map(str::to_owned),p["rows"].clone())
                    } else { scraping::export_rows(folder,string(p,"name")?,string(p,"format")?,p["rows"].clone()) }
                }
                Some("release_live_csv") => Ok(Value::Null), // run-scoped process owns and drops sessions
                _ => Err("Unsupported benchmark operation".into()),
            }
        })();
        let message = match response { Ok(value)=>json!({"result":value}), Err(error)=>json!({"error":error}) };
        writeln!(output,"{message}")?;output.flush()?;
    }
    Ok(())
}
