# Decision Record 0006: Use reqwest with native-tls

**Date:** 2026-10-29
**Status:** Accepted

---

## Context

The application communicates with cloud LLM providers over HTTPS. Reqwest was chosen as our async HTTP client. In reqwest 0.13, default TLS uses `rustls` backed by `aws-lc-rs`.

On Windows (our primary development and test platform), building `aws-lc-rs` requires CMake and NASM to be installed and available in the system PATH. This introduces substantial friction to the developer setup and increases binary size.

---

## Options Considered

1. **rustls + aws-lc-rs (reqwest default):**
   - *Pros:* Pure Rust / assembly, modern TLS 1.3 defaults.
   - *Cons:* Requires CMake and NASM on Windows machines; build fails without them; produces larger binaries.
2. **rustls + ring:**
   - *Pros:* Avoids CMake/NASM on some architectures.
   - *Cons:* Still bundles static cryptographic implementations; does not leverage the OS certificate store without extra dependencies (`webpki-roots` or `rustls-native-certs`).
3. **native-tls (Windows SChannel, macOS Secure Transport, Linux OpenSSL):**
   - *Pros:* Uses the host operating system's built-in TLS engine and native root certificate store (SChannel on Windows); requires no additional build tools (no CMake, no NASM); keeps the application binary small.
   - *Cons:* Relies on OS-provided TLS stack capabilities.

---

## Decision

We chose **`native-tls`** for `reqwest` by setting `default-features = false` and enabling `features = ["native-tls", "charset", "http2", "system-proxy", "json", "stream"]`.

1. **Clean Windows builds:** Developers need only the Visual Studio Build Tools and MSVC toolchain, without needing CMake or NASM.
2. **Native certificate trust:** Enterprise proxies and custom root certificates installed in Windows Certificate Manager are respected out of the box.
3. **Small footprint:** Leverages Windows SChannel (`schannel.dll`), keeping app size within our low-overhead target.

