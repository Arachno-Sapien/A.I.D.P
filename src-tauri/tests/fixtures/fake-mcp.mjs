// A tiny MCP server for tests. argv[2] === "silent": never answers;
// "slowinit": answers initialize after 600 ms.
import { createInterface } from "node:readline";
const mode = process.argv[2];
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
process.stdout.write("fake server starting\n"); // junk on stdout, on purpose
process.stderr.write("log line on stderr\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (mode === "silent" || m.id === undefined) return;
  const ok = (result) => send({ jsonrpc: "2.0", id: m.id, result });
  if (m.method === "initialize" && mode === "slowinit")
    return void setTimeout(() => ok({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } }), 600);
  if (m.method === "initialize")
    return ok({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } });
  if (m.method === "tools/list")
    return ok({ tools: [
      { name: "echo", description: "Returns its text.", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
      { name: "slow", description: "Never answers.", inputSchema: { type: "object" } },
      { name: "die", description: "Exits.", inputSchema: { type: "object" } },
      { name: "bad.name", description: "Skipped.", inputSchema: { type: "object" } },
    ] });
  if (m.method === "tools/call") {
    const { name, arguments: args } = m.params;
    // With png: true, a screenshot-like image follows the text (the PNG signature).
    if (name === "echo") return ok({ content: [{ type: "text", text: String(args?.text ?? "") }, ...(args?.png ? [{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" }] : [])], isError: false });
    if (name === "die") { process.stderr.write("fatal: asked to die\n"); process.exit(3); }
    if (name === "slow") return;
  }
  send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } });
});

