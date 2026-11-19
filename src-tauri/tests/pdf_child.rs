#![allow(clippy::unwrap_used)]
//! The real `aidp --pdf-text` child, run as the app runs it.

use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, Stream};
use std::path::Path;
use std::process::Command;

/// A one-page PDF whose content stream is `text` drawn once, then `padding` bytes of
/// spaces, deflated: small on disk, large once the parser unpacks it.
fn pdf(text: &str, padding: usize) -> Vec<u8> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Courier",
    });
    let resources_id = doc.add_object(dictionary! { "Font" => dictionary! { "F1" => font_id } });
    let mut content = Content {
        operations: vec![
            Operation::new("BT", vec![]),
            Operation::new("Tf", vec!["F1".into(), 24.into()]),
            Operation::new("Td", vec![72.into(), 720.into()]),
            Operation::new("Tj", vec![Object::string_literal(text)]),
            Operation::new("ET", vec![]),
        ],
    }
    .encode()
    .unwrap();
    content.resize(content.len() + padding, b' ');
    let mut stream = Stream::new(dictionary! {}, content);
    stream.compress().unwrap();
    let content_id = doc.add_object(stream);
    let page_id = doc.add_object(dictionary! {
        "Type" => "Page", "Parent" => pages_id, "Contents" => content_id,
    });
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => vec![page_id.into()], "Count" => 1,
            "Resources" => resources_id,
            "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
        }),
    );
    let catalog_id = doc.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    doc.trailer.set("Root", catalog_id);
    let mut bytes = Vec::new();
    doc.save_to(&mut bytes).unwrap();
    bytes
}

fn run_child(dir: &Path, name: &str, bytes: &[u8], max_memory: usize) -> (bool, Option<String>) {
    let pdf = dir.join(format!("{name}.pdf"));
    let out = dir.join(format!("{name}.out"));
    std::fs::write(&pdf, bytes).unwrap();
    let status = Command::new(env!("CARGO_BIN_EXE_aidp"))
        .arg("--pdf-text")
        .arg(&pdf)
        .arg(&out)
        .arg(max_memory.to_string())
        .status()
        .unwrap();
    (status.success(), std::fs::read_to_string(&out).ok())
}

/// A decompression bomb stops at the child's memory cap instead of filling the
/// machine's memory; an ordinary PDF reads fine under the same cap.
#[test]
fn the_child_stops_at_its_memory_cap() {
    let dir = std::env::temp_dir().join(format!("aidp-pdf-child-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let cap = 16 * 1024 * 1024;

    let (ok, text) = run_child(&dir, "small", &pdf("Plain page", 0), cap);
    assert!(ok, "a small PDF fails under the cap");
    assert!(text.unwrap().contains("Plain page"));

    let bomb = pdf("Bomb", 48 * 1024 * 1024);
    assert!(bomb.len() < 1024 * 1024, "the bomb is small on disk");
    let (ok, _) = run_child(&dir, "bomb", &bomb, cap);
    assert!(!ok, "the child unpacked 48 MB under a 16 MB cap");

    let _ = std::fs::remove_dir_all(&dir);
}
