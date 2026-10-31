#![allow(clippy::unwrap_used)]

use aidp_lib::connections::{AppError, Services};
use aidp_lib::db;
use aidp_lib::gateway::Role;
use aidp_lib::history::{extract_title, NewMessage};
use aidp_lib::secrets::{MemoryStore, SecretStore};
use std::sync::Arc;

fn create_services(store: Arc<dyn SecretStore>) -> Services {
    let conn = db::open_in_memory().unwrap();
    Services::new(conn, store, reqwest::Client::new())
}

#[tokio::test]
async fn history_round_trip() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let conv = services
        .create_conversation("Fix the parser bug", None)
        .expect("create conversation");
    assert_eq!(conv.title, "Fix the parser bug");
    assert!(conv.workspace_path.is_none());

    // 1. Append user message
    let m1 = NewMessage {
        role: Role::User,
        content_parts: r#"[{"type":"text","text":"Fix the parser bug"}]"#.to_string(),
        model_ref: None,
        model_name: None,
        status: "complete".to_string(),
        error_kind: None,
        tokens_in: None,
        tokens_out: None,
    };
    let id1 = services.append_message(conv.id, m1.clone()).expect("append m1");
    assert!(id1 > 0);

    // 2. Append assistant message (stopped, error_kind none)
    let m2 = NewMessage {
        role: Role::Assistant,
        content_parts: r#"[{"type":"text","text":"Here is part of the fix..."}]"#.to_string(),
        model_ref: Some("1:m1".to_string()),
        model_name: Some("Model 1".to_string()),
        status: "stopped".to_string(),
        error_kind: None,
        tokens_in: Some(15),
        tokens_out: Some(40),
    };
    let id2 = services.append_message(conv.id, m2.clone()).expect("append m2");
    assert!(id2 > id1);

    // 3. Append assistant message (error, "offline")
    let m3 = NewMessage {
        role: Role::Assistant,
        content_parts: r#"[]"#.to_string(),
        model_ref: Some("1:m1".to_string()),
        model_name: Some("Model 1".to_string()),
        status: "error".to_string(),
        error_kind: Some("offline".to_string()),
        tokens_in: None,
        tokens_out: None,
    };
    let id3 = services.append_message(conv.id, m3.clone()).expect("append m3");
    assert!(id3 > id2);

    // Load messages and check all three in order with every field
    let messages = services.messages(conv.id).expect("load messages");
    assert_eq!(messages.len(), 3);

    assert_eq!(messages[0].id, id1);
    assert_eq!(messages[0].role, Role::User);
    assert_eq!(messages[0].content_parts, m1.content_parts);
    assert_eq!(messages[0].model_ref, None);
    assert_eq!(messages[0].model_name, None);
    assert_eq!(messages[0].status, "complete");
    assert_eq!(messages[0].error_kind, None);
    assert_eq!(messages[0].tokens_in, None);
    assert_eq!(messages[0].tokens_out, None);
    assert!(messages[0].created_at > 0);

    assert_eq!(messages[1].id, id2);
    assert_eq!(messages[1].role, Role::Assistant);
    assert_eq!(messages[1].content_parts, m2.content_parts);
    assert_eq!(messages[1].model_ref, Some("1:m1".to_string()));
    assert_eq!(messages[1].model_name, Some("Model 1".to_string()));
    assert_eq!(messages[1].status, "stopped");
    assert_eq!(messages[1].error_kind, None);
    assert_eq!(messages[1].tokens_in, Some(15));
    assert_eq!(messages[1].tokens_out, Some(40));
    assert!(messages[1].created_at >= messages[0].created_at);

    assert_eq!(messages[2].id, id3);
    assert_eq!(messages[2].role, Role::Assistant);
    assert_eq!(messages[2].content_parts, m3.content_parts);
    assert_eq!(messages[2].model_ref, Some("1:m1".to_string()));
    assert_eq!(messages[2].model_name, Some("Model 1".to_string()));
    assert_eq!(messages[2].status, "error");
    assert_eq!(messages[2].error_kind, Some("offline".to_string()));
    assert_eq!(messages[2].tokens_in, None);
    assert_eq!(messages[2].tokens_out, None);
    assert!(messages[2].created_at >= messages[1].created_at);
}

#[tokio::test]
async fn conversations_by_place() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let c1 = services
        .create_conversation("First plain chat", None)
        .expect("create c1");
    let c2 = services
        .create_conversation("Workspace project chat", Some("C:\\p".to_string()))
        .expect("create c2");
    let c3 = services
        .create_conversation("Second plain chat", None)
        .expect("create c3");

    // Initially plain chats list c3 then c1 (newest first)
    let plain = services.conversations(None).expect("plain conversations");
    assert_eq!(plain.len(), 2);
    assert_eq!(plain[0].id, c3.id);
    assert_eq!(plain[1].id, c1.id);

    // Bump c1 by appending a message to it
    services
        .append_message(
            c1.id,
            NewMessage {
                role: Role::User,
                content_parts: r#"[{"type":"text","text":"Bump c1"}]"#.to_string(),
                model_ref: None,
                model_name: None,
                status: "complete".to_string(),
                error_kind: None,
                tokens_in: None,
                tokens_out: None,
            },
        )
        .expect("append to c1");

    // Now plain chats return c1 first (latest updated) then c3
    let plain_after = services.conversations(None).expect("plain conversations");
    assert_eq!(plain_after.len(), 2);
    assert_eq!(plain_after[0].id, c1.id);
    assert_eq!(plain_after[1].id, c3.id);

    // Workspace query returns only c2
    let ws = services
        .conversations(Some("C:\\p".to_string()))
        .expect("workspace conversations");
    assert_eq!(ws.len(), 1);
    assert_eq!(ws[0].id, c2.id);
    assert_eq!(ws[0].workspace_path, Some("C:\\p".to_string()));
}

#[tokio::test]
async fn delete_cascades() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let c1 = services.create_conversation("Chat 1", None).unwrap();
    let c2 = services.create_conversation("Chat 2", None).unwrap();

    let dummy_msg = NewMessage {
        role: Role::User,
        content_parts: "[]".to_string(),
        model_ref: None,
        model_name: None,
        status: "complete".to_string(),
        error_kind: None,
        tokens_in: None,
        tokens_out: None,
    };

    services.append_message(c1.id, dummy_msg.clone()).unwrap();
    services.append_message(c2.id, dummy_msg).unwrap();

    assert_eq!(services.messages(c1.id).unwrap().len(), 1);
    assert_eq!(services.messages(c2.id).unwrap().len(), 1);

    // Delete c1
    services.delete_conversation(c1.id).expect("delete c1");

    // c1's messages are gone (list_messages empty)
    assert!(services.messages(c1.id).unwrap().is_empty());

    // c2's message is untouched
    assert_eq!(services.messages(c2.id).unwrap().len(), 1);

    // c1 is gone from list
    let list = services.conversations(None).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, c2.id);
}

#[test]
fn title_from_first_line() {
    // 1. "  \nFix the parser\nmore" -> "Fix the parser"
    let t1 = extract_title("  \nFix the parser\nmore");
    assert_eq!(t1, "Fix the parser");

    // 2. 80 'é' -> 60 characters
    let long_e = "é".repeat(80);
    let t2 = extract_title(&long_e);
    assert_eq!(t2.chars().count(), 60);
    assert_eq!(t2, "é".repeat(60));

    // 3. "" -> "New chat"
    let t3 = extract_title("");
    assert_eq!(t3, "New chat");

    // 4. whitespace lines only -> "New chat"
    let t4 = extract_title("   \n\t  \n  ");
    assert_eq!(t4, "New chat");
}

#[tokio::test]
async fn append_checks_status_and_conversation() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let conv = services.create_conversation("Test", None).unwrap();

    // status "streaming" -> InvalidInput
    let streaming_msg = NewMessage {
        role: Role::Assistant,
        content_parts: "[]".to_string(),
        model_ref: None,
        model_name: None,
        status: "streaming".to_string(),
        error_kind: None,
        tokens_in: None,
        tokens_out: None,
    };
    let err = services
        .append_message(conv.id, streaming_msg)
        .expect_err("streaming status rejected");
    match err {
        AppError::InvalidInput { message } => {
            assert!(message.contains("streaming") || message.contains("status"));
        }
        other => panic!("expected InvalidInput, got {:?}", other),
    }

    // conversation id 999 -> NotFound
    let valid_msg = NewMessage {
        role: Role::User,
        content_parts: "[]".to_string(),
        model_ref: None,
        model_name: None,
        status: "complete".to_string(),
        error_kind: None,
        tokens_in: None,
        tokens_out: None,
    };
    let err_not_found = services
        .append_message(999, valid_msg)
        .expect_err("unknown conversation rejected");
    assert_eq!(err_not_found, AppError::NotFound);

    // deleting id 999 -> NotFound
    let err_del = services
        .delete_conversation(999)
        .expect_err("unknown conversation cannot be deleted");
    assert_eq!(err_del, AppError::NotFound);
}

#[tokio::test]
async fn pin_and_archive_round_trip() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let conv = services.create_conversation("My chat", None).unwrap();
    assert!(!conv.pinned);
    assert!(!conv.archived);

    // set_pinned(true)
    services.set_conversation_pinned(conv.id, true).unwrap();
    let list = services.conversations(None).unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].pinned);
    assert!(!list[0].archived);

    // set_archived(true) -> archived becomes true, pinned becomes false
    services.set_conversation_archived(conv.id, true).unwrap();
    let list = services.conversations(None).unwrap();
    assert_eq!(list.len(), 1);
    assert!(!list[0].pinned);
    assert!(list[0].archived);
}

#[tokio::test]
async fn a_new_message_unarchives() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let conv = services.create_conversation("Archived chat", None).unwrap();
    services.set_conversation_archived(conv.id, true).unwrap();
    let list = services.conversations(None).unwrap();
    assert!(list[0].archived);

    let msg = NewMessage {
        role: Role::User,
        content_parts: r#"[{"type":"text","text":"hello"}]"#.to_string(),
        model_ref: None,
        model_name: None,
        status: "complete".to_string(),
        error_kind: None,
        tokens_in: None,
        tokens_out: None,
    };
    services.append_message(conv.id, msg).unwrap();

    let list = services.conversations(None).unwrap();
    assert_eq!(list.len(), 1);
    assert!(!list[0].archived);
}

#[tokio::test]
async fn pin_or_archive_a_missing_chat() {
    let store = Arc::new(MemoryStore::default());
    let services = create_services(store);

    let err_pin = services.set_conversation_pinned(999, true).unwrap_err();
    assert_eq!(err_pin, AppError::NotFound);

    let err_arch = services.set_conversation_archived(999, true).unwrap_err();
    assert_eq!(err_arch, AppError::NotFound);
}
