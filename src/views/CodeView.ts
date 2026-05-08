import { TextFileView, type WorkspaceLeaf, type TFile } from "obsidian";
import { EditorState, type Extension, Compartment } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap } from "@codemirror/view";
import { bracketMatching, foldGutter, indentOnInput, foldKeymap } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { getLanguageLoader } from "../language/languageMap";
import { obsidianTheme } from "../language/obsidianTheme";

export const CODE_VIEW_TYPE = "code-viewer";

export class CodeView extends TextFileView {
  private editor: EditorView | null = null;
  private languageCompartment = new Compartment();
  private currentText = "";
  private currentExt = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return CODE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.name ?? "Code Viewer";
  }

  getIcon(): string {
    return "file-code";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("code-viewer");

    const baseExtensions: Extension[] = [
      lineNumbers(),
      foldGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      bracketMatching(),
      indentOnInput(),
      highlightSelectionMatches(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap]),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      this.languageCompartment.of([]),
      obsidianTheme(),
    ];

    this.editor = new EditorView({
      state: EditorState.create({ doc: this.currentText, extensions: baseExtensions }),
      parent: this.contentEl,
    });
  }

  async onClose(): Promise<void> {
    this.editor?.destroy();
    this.editor = null;
  }

  override async onLoadFile(file: TFile): Promise<void> {
    this.currentExt = file.extension.toLowerCase();
    await super.onLoadFile(file);
  }

  getViewData(): string {
    return this.currentText;
  }

  setViewData(data: string, _clear: boolean): void {
    this.currentText = data;

    if (!this.editor) return;

    const isBinary = looksBinary(data);
    if (isBinary) {
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: BINARY_PLACEHOLDER },
      });
      this.editor.dispatch({ effects: this.languageCompartment.reconfigure([]) });
      return;
    }

    if (data.length > MAX_BYTES) {
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: tooLargeMessage(data.length) },
      });
      this.editor.dispatch({ effects: this.languageCompartment.reconfigure([]) });
      return;
    }

    const scrollTop = this.editor.scrollDOM.scrollTop;
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: data },
    });
    this.editor.scrollDOM.scrollTop = scrollTop;

    this.applyLanguage(this.currentExt);
  }

  clear(): void {
    this.currentText = "";
    if (this.editor) {
      this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: "" } });
      this.editor.dispatch({ effects: this.languageCompartment.reconfigure([]) });
    }
  }

  private async applyLanguage(ext: string): Promise<void> {
    const loader = getLanguageLoader(ext);
    if (!loader || !this.editor) return;
    try {
      const ext_ = await loader();
      if (!this.editor) return;
      this.editor.dispatch({ effects: this.languageCompartment.reconfigure(ext_) });
    } catch (err) {
      console.warn(`Code Viewer: failed to load language for .${ext}`, err);
    }
  }
}

const MAX_BYTES = 5 * 1024 * 1024;
const BINARY_PLACEHOLDER =
  "This file appears to be binary and can't be displayed.";

function tooLargeMessage(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `File too large to display (${mb} MB; 5 MB limit). Open it in your terminal.`;
}

function looksBinary(s: string): boolean {
  // Sample the first 8KB; if more than 1% of chars are NUL or replacement char, treat as binary.
  const sample = s.slice(0, 8192);
  if (sample.length === 0) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0 || c === 0xfffd) bad++;
  }
  return bad / sample.length > 0.01;
}
