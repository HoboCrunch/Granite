# Code Viewer v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make CodeView fully editable with Cmd/Ctrl+S save, give CsvView a table↔text mode toggle plus draggable column resizers, and route concurrent edits through a conflict modal.

**Architecture:** Two new small modules (a 3-button conflict modal and a pure DOM column-resize helper). Existing `CodeView` loses its read-only flags and gains editing, save, conflict-guard, and a word-wrap toggle. Existing `CsvView` gains a `mode: "table" | "text"` state, with table mode adding column resizers and text mode mounting an embedded CM6 editor.

**Tech Stack:** Same as v0.1 — TypeScript, esbuild, Obsidian plugin API, CodeMirror 6.

**Spec:** `docs/superpowers/specs/2026-05-07-editing-and-view-controls-design.md`

**Background notes for the executor:**

- `TextFileView` (Obsidian) provides `data: string`, `dirty: boolean`, `requestSave(): void`, and a default `save(clear?: boolean): Promise<void>` that calls `getViewData()` and writes via `vault.modify`. We don't need to override `save` if `getViewData` returns the right thing.
- The default flow when the user types: CM6 fires a docChanged event → our updateListener calls `this.requestSave()` → TextFileView marks `dirty = true` and debounces → eventually calls our `save()` (default implementation) → vault writes file → vault fires its own modify event → Obsidian routes back to `this.setViewData(diskText, false)`. So `setViewData` will be called with our own just-written content. We must not treat that as an external change.
- The cleanest "is this our echo?" check is: if the incoming `data` equals `this.editor.state.doc.toString()`, it's a no-op (or our echo) and we can return early.
- The dirty/conflict trigger is: `data !== editor.doc.toString() && this.dirty === true`.
- For the conflict modal we don't need to await it before returning from `setViewData`; we resolve the modal via Promise and react when the user clicks. `setViewData` can fire-and-forget.

---

## File Structure (delta from v0.1)

```
my-obsidian-plugin/
  src/
    conflict/
      ConflictModal.ts         (NEW)
    views/
      CodeView.ts              (MODIFIED — substantial)
      CsvView.ts               (MODIFIED — substantial)
      columnResize.ts          (NEW)
  styles.css                   (MODIFIED — add resize handle + mode button styles)
  README.md                    (MODIFIED — smoke test additions)
```

---

## Task 1: ConflictModal

**Files:**
- Create: `src/conflict/ConflictModal.ts`

- [ ] **Step 1: Implement the modal**

```ts
import { App, Modal } from "obsidian";

export type ConflictChoice = "keep" | "reload" | "cancel";

class ConflictModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private fileName: string,
    private onResolve: (choice: ConflictChoice) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(`External change to ${this.fileName}`);
    contentEl.empty();
    contentEl.createEl("p", {
      text:
        "This file changed on disk while you had unsaved edits. " +
        "Choose how to resolve:",
    });

    const buttons = contentEl.createDiv({ cls: "code-viewer-conflict-buttons" });

    const keepBtn = buttons.createEl("button", { text: "Keep yours" });
    keepBtn.addClass("mod-warning");
    keepBtn.addEventListener("click", () => this.resolve("keep"));

    const reloadBtn = buttons.createEl("button", { text: "Reload from disk" });
    reloadBtn.addClass("mod-cta");
    reloadBtn.addEventListener("click", () => this.resolve("reload"));

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.resolve("cancel"));
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolved = true;
      this.onResolve("cancel");
    }
    this.contentEl.empty();
  }

  private resolve(choice: ConflictChoice): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onResolve(choice);
    this.close();
  }
}

export function showConflictModal(app: App, fileName: string): Promise<ConflictChoice> {
  return new Promise((resolve) => {
    const modal = new ConflictModal(app, fileName, resolve);
    modal.open();
  });
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/conflict/ConflictModal.ts
git commit -m "Add ConflictModal for concurrent-edit resolution"
```

---

## Task 2: Column resize helper

**Files:**
- Create: `src/views/columnResize.ts`

- [ ] **Step 1: Implement helper**

```ts
const MIN_COL_PX = 40;

export function attachColumnResize(
  table: HTMLTableElement,
  widths: Map<number, number>,
): void {
  const ths = Array.from(table.tHead?.rows[0]?.cells ?? []);
  ths.forEach((th, idx) => {
    const stored = widths.get(idx);
    if (stored !== undefined) th.style.width = `${stored}px`;

    const handle = document.createElement("div");
    handle.className = "csv-viewer-col-resizer";
    th.appendChild(handle);

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = th.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const next = Math.max(MIN_COL_PX, Math.round(startWidth + delta));
        th.style.width = `${next}px`;
        widths.set(idx, next);
        applyToBody(table, idx, next);
      };

      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  });
}

function applyToBody(table: HTMLTableElement, colIdx: number, px: number): void {
  const rows = table.tBodies[0]?.rows ?? [];
  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r].cells[colIdx];
    if (cell) cell.style.width = `${px}px`;
  }
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/views/columnResize.ts
git commit -m "Add column resize helper for CSV table view"
```

---

## Task 3: CodeView — editable, save, conflict guard, word-wrap toggle

**Files:**
- Modify: `src/views/CodeView.ts` (full rewrite)

- [ ] **Step 1: Replace `src/views/CodeView.ts` with the new version**

```ts
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
      if (update.docChanged && !this.placeholderActive) {
        this.data = update.state.doc.toString();
        this.requestSave();
      }
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

    if (this.dirty && !this.placeholderActive && !this.conflictOpen && data !== currentDoc) {
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
```

- [ ] **Step 2: Verify typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean. 16/16 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/views/CodeView.ts
git commit -m "Make CodeView editable with save, conflict guard, and wrap toggle"
```

---

## Task 4: CsvView — mode toggle, column resize, text-mode editor, save

**Files:**
- Modify: `src/views/CsvView.ts` (full rewrite)

- [ ] **Step 1: Replace `src/views/CsvView.ts` with the new version**

```ts
import { Notice, TextFileView, type WorkspaceLeaf } from "obsidian";
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

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return CSV_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.name ?? "CSV Viewer";
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
      if (this.dirty && !this.conflictOpen && data !== currentDoc) {
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
    } else {
      this.mode = "table";
      if (this.modeAction) this.modeAction.setAttribute("aria-label", "Edit as text");
      const text = this.editor?.state.doc.toString() ?? this.data ?? "";
      this.teardownEditor();
      this.data = text;
      this.parsed = parseCsv(text);
      this.sort = { column: -1, dir: null };
      this.columnWidths.clear();
      this.renderTable();
    }
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
      if (update.docChanged) {
        this.data = update.state.doc.toString();
        this.requestSave();
      }
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
```

NOTE on header click vs resize click: when the user clicks the resize handle, the click event still bubbles to the `<th>`. The check `(e.target as HTMLElement).classList.contains("csv-viewer-col-resizer")` short-circuits sort cycling for resize-handle clicks.

NOTE on `Notice` import: the import is included for parity with CodeView even though this file doesn't currently emit notices. If your linter flags it, remove the import.

- [ ] **Step 2: Remove the unused Notice import if linter complains, otherwise keep it**

Quick check: search the file for `new Notice(`. If zero hits, change `import { Notice, TextFileView, ... }` to `import { TextFileView, ... }`.

- [ ] **Step 3: Verify typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean. 16/16 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/CsvView.ts
git commit -m "Add CsvView mode toggle (table/text), column resize, and text-mode editing"
```

---

## Task 5: Styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Read the current `styles.css`**

Already exists from v0.1. Append the new rules.

- [ ] **Step 2: Append these rules to `styles.css`**

```css

/* v0.2 — column resize handles */
.csv-viewer-table th {
  position: relative;
}

.csv-viewer-th-label {
  display: inline-block;
  pointer-events: none;
}

.csv-viewer-col-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  background-color: transparent;
  transition: background-color 0.1s ease;
}

.csv-viewer-col-resizer:hover,
.csv-viewer-col-resizer:active {
  background-color: var(--text-accent);
  opacity: 0.4;
}

/* v0.2 — conflict modal */
.code-viewer-conflict-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.code-viewer-conflict-buttons button {
  padding: 6px 12px;
}

/* v0.2 — CSV text mode editor sizing */
.csv-viewer .cm-editor {
  height: 100%;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "Style column resize handles and conflict modal"
```

---

## Task 6: README + final verification

**Files:**
- Modify: `README.md` (append new smoke checks)

- [ ] **Step 1: Read current README.md**

The existing "Manual smoke test matrix" section ends with the bullet about disabling `.py` extension. Add new bullets for v0.2 features under that same section.

- [ ] **Step 2: Append new smoke checks**

Find the line that ends the existing matrix (the last `- [ ]` bullet). Insert the following bullets immediately before the "## Limits" section:

```markdown
- [ ] Edit a code file in Obsidian, press Cmd/Ctrl+S, verify the file on disk has the new content.
- [ ] Edit a code file (don't save), then run `echo "" >> sample.py` from a terminal — verify the conflict modal appears with three buttons; each button behaves correctly.
- [ ] In a CSV file, drag the right edge of a column header — column should resize live; matching `<td>` cells should follow.
- [ ] Click the "Edit as text" action (pencil icon) in a CSV's header — the table should disappear and a CodeMirror editor should appear with the raw CSV text. Edit, Cmd/Ctrl+S, click the action again to return to table view; verify edits show.
- [ ] Click the "Toggle word wrap" action in a code file with long lines — the editor should switch between wrapping and horizontal-scroll.
- [ ] Open a binary file (e.g. an image renamed to `.txt`) — the placeholder appears and typing does nothing.
```

- [ ] **Step 3: Final verification — typecheck, tests, build, install to vault**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean.

Then copy the updated artifacts into the user's installed plugin folder:
```bash
VAULT="/Users/evansteinhilv/obsidian-vault/civic-informer"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/code-viewer/"
ls -la "$VAULT/.obsidian/plugins/code-viewer/"
```

Expected: three files updated with current timestamps.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document v0.2 smoke checks; install build into civic-informer vault"
```

(The vault copy isn't tracked by git — only the README change.)

- [ ] **Step 5: Final report**

Print:
```
v0.2 ready. Reload Obsidian (Cmd+R) on the civic-informer vault to pick up:
- editable CodeView with Cmd+S save and conflict guard
- CsvView table↔text mode toggle (pencil icon in header)
- draggable column resizers in CSV table mode
- word-wrap toggle in CodeView header
```

---

## Notes for the executor

- **Order matters.** Tasks 1 and 2 are independent. Task 3 imports from Task 1. Task 4 imports from Tasks 1, 2. Task 5 styles need handles (Task 2) and modal buttons (Task 1). Task 6 verifies the whole thing.
- **No new tests in this round** — all changes are view-coupled. The 16 existing unit tests must still pass after every task.
- **Conflict modal is fire-and-forget** from `setViewData` — don't await; the view returns immediately and the user resolves at their own pace.
- **`this.dirty` is set by `requestSave()`** (Obsidian's internal). After save completes, it goes false. So the conflict check `if (this.dirty && data !== currentDoc)` is the right gate.
- **Don't break v0.1 fixes.** The language-loader race fix (token-based cancellation) and the CSV-sort-on-reload fix (header diff) must survive the rewrite. Both are preserved in the code shown above; verify after copy-paste.
