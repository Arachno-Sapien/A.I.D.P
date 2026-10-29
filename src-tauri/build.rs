fn main() {
    // Test binaries get no app manifest, so Windows loads ComCtl32 v5 and they exit with 0xc0000139
    // (see .ai/memory/known-issues.md). MSVC-only: other linkers would read this flag as a file name.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
    tauri_build::build()
}
