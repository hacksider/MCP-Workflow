use serde_json::{json, Value};
use std::time::Duration;

pub fn checked_url(url: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(url).map_err(|_| "Enter a valid HTTP(S) URL")?;
    if !["http", "https"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Use an HTTP(S) URL without embedded credentials".into());
    }
    Ok(url)
}
fn secret_header(value: &str) -> Result<String, String> {
    if let Some(name) = value.strip_prefix("env:") {
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err("Invalid secret environment variable name".into());
        }
        std::env::var(name).map_err(|_| format!("Missing environment variable: {name}"))
    } else {
        Ok(value.to_string())
    }
}
#[tauri::command]
pub async fn http_request(
    url: String,
    method: String,
    headers: Value,
    body: String,
    auth_env: String,
) -> Result<Value, String> {
    let url = checked_url(&url)?;
    if !["GET", "POST", "PUT", "PATCH", "DELETE"].contains(&method.as_str()) {
        return Err("Unsupported CRUD method".into());
    }
    if body.len() > 2 * 1024 * 1024 {
        return Err("Request body exceeds 2 MB".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?,
        url.clone(),
    );
    let headers = headers
        .as_object()
        .ok_or("Headers must be a JSON object of string values")?;
    for (key, value) in headers {
        request = request.header(
            key,
            value
                .as_str()
                .ok_or_else(|| "Header values must be strings".to_owned())
                .and_then(secret_header)?,
        );
    }
    if !auth_env.is_empty() {
        request = request.bearer_auth(secret_header(&format!("env:{auth_env}"))?);
    }
    if !body.is_empty() {
        if !headers
            .keys()
            .any(|k| k.eq_ignore_ascii_case("content-type"))
        {
            request = request.header(
                "content-type",
                if serde_json::from_str::<Value>(&body).is_ok() {
                    "application/json"
                } else {
                    "text/plain"
                },
            );
        }
        request = request.body(body);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;
    bounded_response(response).await
}
pub async fn bounded_response(mut response: reqwest::Response) -> Result<Value, String> {
    let status = response.status().as_u16();
    let url = response.url().to_string();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_owned();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("Response exceeds the 2 MB limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let text = String::from_utf8(bytes).map_err(|_| "Response is not UTF-8 text or JSON")?;
    let body = serde_json::from_str::<Value>(&text).unwrap_or(Value::String(text));
    Ok(json!({"status":status,"url":url,"contentType":content_type,"body":body}))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    #[test]
    fn rejects_invalid_urls_and_supports_crud_methods() {
        assert!(checked_url("file:///secret").is_err());
        assert!(checked_url("https://user:pass@example.com").is_err());
        for method in ["GET", "POST", "PUT", "PATCH", "DELETE"] {
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let expected = method.to_owned();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut bytes = [0; 8192];
                let n = stream.read(&mut bytes).unwrap();
                assert!(String::from_utf8_lossy(&bytes[..n])
                    .starts_with(&format!("{expected} /items ")));
                stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}").unwrap();
            });
            let response = tauri::async_runtime::block_on(http_request(
                format!("http://{address}/items"),
                method.into(),
                json!({}),
                String::new(),
                String::new(),
            ))
            .unwrap();
            assert_eq!(response["body"]["ok"], true);
            server.join().unwrap();
        }
    }
}
