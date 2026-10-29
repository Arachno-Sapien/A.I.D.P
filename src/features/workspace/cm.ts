import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import { unifiedMergeView } from "@codemirror/merge";

export interface CreateStateOptions {
  onChange?: (text: string) => void;
  onSave?: () => void;
}

export function createState(
  doc: string,
  filename: string,
  options: CreateStateOptions = {},
): EditorState {
  const languageCompartment = new Compartment();

  const extensions: Extension[] = [
    basicSetup,
    oneDark,
    languageCompartment.of([]),
  ];

  if (options.onChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          options.onChange?.(update.state.doc.toString());
        }
      }),
    );
  }

  if (options.onSave) {
    extensions.push(
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            options.onSave?.();
            return true;
          },
        },
      ]),
    );
  }

  const langDesc = LanguageDescription.matchFilename(languages, filename);
  if (langDesc?.support) {
    extensions.push(languageCompartment.of(langDesc.support));
  }

  return EditorState.create({
    doc,
    extensions,
  });
}

export function mountView(parent: HTMLElement, state: EditorState): EditorView {
  return new EditorView({
    state,
    parent,
  });
}

export function mountDiff(
  parent: HTMLElement,
  original: string,
  proposed: string,
): EditorView {
  const state = EditorState.create({
    doc: proposed,
    extensions: [
      basicSetup,
      oneDark,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      unifiedMergeView({ original, mergeControls: false }),
    ],
  });

  return new EditorView({
    state,
    parent,
  });
}

