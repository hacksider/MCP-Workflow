use super::{codex_binary, Reply};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::process::Command;

async fn command(args: &[&str]) -> Reply {
    let mut process = Command::new(codex_binary());
    process
        .args(args)
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    process.creation_flags(0x08000000);
    let output = tokio::time::timeout(Duration::from_secs(180), process.output())
        .await
        .map_err(|_| "Plugin operation timed out. Refresh the catalog before retrying.")?
        .map_err(|e| format!("Cannot run Codex plugin installer: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "Codex plugin operation failed: {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(2000)
                .collect::<String>()
        ));
    }
    serde_json::from_slice(&output.stdout).map_err(|e| format!("Unexpected plugin response: {e}"))
}

#[tauri::command]
pub async fn plugin_catalog() -> Reply {
    command(&["plugin", "list", "--available", "--json"]).await
}

fn select_plugin<'a>(catalog: &'a Value, id: &str) -> Result<&'a Value, String> {
    let plugin = ["installed", "available"]
        .into_iter()
        .flat_map(|key| catalog[key].as_array().into_iter().flatten())
        .find(|p| p["pluginId"].as_str() == Some(id))
        .ok_or("Plugin is not in the available Codex catalog")?;
    if plugin["installPolicy"].as_str() != Some("AVAILABLE") {
        return Err("Plugin installation is restricted by your account or administrator".into());
    }
    Ok(plugin)
}

#[tauri::command]
pub async fn install_plugin(plugin_id: String, force: Option<bool>) -> Reply {
    // Never turn a UI/model-supplied value into a source URL or shell command.
    let catalog = plugin_catalog().await?;
    let plugin = select_plugin(&catalog, &plugin_id)?;
    let name = plugin["name"]
        .as_str()
        .ok_or("Missing plugin name")?
        .to_owned();
    let marketplace = plugin["marketplaceName"]
        .as_str()
        .ok_or("Missing marketplace")?
        .to_owned();
    let git_marketplace = plugin["marketplaceSource"]["sourceType"].as_str() == Some("git");
    if git_marketplace {
        command(&[
            "plugin",
            "marketplace",
            "upgrade",
            "--json",
            "--",
            &marketplace,
        ])
        .await?;
    } else if plugin["source"]["source"].as_str() != Some("remote")
        && plugin["installed"].as_bool() == Some(true)
        && !force.unwrap_or(false)
    {
        return Ok(json!({"changed":false}));
    }
    command(&[
        "plugin",
        "add",
        "--marketplace",
        &marketplace,
        "--json",
        "--",
        &name,
    ])
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    #[ignore = "reads the real account catalog"]
    fn live_catalog_cli() {
        let catalog = tauri::async_runtime::block_on(plugin_catalog()).expect("catalog");
        assert!(catalog["available"].is_array());
        println!("Available entries: {}",catalog["available"].as_array().unwrap().len());
    }
    #[test]
    fn only_catalog_plugins_with_install_permission_are_selected() {
        let catalog = json!({"available":[{"pluginId":"ok@m","installPolicy":"AVAILABLE"},{"pluginId":"blocked@m","installPolicy":"NOT_AVAILABLE"}]});
        assert!(select_plugin(&catalog, "ok@m").is_ok());
        assert!(select_plugin(&catalog, "blocked@m").is_err());
        assert!(select_plugin(&catalog, "--arbitrary-command").is_err());
    }
}
