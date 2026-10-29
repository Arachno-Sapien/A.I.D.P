use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Transport {
    Https,
    LocalHttp,
}

pub fn check_base_url(url: &str) -> Option<Transport> {
    let parsed = reqwest::Url::parse(url).ok()?;

    match parsed.scheme() {
        "https" => Some(Transport::Https),
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
                Some(Transport::LocalHttp)
            } else {
                None
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_rules() {
        assert_eq!(
            check_base_url("https://api.example.com/v1"),
            Some(Transport::Https)
        );
        assert_eq!(
            check_base_url("http://localhost:1234/v1"),
            Some(Transport::LocalHttp)
        );
        assert_eq!(
            check_base_url("http://127.0.0.1:8080"),
            Some(Transport::LocalHttp)
        );
        assert_eq!(
            check_base_url("http://192.168.1.20:1234/v1"),
            Some(Transport::LocalHttp)
        );
        assert_eq!(check_base_url("http://api.example.com/v1"), None);
        assert_eq!(check_base_url("ftp://example.com"), None);
    }

    #[test]
    fn ipv6_local_hosts_are_local_http() {
        assert_eq!(
            check_base_url("http://[::1]:8080/v1"),
            Some(Transport::LocalHttp)
        );
        assert_eq!(
            check_base_url("http://[fd00::1]:8080/v1"),
            Some(Transport::LocalHttp)
        );
        assert_eq!(check_base_url("http://[2001:db8::1]:8080/v1"), None);
    }
}
