#[derive(Default, Debug)]
pub struct SseLines {
    buffer: Vec<u8>,
}

impl SseLines {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut results = Vec::new();

        while let Some(pos) = self.buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = self.buffer.drain(..=pos).collect::<Vec<u8>>();
            let mut line = &line_bytes[..line_bytes.len() - 1];
            if let Some(stripped) = line.strip_suffix(b"\r") {
                line = stripped;
            }
            if line.starts_with(b"data:") {
                let payload_bytes = &line[5..];
                let payload_bytes = if payload_bytes.starts_with(b" ") {
                    &payload_bytes[1..]
                } else {
                    payload_bytes
                };
                results.push(String::from_utf8_lossy(payload_bytes).into_owned());
            }
        }

        results
    }

    pub fn finish(self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }
        let mut line = self.buffer.as_slice();
        if let Some(stripped) = line.strip_suffix(b"\r") {
            line = stripped;
        }
        if line.starts_with(b"data:") {
            let payload_bytes = &line[5..];
            let payload_bytes = if payload_bytes.starts_with(b" ") {
                &payload_bytes[1..]
            } else {
                payload_bytes
            };
            Some(String::from_utf8_lossy(payload_bytes).into_owned())
        } else {
            None
        }
    }
}

#[derive(Default, Debug)]
pub struct JsonLines {
    buffer: Vec<u8>,
}

impl JsonLines {
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.buffer.extend_from_slice(chunk);
        let mut results = Vec::new();

        while let Some(pos) = self.buffer.iter().position(|&b| b == b'\n') {
            let line_bytes = self.buffer.drain(..=pos).collect::<Vec<u8>>();
            let mut line = &line_bytes[..line_bytes.len() - 1];
            if let Some(stripped) = line.strip_suffix(b"\r") {
                line = stripped;
            }
            if !line.is_empty() {
                results.push(String::from_utf8_lossy(line).into_owned());
            }
        }

        results
    }

    pub fn finish(self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }
        let mut line = self.buffer.as_slice();
        if let Some(stripped) = line.strip_suffix(b"\r") {
            line = stripped;
        }
        if !line.is_empty() {
            Some(String::from_utf8_lossy(line).into_owned())
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_lines_split() {
        let mut jl = JsonLines::default();
        // chunk split mid-line, \r\n, empty lines skipped
        let r1 = jl.push(b"{\"a\":1}\r\n\r\n{\"b\":");
        assert_eq!(r1, vec!["{\"a\":1}"]);

        let r2 = jl.push(b"2}\n\n{\"c\":3}");
        assert_eq!(r2, vec!["{\"b\":2}"]);

        let r3 = jl.finish();
        assert_eq!(r3, Some("{\"c\":3}".to_string()));
    }

    #[test]
    fn one_chunk_two_events() {
        let mut p = SseLines::default();
        assert_eq!(p.push(b"data: a\n\ndata: b\n\n"), vec!["a", "b"]);
    }

    #[test]
    fn line_split_across_chunks() {
        let mut p = SseLines::default();
        assert!(p.push(b"data: {\"x\":").is_empty());
        assert_eq!(p.push(b"1}\n\n"), vec!["{\"x\":1}"]);
    }

    #[test]
    fn utf8_split_across_chunks() {
        let bytes = "data: héllo 👋\n".as_bytes();
        let cut = bytes.len() - 3; // inside the 4-byte emoji
        let mut p = SseLines::default();
        assert!(p.push(&bytes[..cut]).is_empty());
        assert_eq!(p.push(&bytes[cut..]), vec!["héllo 👋"]);
    }

    #[test]
    fn crlf_comments_and_other_fields_are_ignored() {
        let mut p = SseLines::default();
        assert_eq!(p.push(b": keep-alive\r\nevent: x\r\ndata: ok\r\n\r\n"), vec!["ok"]);
    }

    #[test]
    fn done_marker_is_passed_through() {
        let mut p = SseLines::default();
        assert_eq!(p.push(b"data: [DONE]\n\n"), vec!["[DONE]"]);
    }

    #[test]
    fn finish_returns_unterminated_data_line() {
        let mut p = SseLines::default();
        assert!(p.push(b"data: tail").is_empty());
        assert_eq!(p.finish(), Some("tail".to_string()));
    }
}
