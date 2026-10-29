use secrecy::{ExposeSecret, SecretString};
use std::collections::HashMap;
use std::sync::Mutex;

pub const SERVICE: &str = "com.aidp.desktop";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SecretError {
    NotFound,
    Unavailable(String),
}

pub trait SecretStore: Send + Sync {
    fn set(&self, id: u32, key: &SecretString) -> Result<(), SecretError>;
    fn get(&self, id: u32) -> Result<SecretString, SecretError>;
    fn delete(&self, id: u32) -> Result<(), SecretError>;
}

pub struct Keychain;

impl SecretStore for Keychain {
    fn set(&self, id: u32, key: &SecretString) -> Result<(), SecretError> {
        let entry = keyring::Entry::new(SERVICE, &format!("connection-{id}"))
            .map_err(|e| SecretError::Unavailable(e.to_string()))?;
        entry
            .set_password(key.expose_secret())
            .map_err(|e| SecretError::Unavailable(e.to_string()))
    }

    fn get(&self, id: u32) -> Result<SecretString, SecretError> {
        let entry = keyring::Entry::new(SERVICE, &format!("connection-{id}"))
            .map_err(|e| SecretError::Unavailable(e.to_string()))?;
        match entry.get_password() {
            Ok(pwd) => Ok(SecretString::from(pwd)),
            Err(keyring::Error::NoEntry) => Err(SecretError::NotFound),
            Err(e) => Err(SecretError::Unavailable(e.to_string())),
        }
    }

    fn delete(&self, id: u32) -> Result<(), SecretError> {
        let entry = keyring::Entry::new(SERVICE, &format!("connection-{id}"))
            .map_err(|e| SecretError::Unavailable(e.to_string()))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(SecretError::Unavailable(e.to_string())),
        }
    }
}

pub struct MemoryStore {
    map: Mutex<HashMap<u32, String>>,
    failing: bool,
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
            failing: false,
        }
    }
}

impl MemoryStore {
    pub fn failing() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
            failing: true,
        }
    }

    pub fn contains(&self, id: u32) -> bool {
        self.map
            .lock()
            .map(|m| m.contains_key(&id))
            .unwrap_or(false)
    }

    pub fn len(&self) -> usize {
        self.map.lock().map(|m| m.len()).unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn remove(&self, id: u32) {
        if let Ok(mut m) = self.map.lock() {
            m.remove(&id);
        }
    }
}

impl SecretStore for MemoryStore {
    fn set(&self, id: u32, key: &SecretString) -> Result<(), SecretError> {
        if self.failing {
            return Err(SecretError::Unavailable("keychain locked".to_string()));
        }
        let mut map = self
            .map
            .lock()
            .map_err(|e| SecretError::Unavailable(e.to_string()))?;
        map.insert(id, key.expose_secret().to_string());
        Ok(())
    }

    fn get(&self, id: u32) -> Result<SecretString, SecretError> {
        let map = self
            .map
            .lock()
            .map_err(|e| SecretError::Unavailable(e.to_string()))?;
        match map.get(&id) {
            Some(v) => Ok(SecretString::from(v.clone())),
            None => Err(SecretError::NotFound),
        }
    }

    fn delete(&self, id: u32) -> Result<(), SecretError> {
        let mut map = self
            .map
            .lock()
            .map_err(|e| SecretError::Unavailable(e.to_string()))?;
        map.remove(&id);
        Ok(())
    }
}

pub fn key_hint(key: &SecretString) -> String {
    let s = key.expose_secret();
    let char_count = s.chars().count();
    if char_count >= 12 {
        s.chars().skip(char_count - 4).collect()
    } else {
        String::new()
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn key_hint_is_last_four_for_long_keys() {
        let key = SecretString::from("sk-or-v1-abcdef1234".to_string());
        assert_eq!(key_hint(&key), "1234");
    }

    #[test]
    fn key_hint_is_empty_for_short_keys() {
        let key = SecretString::from("short".to_string());
        assert_eq!(key_hint(&key), "");
    }

    #[test]
    fn memory_store_round_trips_and_delete_is_idempotent() {
        let store = MemoryStore::default();
        let key = SecretString::from("secret-123".to_string());

        assert_eq!(store.len(), 0);
        assert!(!store.contains(1));

        store.set(1, &key).unwrap();
        assert_eq!(store.len(), 1);
        assert!(store.contains(1));

        let retrieved = store.get(1).unwrap();
        assert_eq!(retrieved.expose_secret(), "secret-123");

        store.delete(1).unwrap();
        assert_eq!(store.get(1).unwrap_err(), SecretError::NotFound);
        assert_eq!(store.len(), 0);

        // Delete is idempotent
        store.delete(1).unwrap();
    }

    #[test]
    fn failing_store_reports_unavailable() {
        let store = MemoryStore::failing();
        let key = SecretString::from("secret".to_string());
        let err = store.set(1, &key).unwrap_err();
        assert!(matches!(err, SecretError::Unavailable(_)));
    }

    #[test]
    #[ignore]
    fn keychain_round_trip_on_this_machine() {
        let store = Keychain;
        let id = 4_000_000_000;
        let key = SecretString::from("test-roundtrip-key".to_string());

        store.set(id, &key).unwrap();
        let got = store.get(id).unwrap();
        assert_eq!(got.expose_secret(), "test-roundtrip-key");

        store.delete(id).unwrap();
        let after = store.get(id);
        assert_eq!(after.unwrap_err(), SecretError::NotFound);
    }
}
