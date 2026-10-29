export type ApplyProposalResult =
  | { ok: true; text: string }
  | { ok: false; reason: "selectionChanged" | "selectionAmbiguous" };

export function applyProposal(
  doc: string,
  selection: string | null,
  code: string,
): ApplyProposalResult {
  if (selection === null || selection === "") {
    let text = code;
    if (doc.endsWith("\n") && !code.endsWith("\n")) {
      text = code + "\n";
    }
    return { ok: true, text };
  }

  const firstIndex = doc.indexOf(selection);
  if (firstIndex === -1) {
    return { ok: false, reason: "selectionChanged" };
  }

  const secondIndex = doc.indexOf(selection, firstIndex + 1);
  if (secondIndex !== -1) {
    return { ok: false, reason: "selectionAmbiguous" };
  }

  const text =
    doc.slice(0, firstIndex) + code + doc.slice(firstIndex + selection.length);
  return { ok: true, text };
}
