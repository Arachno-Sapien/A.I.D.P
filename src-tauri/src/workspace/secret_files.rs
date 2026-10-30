use std::path::Path;

pub fn is_secret(rel: &str) -> bool {
    let filename = Path::new(rel)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    filename == ".npmrc"
        || filename == ".pypirc"
        || filename == ".netrc"
        || filename == "_netrc"
        || filename == ".git-credentials"
        || filename.starts_with(".env")
        || filename.starts_with("id_rsa")
        || filename.starts_with("id_ed25519")
        || filename.starts_with("id_ecdsa")
        || filename.starts_with("id_dsa")
        || filename.ends_with(".pem")
        || filename.ends_with(".key")
        || filename.ends_with(".p12")
        || filename.ends_with(".pfx")
        || filename.ends_with(".jks")
        || filename.ends_with(".keystore")
        || filename.ends_with(".tfvars")
}

pub fn has_private_key(text: &str) -> bool {
    let mut remainder = text;
    while let Some(pos) = remainder.find("-----BEGIN ") {
        let after_begin = &remainder[pos + "-----BEGIN ".len()..];
        if let Some(line_end) = after_begin.find('\n') {
            let header = &after_begin[..line_end];
            if header.contains("PRIVATE KEY-----") {
                return true;
            }
            remainder = &after_begin[line_end..];
        } else {
            if after_begin.contains("PRIVATE KEY-----") {
                return true;
            }
            break;
        }
    }
    false
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
            "id_ecdsa",
            "KEYS.P12",
            "cert.pfx",
            "a.jks",
            "release.keystore",
            "prod.tfvars",
            ".npmrc",
            ".pypirc",
            ".netrc",
            "_netrc",
            ".git-credentials",
        ];
        for s in secrets {
            assert!(is_secret(s), "{s} should be secret");
        }

        let non_secrets = [
            "environment.ts",
            "keys.json",
            "monkey.ts",
            "src/key.rs",
            "npmrc.md",
            "tfvars.ts",
            "keystore.rs",
        ];
        for s in non_secrets {
            assert!(!is_secret(s), "{s} should not be secret");
        }
    }

    #[test]
    fn has_private_key_table() {
        assert!(has_private_key("-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"));
        assert!(has_private_key("-----BEGIN EC PRIVATE KEY-----\nMHc...\n-----END EC PRIVATE KEY-----"));
        assert!(has_private_key("-----BEGIN OPENSSH PRIVATE KEY-----\nb3B...\n-----END OPENSSH PRIVATE KEY-----"));
        assert!(has_private_key("-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----"));
        assert!(!has_private_key("-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"));
        assert!(!has_private_key("This document discusses how a private key should be managed securely."));
    }
}
