import { Notice, TextFileView, type WorkspaceLeaf, type TFile } from "obsidian";
import { EditorState, type Extension, Compartment } from "@codemirror/state";
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
} from "@codemirror/view";
import { bracketMatching, foldGutter, indentOnInput, foldKeymap } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { getLanguageLoader } from "../language/languageMap";
import { obsidianTheme } from "../language/obsidianTheme";
import { showConflictModal } from "../conflict/ConflictModal";

export const CODE_VIEW_TYPE = "code-viewer";

const MAX_BYTES = 5 * 1024 * 1024;
const BINARY_SAMPLE_BYTES = 8192;
const BINARY_BAD_RATIO = 0.01;
const BINARY_PLACEHOLDER =
  "This file appears to be binary and can't be displayed.";

export class CodeView extends TextFileView {
  private editor: EditorView | null = null;
  private languageCompartment = new Compartment();
  private wrapCompartment = new Compartment();
  private editableCompartment = new Compartment();
  private currentExt = "";
  private applyToken = 0;
  private wrapEnabled = true;
  private placeholderActive = false;
  private conflictOpen = false;
  private lastSavedText: string | null = null;
  private suppressNextChange = false;

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

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (this.suppressNextChange) {
        this.suppressNextChange = false;
        return;
      }
      if (this.placeholderActive) return;
      this.data = update.state.doc.toString();
      this.requestSave();
    });

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
      this.editableCompartment.of(EditorView.editable.of(true)),
      this.wrapCompartment.of(EditorView.lineWrapping),
      this.languageCompartment.of([]),
      obsidianTheme(),
      updateListener,
    ];

    this.editor = new EditorView({
      state: EditorState.create({ doc: this.data ?? "", extensions: baseExtensions }),
      parent: this.contentEl,
    });

    this.addAction("wrap-text", "Toggle word wrap", () => this.toggleWrap());
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
    if (this.placeholderActive) return this.data ?? "";
    return this.editor?.state.doc.toString() ?? this.data ?? "";
  }

  setViewData(data: string, _clear: boolean): void {
    if (!this.editor) {
      this.data = data;
      return;
    }

    const currentDoc = this.editor.state.doc.toString();
    if (!this.placeholderActive && data === currentDoc) {
      this.data = data;
      return;
    }

    // Self-echo from our own vault.modify: disk now matches what we just wrote,
    // even if the user has typed more in the editor since. Don't treat as a conflict.
    if (!this.placeholderActive && this.lastSavedText !== null && data === this.lastSavedText) {
      this.data = data;
      return;
    }

    if ((this as any).dirty && !this.placeholderActive && !this.conflictOpen && data !== currentDoc) {
      this.conflictOpen = true;
      const fileName = this.file?.name ?? "file";
      void showConflictModal(this.app, fileName).then((choice) => {
        this.conflictOpen = false;
        if (choice === "reload") {
          this.replaceDoc(data);
          this.data = data;
        }
      });
      return;
    }

    this.replaceDoc(data);
    this.data = data;
  }

  clear(): void {
    this.data = "";
    if (this.editor) {
      this.placeholderActive = false;
      this.suppressNextChange = true;
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: "" },
        effects: [
          this.languageCompartment.reconfigure([]),
          this.editableCompartment.reconfigure(EditorView.editable.of(true)),
        ],
      });
    }
  }

  private replaceDoc(data: string): void {
    if (!this.editor) return;

    const isBinary = looksBinary(data);
    if (isBinary) {
      this.applyToken++;
      this.placeholderActive = true;
      this.suppressNextChange = true;
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: BINARY_PLACEHOLDER },
        effects: [
          this.languageCompartment.reconfigure([]),
          this.editableCompartment.reconfigure(EditorView.editable.of(false)),
        ],
      });
      return;
    }

    if (data.length > MAX_BYTES) {
      this.applyToken++;
      this.placeholderActive = true;
      this.suppressNextChange = true;
      this.editor.dispatch({
        changes: { from: 0, to: this.editor.state.doc.length, insert: tooLargeMessage(data.length) },
        effects: [
          this.languageCompartment.reconfigure([]),
          this.editableCompartment.reconfigure(EditorView.editable.of(false)),
        ],
      });
      return;
    }

    this.placeholderActive = false;
    const scrollTop = this.editor.scrollDOM.scrollTop;
    this.lastSavedText = data;
    this.suppressNextChange = true;
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: data },
      effects: this.editableCompartment.reconfigure(EditorView.editable.of(true)),
    });
    this.editor.scrollDOM.scrollTop = scrollTop;
    this.applyLanguage(this.currentExt);
  }

  private toggleWrap(): void {
    if (!this.editor) return;
    this.wrapEnabled = !this.wrapEnabled;
    this.editor.dispatch({
      effects: this.wrapCompartment.reconfigure(
        this.wrapEnabled ? EditorView.lineWrapping : [],
      ),
    });
    new Notice(`Code Viewer: word wrap ${this.wrapEnabled ? "on" : "off"}`);
  }

  override async save(clear?: boolean): Promise<void> {
    const text = this.editor?.state.doc.toString() ?? this.data ?? "";
    this.lastSavedText = text;
    await super.save(clear);
  }

  private async applyLanguage(ext: string): Promise<void> {
    const token = ++this.applyToken;
    const loader = getLanguageLoader(ext);
    if (!loader || !this.editor) {
      if (this.editor && token === this.applyToken) {
        this.editor.dispatch({ effects: this.languageCompartment.reconfigure([]) });
      }
      return;
    }
    try {
      const langExtension = await loader();
      if (!this.editor || token !== this.applyToken) return;
      this.editor.dispatch({ effects: this.languageCompartment.reconfigure(langExtension) });
    } catch (err) {
      console.warn(`Code Viewer: failed to load language for .${ext}`, err);
    }
  }
}

function tooLargeMessage(bytes: number): string {
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `File too large to display (${mb} MB; 5 MB limit). Open it in your terminal.`;
}

function looksBinary(s: string): boolean {
  const sample = s.slice(0, BINARY_SAMPLE_BYTES);
  if (sample.length === 0) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0 || c === 0xfffd) bad++;
  }
  return bad / sample.length > BINARY_BAD_RATIO;
}
