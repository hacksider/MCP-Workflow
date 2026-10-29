use scraper::{Html, Selector};
use serde_json::{json, Value};
use std::{
    io::Write,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
const AGENT: &str = "MCPWorkflowDemo";
fn fixture(url: &str) -> Option<&'static str> {
    match url {
        "fixture://amazon-demo/page-1" => Some(include_str!("../../fixtures/amazon-page-1.html")),
        "fixture://amazon-demo/page-2" => Some(include_str!("../../fixtures/amazon-page-2.html")),
        _ => None,
    }
}
#[tauri::command]
pub async fn fetch_page(url: String) -> Result<Value, String> {
    if let Some(html) = fixture(&url) {
        return Ok(json!({"url":url,"html":html,"status":200,"fixture":true}));
    }
    let target = crate::http::checked_url(&url)?;
    let client = reqwest::Client::builder()
        .user_agent(AGENT)
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut robots = target.clone();
    robots.set_path("/robots.txt");
    robots.set_query(None);
    robots.set_fragment(None);
    let r = crate::http::bounded_response(
        client
            .get(robots)
            .send()
            .await
            .map_err(|e| format!("Cannot check robots.txt: {e}"))?,
    )
    .await?;
    let status = r["status"].as_u64().unwrap_or(0);
    if status == 200 {
        let body = r["body"].as_str().ok_or("robots.txt is not text")?;
        if !robotstxt::DefaultMatcher::default().one_agent_allowed_by_robots(body, AGENT, &url) {
            return Err("robots.txt disallows this URL".into());
        }
    } else if status != 404 && status != 410 {
        return Err(format!("Cannot check robots.txt (HTTP {status}); stopped"));
    }
    for attempt in 0..3 {
        let response = client
            .get(target.clone())
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let code = response.status().as_u16();
        if [429, 500, 502, 503, 504].contains(&code) && attempt < 2 {
            let delay = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(2u64.pow(attempt + 1));
            if delay > 30 {
                return Err("Server asked for a longer retry delay; try again later".into());
            }
            tokio::time::sleep(Duration::from_secs(delay)).await;
            continue;
        }
        if !(200..300).contains(&code) {
            return Err(format!(
                "Page returned HTTP {code}; access blocks and redirects are not bypassed"
            ));
        }
        let content = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        if !content.contains("html") && !content.starts_with("text/") {
            return Err("Expected HTML or text".into());
        }
        let r = crate::http::bounded_response(response).await?;
        let html = r["body"].as_str().ok_or("Expected HTML text")?;
        let lower = html.to_ascii_lowercase();
        if lower.contains("validatecaptcha")
            || lower.contains("robot check")
            || lower.contains("verify you are human")
        {
            return Err("Site requests human verification; stopped without bypassing it".into());
        }
        return Ok(json!({"url":url,"html":html,"status":code,"fixture":false}));
    }
    Err("Retry limit reached".into())
}
fn selector(text: &str) -> Result<Selector, String> {
    Selector::parse(text).map_err(|e| format!("Invalid CSS selector: {e}"))
}
#[tauri::command]
pub fn extract_rows(
    html: String,
    base_url: String,
    row_selector: String,
    fields: Value,
    next_selector: String,
) -> Result<Value, String> {
    if html.len() > 2 * 1024 * 1024 {
        return Err("HTML exceeds 2 MB".into());
    }
    let fields = fields.as_array().ok_or("Fields must be an array")?;
    if fields.is_empty() || fields.len() > 100 {
        return Err("Choose 1–100 extraction fields".into());
    }
    let document = Html::parse_document(&html);
    let rowsel = selector(&row_selector)?;
    let mut rows = Vec::new();
    for row in document.select(&rowsel).take(10001) {
        if rows.len() == 10000 {
            return Err("Page exceeds 10000 rows".into());
        }
        let mut object = serde_json::Map::new();
        for field in fields {
            let name = field["name"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("Field needs a name")?;
            if object.contains_key(name) {
                return Err("Duplicate extraction field name".into());
            }
            let css = field["selector"].as_str().unwrap_or("");
            let element = if css.is_empty() {
                Some(row)
            } else {
                row.select(&selector(css)?).next()
            };
            let attr = field["attribute"].as_str().unwrap_or("");
            let value = element
                .map(|e| {
                    if attr.is_empty() {
                        e.text()
                            .collect::<Vec<_>>()
                            .join(" ")
                            .split_whitespace()
                            .collect::<Vec<_>>()
                            .join(" ")
                    } else {
                        e.value().attr(attr).unwrap_or("").to_owned()
                    }
                })
                .unwrap_or_default();
            if field["required"].as_bool().unwrap_or(false) && value.is_empty() {
                return Err(format!("Missing required field: {name}"));
            }
            let value = if attr == "href" && !value.is_empty() {
                reqwest::Url::parse(&base_url)
                    .and_then(|u| u.join(&value))
                    .map_err(|e| e.to_string())?
                    .to_string()
            } else {
                value
            };
            object.insert(name.to_owned(), json!(value));
        }
        rows.push(Value::Object(object));
    }
    if rows.is_empty() {
        return Err(
            "No rows matched. Check selectors or use a Computer task for JavaScript-rendered pages"
                .into(),
        );
    }
    let next = if next_selector.is_empty() {
        None
    } else {
        document
            .select(&selector(&next_selector)?)
            .next()
            .and_then(|e| e.value().attr("href"))
            .filter(|v| !v.is_empty())
            .map(|v| {
                reqwest::Url::parse(&base_url)
                    .and_then(|u| u.join(v))
                    .map(|u| u.to_string())
            })
            .transpose()
            .map_err(|e| e.to_string())?
    };
    Ok(json!({"rows":rows,"nextUrl":next.unwrap_or_default()}))
}
fn cell(value: &Value) -> String {
    let text = match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        v => v.to_string(),
    };
    let text = if text.trim_start().starts_with(['=', '+', '-', '@']) {
        format!("'{text}")
    } else {
        text
    };
    format!("\"{}\"", text.replace('"', "\"\""))
}
#[tauri::command]
pub fn export_rows(
    cwd: String,
    name: String,
    format: String,
    rows: Value,
) -> Result<Value, String> {
    let base = Path::new(&cwd)
        .canonicalize()
        .map_err(|_| "Choose an existing workspace")?;
    if !base.is_dir()
        || name.is_empty()
        || name.len() > 80
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Use a folder and a simple output name (letters, digits, - or _)".into());
    }
    let rows = rows.as_array().ok_or("Export needs an array of rows")?;
    if rows.is_empty() || rows.len() > 100000 || rows.iter().any(|r| !r.is_object()) {
        return Err("Export needs 1–100000 object rows".into());
    }
    let text = match format.as_str() {
        "json" => serde_json::to_string_pretty(rows).map_err(|e| e.to_string())?,
        "csv" => {
            let keys = rows
                .iter()
                .flat_map(|r| r.as_object().unwrap().keys().cloned())
                .collect::<std::collections::BTreeSet<_>>();
            let mut lines = vec![keys
                .iter()
                .map(|k| cell(&json!(k)))
                .collect::<Vec<_>>()
                .join(",")];
            for row in rows {
                lines.push(
                    keys.iter()
                        .map(|k| cell(&row[k]))
                        .collect::<Vec<_>>()
                        .join(","),
                );
            }
            lines.join("\r\n")
        }
        _ => return Err("Choose CSV or JSON".into()),
    };
    if text.len() > 20 * 1024 * 1024 {
        return Err("Export exceeds 20 MB".into());
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let path = base.join(format!("{name}-{stamp}.{format}"));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(json!({"path":path.to_string_lossy(),"rows":rows.len(),"format":format}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fixture_pagination_and_required_fields() {
        let fields = json!([{"name":"asin","selector":"","attribute":"data-asin","required":true},{"name":"title","selector":"h2"}]);
        let r = extract_rows(
            fixture("fixture://amazon-demo/page-1").unwrap().into(),
            "fixture://amazon-demo/page-1".into(),
            "[data-asin]".into(),
            fields.clone(),
            ".s-pagination-next".into(),
        )
        .unwrap();
        assert_eq!(r["rows"].as_array().unwrap().len(), 3);
        assert_eq!(r["nextUrl"], "fixture://amazon-demo/page-2");
        assert!(extract_rows(
            "<div></div>".into(),
            "https://example.com".into(),
            "[data-asin]".into(),
            fields,
            "".into()
        )
        .is_err());
        assert_eq!(cell(&json!("=SUM(1,2)")), "\"'=SUM(1,2)\"");
    }
}
