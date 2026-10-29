use std::path::Path;

pub fn is_secret(rel: &str) -> bool {
    let filename = Path::new(rel)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    filename.starts_with(".env")
        || filename.ends_with(".pem")
        || filename.ends_with(".key")
        || filename.starts_with("id_rsa")
        || filename.starts_with("id_ed25519")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_secret_table() {
        let secrets = [
            ".env",
            ".env.local",
            "config/.ENV.production",
            "server.pem",
            "tls.KEY",
            "id_rsa",
            "id_rsa.pub",
            "id_ed25519",
        ];
        for s in secrets {
            assert!(is_secret(s), "{s} should be secret");
        }

        let non_secrets = ["environment.ts", "keys.json", "monkey.ts", "src/key.rs"];
        for s in non_secrets {
            assert!(!is_secret(s), "{s} should not be secret");
        }
    }
}
