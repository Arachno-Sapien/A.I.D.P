import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import { unifiedMergeView } from "@codemirror/merge";

export interface CreateStateOptions {
  /** Called with the editor's new state after every edit or selection change. */
  onUpdate?: (state: EditorState, docChanged: boolean) => void;
  onSave?: () => void;
}

export const themeCompartment = new Compartment();

export function themeExtension(theme: "dark" | "light"): Extension {
  return theme === "dark" ? oneDark : [];
}

export function setEditorTheme(
  view: EditorView,
  theme: "dark" | "light",
): void {
  view.dispatch({
    effects: themeCompartment.reconfigure(themeExtension(theme)),
  });
}

export function createState(
  doc: string,
  filename: string,
  options: CreateStateOptions = {},
  theme: "dark" | "light" = "dark",
): EditorState {
  const languageCompartment = new Compartment();

  const extensions: Extension[] = [
    basicSetup,
    themeCompartment.of(themeExtension(theme)),
    languageCompartment.of([]),
  ];

  if (options.onUpdate) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          options.onUpdate?.(update.state, update.docChanged);
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
  theme: "dark" | "light" = "dark",
): EditorView {
  const state = EditorState.create({
    doc: proposed,
    extensions: [
      basicSetup,
      themeCompartment.of(themeExtension(theme)),
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
