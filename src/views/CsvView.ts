import { TextFileView, type WorkspaceLeaf } from "obsidian";
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
import { parseCsv, type ParsedCsv } from "../csv/parseCsv";
import { obsidianTheme } from "../language/obsidianTheme";
import { showConflictModal } from "../conflict/ConflictModal";
import { attachColumnResize } from "./columnResize";

export const CSV_VIEW_TYPE = "csv-viewer";

type SortDir = "asc" | "desc" | null;
type Mode = "table" | "text";
interface SortState { column: number; dir: SortDir; }

export class CsvView extends TextFileView {
  private mode: Mode = "table";
  private parsed: ParsedCsv = { headers: [], rows: [], rowCount: 0, truncated: false, errors: [] };
  private sort: SortState = { column: -1, dir: null };
  private columnWidths: Map<number, number> = new Map();
  private editor: EditorView | null = null;
  private wrapCompartment = new Compartment();
  private editableCompartment = new Compartment();
  private wrapEnabled = true;
  private conflictOpen = false;
  private modeAction: HTMLElement | null = null;
  private lastSavedText: string | null = null;
  private suppressNextChange = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return CSV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.name ?? "Granite";
  }

  getIcon(): string {
    return "table";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("csv-viewer");
    this.modeAction = this.addAction("pencil", "Edit as text", () => this.toggleMode());
  }

  async onClose(): Promise<void> {
    this.teardownEditor();
    this.contentEl.empty();
  }

  getViewData(): string {
    if (this.mode === "text" && this.editor) {
      return this.editor.state.doc.toString();
    }
    return this.data ?? "";
  }

  setViewData(data: string, _clear: boolean): void {
    if (this.mode === "text" && this.editor) {
      const currentDoc = this.editor.state.doc.toString();
      if (data === currentDoc) {
        this.data = data;
        return;
      }
      if (this.lastSavedText !== null && data === this.lastSavedText) {
        this.data = data;
        return;
      }
      if ((this as any).dirty && !this.conflictOpen && data !== currentDoc) {
        this.conflictOpen = true;
        const fileName = this.file?.name ?? "file";
        void showConflictModal(this.app, fileName).then((choice) => {
          this.conflictOpen = false;
          if (choice === "reload") {
            this.replaceEditorDoc(data);
            this.data = data;
          }
        });
        return;
      }
      this.replaceEditorDoc(data);
      this.data = data;
      return;
    }

    this.data = data;
    const prevHeaders = this.parsed.headers;
    this.parsed = parseCsv(data);

    if (!sameHeaders(prevHeaders, this.parsed.headers)) {
      this.sort = { column: -1, dir: null };
      this.columnWidths.clear();
    } else if (this.sort.column >= this.parsed.headers.length) {
      this.sort = { column: -1, dir: null };
    }
    this.renderTable();
  }

  clear(): void {
    this.data = "";
    this.parsed = { headers: [], rows: [], rowCount: 0, truncated: false, errors: [] };
    this.sort = { column: -1, dir: null };
    this.columnWidths.clear();
    this.teardownEditor();
    this.contentEl.empty();
  }

  private toggleMode(): void {
    if (this.mode === "table") {
      this.mode = "text";
      if (this.modeAction) this.modeAction.setAttribute("aria-label", "View as table");
      this.renderText();
      this.lastSavedText = this.data ?? "";
    } else {
      this.mode = "table";
      if (this.modeAction) this.modeAction.setAttribute("aria-label", "Edit as text");
      const text = this.editor?.state.doc.toString() ?? this.data ?? "";
      this.teardownEditor();
      this.lastSavedText = null;
      this.data = text;
      this.parsed = parseCsv(text);
      this.sort = { column: -1, dir: null };
      this.columnWidths.clear();
      this.renderTable();
    }
  }

  override async save(clear?: boolean): Promise<void> {
    if (this.mode === "text" && this.editor) {
      this.lastSavedText = this.editor.state.doc.toString();
    } else {
      this.lastSavedText = this.data ?? "";
    }
    await super.save(clear);
  }

  private renderTable(): void {
    this.teardownEditor();
    this.contentEl.empty();

    if (this.parsed.errors.length > 0) {
      const banner = this.contentEl.createDiv({ cls: "csv-viewer-banner csv-viewer-warning" });
      banner.setText(`Parse warnings: ${this.parsed.errors.join("; ")}`);
    }

    if (this.parsed.truncated) {
      const banner = this.contentEl.createDiv({ cls: "csv-viewer-banner" });
      banner.setText(
        `Showing first ${this.parsed.rows.length.toLocaleString()} of ${this.parsed.rowCount.toLocaleString()} rows.`,
      );
    }

    if (this.parsed.headers.length === 0) {
      this.contentEl.createDiv({ cls: "csv-viewer-empty", text: "Empty CSV." });
      return;
    }

    const wrapper = this.contentEl.createDiv({ cls: "csv-viewer-table-wrapper" });
    const table = wrapper.createEl("table", { cls: "csv-viewer-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    this.parsed.headers.forEach((h, idx) => {
      const th = headerRow.createEl("th");
      th.createSpan({ text: h, cls: "csv-viewer-th-label" });
      th.addClass("csv-viewer-th");
      if (this.sort.column === idx && this.sort.dir) {
        th.addClass(`csv-viewer-sort-${this.sort.dir}`);
      }
      const stored = this.columnWidths.get(idx);
      if (stored !== undefined) th.style.width = `${stored}px`;
      th.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("csv-viewer-col-resizer")) return;
        this.cycleSort(idx);
      });
    });

    const tbody = table.createEl("tbody");
    const rows = this.sortedRows();
    for (const row of rows) {
      const tr = tbody.createEl("tr");
      row.forEach((cell, idx) => {
        const td = tr.createEl("td", { text: cell });
        const stored = this.columnWidths.get(idx);
        if (stored !== undefined) td.style.width = `${stored}px`;
      });
    }

    attachColumnResize(table, this.columnWidths);
  }

  private renderText(): void {
    this.contentEl.empty();
    const seed = this.data ?? "";

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (this.suppressNextChange) {
        this.suppressNextChange = false;
        return;
      }
      this.data = update.state.doc.toString();
      this.requestSave();
    });

    const exts: Extension[] = [
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
      this.wrapCompartment.of(this.wrapEnabled ? EditorView.lineWrapping : []),
      obsidianTheme(),
      updateListener,
    ];

    this.editor = new EditorView({
      state: EditorState.create({ doc: seed, extensions: exts }),
      parent: this.contentEl,
    });
  }

  private replaceEditorDoc(data: string): void {
    if (!this.editor) return;
    const scrollTop = this.editor.scrollDOM.scrollTop;
    this.suppressNextChange = true;
    this.editor.dispatch({
      changes: { from: 0, to: this.editor.state.doc.length, insert: data },
    });
    this.editor.scrollDOM.scrollTop = scrollTop;
  }

  private teardownEditor(): void {
    this.editor?.destroy();
    this.editor = null;
  }

  private cycleSort(column: number): void {
    if (this.sort.column !== column) {
      this.sort = { column, dir: "asc" };
    } else if (this.sort.dir === "asc") {
      this.sort.dir = "desc";
    } else if (this.sort.dir === "desc") {
      this.sort = { column: -1, dir: null };
    } else {
      this.sort = { column, dir: "asc" };
    }
    this.renderTable();
  }

  private sortedRows(): string[][] {
    if (this.sort.column < 0 || !this.sort.dir) return this.parsed.rows;
    const col = this.sort.column;
    const dir = this.sort.dir === "asc" ? 1 : -1;
    const copy = [...this.parsed.rows];
    copy.sort((a, b) => {
      const av = a[col] ?? "";
      const bv = b[col] ?? "";
      const an = Number(av);
      const bn = Number(bv);
      const bothNumeric = av !== "" && bv !== "" && !Number.isNaN(an) && !Number.isNaN(bn);
      if (bothNumeric) return (an - bn) * dir;
      return av.localeCompare(bv) * dir;
    });
    return copy;
  }
}

function sameHeaders(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
