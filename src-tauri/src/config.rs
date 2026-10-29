use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::Path;

pub const CONFIG_FILE: &str = "config.local.json";

#[derive(Debug)]
pub struct LocalConfig {
    pub base_url: String,
    pub model: String,
    pub api_key: SecretString,
    pub transport: Transport,
}

#[derive(Serialize, Deserialize, Type, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Transport {
    Https,
    LocalHttp,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConfigError {
    Missing { path: String },
    Invalid { message: String },
    InsecureUrl { url: String },
}

#[derive(Deserialize)]
struct RawConfig {
    base_url: String,
    model: String,
    api_key: String,
}

pub fn check_base_url(url: &str) -> Result<Transport, ConfigError> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|_| ConfigError::InsecureUrl { url: url.to_string() })?;

    match parsed.scheme() {
        "https" => Ok(Transport::Https),
        "http" => {
            let is_local = if let Some(host) = parsed.host_str() {
                if host == "localhost" {
                    true
                } else if let Ok(ip) = host
                    .trim_start_matches('[')
                    .trim_end_matches(']')
                    .parse::<std::net::IpAddr>()
                {
                    match ip {
                        std::net::IpAddr::V4(ipv4) => ipv4.is_loopback() || ipv4.is_private(),
                        std::net::IpAddr::V6(ipv6) => {
                            ipv6.is_loopback() || (ipv6.segments()[0] & 0xfe00) == 0xfc00
                        }
                    }
                } else {
                    false
                }
            } else {
                false
            };

            if is_local {
                Ok(Transport::LocalHttp)
            } else {
                Err(ConfigError::InsecureUrl { url: url.to_string() })
            }
        }
        _ => Err(ConfigError::InsecureUrl { url: url.to_string() }),
    }
}

pub fn load(dir: &Path) -> Result<LocalConfig, ConfigError> {
    let file_path = dir.join(CONFIG_FILE);
    if !file_path.exists() {
        return Err(ConfigError::Missing {
            path: file_path.to_string_lossy().to_string(),
        });
    }

    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| ConfigError::Invalid { message: e.to_string() })?;

    // Some editors save UTF-8 with a byte-order mark, which serde_json rejects.
    let raw: RawConfig = serde_json::from_str(content.trim_start_matches('\u{feff}'))
        .map_err(|e| ConfigError::Invalid { message: e.to_string() })?;

    if raw.base_url.trim().is_empty()
        || raw.model.trim().is_empty()
        || raw.api_key.trim().is_empty()
    {
        return Err(ConfigError::Invalid {
            message: "base_url, model, and api_key must not be empty".to_string(),
        });
    }

    let base_url = raw.base_url.trim_end_matches('/').to_string();
    let transport = check_base_url(&base_url)?;
    let api_key = SecretString::from(raw.api_key);

    Ok(LocalConfig {
        base_url,
        model: raw.model,
        api_key,
        transport,
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dir_with(name: &str, json: Option<&str>) -> PathBuf {
        let pid = std::process::id();
        let dir = std::env::temp_dir().join(format!("aidp-config-test-{pid}-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::create_dir_all(&dir);
        if let Some(content) = json {
            let _ = std::fs::write(dir.join(CONFIG_FILE), content);
        }
        dir
    }

    #[test]
    fn missing_file_reports_path() {
        let dir = dir_with("missing", None);
        let err = load(&dir).err().unwrap();
        match err {
            ConfigError::Missing { path } => {
                assert!(path.ends_with("config.local.json"), "path was {path}");
            }
            _ => panic!("unexpected error: {err:?}"),
        }
    }

    #[test]
    fn loads_and_trims_trailing_slash() {
        let dir = dir_with(
            "trims-slash",
            Some(
                r#"{
                "base_url": "https://api.example.com/v1/",
                "model": "gpt-4o",
                "api_key": "sk-1234"
            }"#,
            ),
        );
        let cfg = load(&dir).unwrap();
        assert_eq!(cfg.base_url, "https://api.example.com/v1");
        assert_eq!(cfg.transport, Transport::Https);
    }

    #[test]
    fn loads_a_file_saved_with_a_byte_order_mark() {
        let dir = dir_with(
            "bom",
            Some(
                "\u{feff}{ \"base_url\": \"https://api.example.com/v1\", \"model\": \"gpt-4o\", \"api_key\": \"sk-1234\" }",
            ),
        );
        let cfg = load(&dir).unwrap();
        assert_eq!(cfg.base_url, "https://api.example.com/v1");
        assert_eq!(cfg.model, "gpt-4o");
    }

    #[test]
    fn invalid_json_is_invalid() {
        let dir = dir_with("invalid-json", Some("{ not json"));
        let err = load(&dir).err().unwrap();
        assert!(matches!(err, ConfigError::Invalid { .. }));
    }

    #[test]
    fn empty_key_is_invalid() {
        let dir = dir_with(
            "empty-key",
            Some(
                r#"{
                "base_url": "https://api.example.com/v1",
                "model": "gpt-4o",
                "api_key": ""
            }"#,
            ),
        );
        let err = load(&dir).err().unwrap();
        assert!(matches!(err, ConfigError::Invalid { .. }));
    }

    #[test]
    fn url_rules() {
        assert_eq!(
            check_base_url("https://api.example.com/v1"),
            Ok(Transport::Https)
        );
        assert_eq!(
            check_base_url("http://localhost:1234/v1"),
            Ok(Transport::LocalHttp)
        );
        assert_eq!(
            check_base_url("http://127.0.0.1:8080"),
            Ok(Transport::LocalHttp)
        );
        assert_eq!(
            check_base_url("http://192.168.1.20:1234/v1"),
            Ok(Transport::LocalHttp)
        );
        assert!(matches!(
            check_base_url("http://api.example.com/v1"),
            Err(ConfigError::InsecureUrl { .. })
        ));
        assert!(matches!(
            check_base_url("ftp://example.com"),
            Err(ConfigError::InsecureUrl { .. })
        ));
    }

    #[test]
    fn ipv6_local_hosts_are_local_http() {
        assert_eq!(
            check_base_url("http://[::1]:11434/v1"),
            Ok(Transport::LocalHttp)
        );
        assert_eq!(
            check_base_url("http://[fd00::5]:8080"),
            Ok(Transport::LocalHttp)
        );
        assert!(matches!(
            check_base_url("http://[2001:db8::1]/v1"),
            Err(ConfigError::InsecureUrl { .. })
        ));
    }

    #[test]
    fn debug_never_shows_the_key() {
        let dir = dir_with(
            "debug-redacted",
            Some(
                r#"{
                "base_url": "https://api.example.com/v1",
                "model": "gpt-4o",
                "api_key": "sk-secret-1234"
            }"#,
            ),
        );
        let cfg = load(&dir).unwrap();
        let debug_str = format!("{cfg:?}");
        assert!(!debug_str.contains("sk-secret-1234"));
        assert!(debug_str.contains("[REDACTED]"));
    }
}
