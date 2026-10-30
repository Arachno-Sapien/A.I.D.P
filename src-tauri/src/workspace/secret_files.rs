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
        || filename.ends_with(".ppk")
}

/// PEM (`-----BEGIN ... PRIVATE KEY-----`), PGP (`... PRIVATE KEY BLOCK-----`)
/// and PuTTY (`PuTTY-User-Key-File-`) private keys.
pub fn has_private_key(text: &str) -> bool {
    let is_key_header = |h: &str| h.contains("PRIVATE KEY-----") || h.contains("PRIVATE KEY BLOCK-----");
    if text.lines().any(|l| l.starts_with("PuTTY-User-Key-File-")) {
        return true;
    }
    let mut remainder = text;
    while let Some(pos) = remainder.find("-----BEGIN ") {
        let after_begin = &remainder[pos + "-----BEGIN ".len()..];
        if let Some(line_end) = after_begin.find('\n') {
            if is_key_header(&after_begin[..line_end]) {
                return true;
            }
            remainder = &after_begin[line_end..];
        } else {
            return is_key_header(after_begin);
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
            "server.ppk",
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
        assert!(has_private_key("-----BEGIN PGP PRIVATE KEY BLOCK-----\n\nlQOY...\n-----END PGP PRIVATE KEY BLOCK-----"));
        assert!(has_private_key("PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\n"));
        assert!(!has_private_key("-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nmQIN...\n-----END PGP PUBLIC KEY BLOCK-----"));
        assert!(!has_private_key("This document discusses how a private key should be managed securely."));
    }
}
