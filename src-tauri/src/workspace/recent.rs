pub const KEY: &str = "recent_workspaces";

pub fn push(mut list: Vec<String>, path: String) -> Vec<String> {
    list.retain(|p| p != &path);
    list.insert(0, path);
    list.truncate(5);
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_push_moves_to_front_and_caps_at_five() {
        let mut list = Vec::new();
        for item in ["a", "b", "c", "d", "e", "f"] {
            list = push(list, item.to_string());
        }
        list = push(list, "c".to_string());
        assert_eq!(
            list,
            vec![
                "c".to_string(),
                "f".to_string(),
                "e".to_string(),
                "d".to_string(),
                "b".to_string()
            ]
        );
    }
}
