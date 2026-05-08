# Code Viewer v0.2 — Editing + View Controls

**Date:** 2026-05-07
**Status:** Approved, ready for implementation planning.

## Problem

v0.1 ships a read-only viewer for non-markdown files plus a sortable CSV table. After using it, the user wants two things:

1. **Edit files inline.** When they spot a typo or want to tweak a line, they shouldn't have to context-switch back to the terminal. They want the experience of "click a file in VS Code" — a real editor.
2. **Manipulate the CSV view.** Column widths are currently fixed by content (`width: max-content`); long values stretch their column off-screen and there's no way to compress them or expand a narrow one.

The user's existing workflow (Claude edits files via the Obsidian terminal; user views them in Obsidian) introduces a new risk once both sides can write: concurrent edits. The design must handle this case explicitly rather than letting writes stomp each other silently.

## Goals

- CodeView becomes a real editor: typing works, `Cmd/Ctrl+S` writes to disk, syntax highlighting and theme stay.
- CSV view supports draggable column resizers in table mode.
- CSV view gets a "switch to text" toggle for full-file editing (raw CSV text in a CodeMirror editor); switching back re-parses to table.
- Concurrent edits are handled by a conflict modal — never silently overwritten.
- A word-wrap toggle is added to CodeView's header (useful for long lines in code or text-mode CSV).

## Non-goals

- **No in-cell CSV editing.** Editing CSV happens via text-mode toggle. Cell-edit-with-quote-preservation is its own product; not now.
- **No persisted column widths or view mode.** Closing and reopening a file resets to defaults (table mode, content-fit columns).
- **No diff view, no git, no LSP/IntelliSense, no multi-file ops.** This stays a single-file viewer/editor.
- **No new file-format support.** Editing applies to the file types already registered in v0.1.
- **No format-on-save, no autocomplete, no linting.** CM6's defaults (multi-cursor, undo/redo, search) come for free; we do not extend them.

## High-level approach

Three changes to existing views plus two new small modules. No new top-level architecture.

1. **CodeView**: remove read-only flags, wire CM6 doc changes to `this.requestSave()`, override `save()` to push the editor's text to the file, intercept `setViewData` to detect external-modify-while-dirty and route through a conflict modal.
2. **CsvView**: introduce a `mode: "table" | "text"` state. Table mode keeps today's render plus column-resize handles. Text mode mounts a CM6 `EditorView` over the raw CSV text with the same save + conflict semantics as CodeView. Mode toggle lives in the view's action header.
3. **Conflict modal** (new file): a 3-button modal — *Keep yours / Reload from disk / Cancel* — returning a discriminated-union result.
4. **Column resizer** (new file): pure helper that takes a `<table>` and a width-state map, attaches drag handles to its `<th>`s, and updates inline widths on drag.
5. **Word-wrap toggle**: a header action button on CodeView that flips a CM6 compartment between `EditorView.lineWrapping` and `[]`.

## Component design

### `src/views/CodeView.ts` (modified)

Changes from v0.1:

- **Editor extensions** drop `EditorState.readOnly.of(true)` and `EditorView.editable.of(false)`. The editor is fully interactive.
- A new compartment `wrapCompartment` holds either `EditorView.lineWrapping` (default) or `[]`.
- A new `EditorView.updateListener.of` watches for `update.docChanged && !update.transactions.some(t => t.annotation(Transaction.remote))` and calls `this.requestSave()` (TextFileView debounces this; we don't need our own).
- `getViewData()` returns the editor's current `state.doc.toString()` (not the cached `currentText`).
- `setViewData(data, clear)` becomes the conflict gate. If the new data differs from the editor's current doc AND the user has unsaved changes (`this.dirty` per Obsidian's flag), open the conflict modal:
  - **Keep yours** → ignore `data`, keep editor as-is, mark dirty (so a save will overwrite the disk version with the user's).
  - **Reload from disk** → replace the editor doc with `data`, clear dirty.
  - **Cancel** → same as Keep yours but don't write back; user is on notice that disk is ahead.
  When not dirty, replace the doc as today (preserving scroll, applying language).
- New header action via `this.addAction("wrap-text", "Toggle word wrap", () => …)` flips the wrap compartment.
- Save path: `TextFileView` already routes saves through `this.save()`; we override it to call `this.app.vault.modify(this.file, this.getViewData())`. Standard pattern.
- The existing language-loader race fix (token-based cancellation) and binary/too-large placeholders stay. When showing a placeholder, the editor goes back into a transient read-only state (a second compartment, `editableCompartment`, holding `EditorView.editable.of(false)`) so the user can't accidentally type into the "this file is binary" message.

### `src/views/CsvView.ts` (modified)

Changes from v0.1:

- New private state: `mode: "table" | "text"` (default `"table"`), `columnWidths: Map<number, number>` (only used in table mode), and an embedded `EditorView | null` for text mode.
- `setViewData(data, clear)` is split:
  - **Table mode**: re-parse, render the table, reapply any existing column widths whose column indices still exist (post-header-change clears the map). External-modify-while-table-mode does not need a conflict modal because table mode is read-only.
  - **Text mode**: route data through the CM6 editor with the same conflict semantics as CodeView.
- New header actions:
  - "Edit as text" / "View as table" — flips `mode`, tears down/reconstructs the appropriate UI.
  - The mode toggle is the only action in the header. The plugin uses `this.addAction(icon, tooltip, callback)` per Obsidian convention.
- `render()` is renamed to `renderTable()`. A new `renderText()` mounts a CM6 `EditorView` with: line numbers, fold gutter, search, default keymap, our Obsidian theme, and an `updateListener` → `requestSave()`. No CSV language pack — CSV doesn't have one we want; plain text is fine and matches VS Code.
- `save()` override: writes `this.editor.state.doc.toString()` back to disk in text mode; in table mode there's nothing to save (read-only) and `requestSave` is never triggered.
- Switching `table → text` uses `this.rawText` as the editor seed.
- Switching `text → table` reads the editor's current text, calls `parseCsv(text)`, and re-renders the table. If the user had unsaved text-mode edits, switching to table mode does NOT auto-save; the dirty state persists. This is intentional — the user is responsible for Cmd+S.
- Sort and column widths reset on header change (existing v0.1.1 behavior); preserved otherwise.

### `src/conflict/ConflictModal.ts` (new)

A small `Modal` subclass:

```
class ConflictModal extends Modal {
  constructor(app, fileName: string, onResolve: (r: "keep" | "reload" | "cancel") => void)
  onOpen() — renders title "External change to <fileName>",
             body explaining the situation,
             three buttons. Each button calls onResolve and this.close().
  onClose() — if the modal is dismissed without a button, resolve("cancel").
}
```

It returns the choice via callback; views await a wrapping `showConflictModal(app, file): Promise<Result>` helper exported from the same file.

### `src/views/columnResize.ts` (new)

Pure DOM helper:

```
attachColumnResize(table: HTMLTableElement, widths: Map<number, number>, onChange: () => void): void
```

For each `<th>`, it appends a `<div class="csv-viewer-col-resizer">` absolutely positioned at the right edge. Mousedown on the handle starts a `pointermove` listener that updates `widths.set(colIndex, newPx)` and the th's inline `style.width` live. On `pointerup`, it calls `onChange` (the view re-applies widths to all `<td>`s in that column to keep the table consistent).

Persistence is a non-goal; the widths Map lives only as long as the view does.

### Word-wrap toggle

Header action on CodeView only. Default ON (line-wrapping). When toggled OFF, removes wrapping → horizontal scroll. State is per-view-instance, not persisted.

## Data flow (new bits)

```
User types in CodeView
  → CM6 docChanged
  → updateListener fires this.requestSave()
  → TextFileView debounces, eventually calls this.save()
  → save() → vault.modify(file, getViewData())
  → vault fires its own modify event back
  → setViewData(newData) — gated by dirty check, but echo from our own save isn't dirty by then
  → no-op or reapply doc

External change while CodeView is dirty
  → Obsidian's TextFileView calls setViewData(newDiskData)
  → CodeView.setViewData detects dirty + diff
  → ConflictModal.show()
  → user picks an option
  → branch accordingly

User clicks "Edit as text" in CsvView
  → mode flips to "text"
  → contentEl.empty(), mount CM6 editor with rawText
  → editing flows through requestSave like CodeView
  → user clicks "View as table" → parseCsv(editor text) → renderTable()
```

## Error handling

- **Save fails (vault.modify rejects)**: `Notice("Code Viewer: failed to save <name>: <err>")`. Editor stays dirty so a retry on next save attempts again.
- **Conflict modal dismissed without choice (e.g. Esc)**: treated as Cancel — same as Keep yours but no auto-save. Editor remains dirty; user has the choice next time they save or the file changes again.
- **Switching CSV table→text after a cell click in flight**: pointermove handlers from in-progress resize get torn down with the table DOM; no global listeners survive a mode change.
- **Editing a binary or oversize file**: editor stays in read-only mode (the `editableCompartment` is configured `editable: false`) and shows the existing placeholder. Save is a no-op in this state.
- **Cmd+S in CSV table mode**: nothing to do; ignore.

## Testing

Existing tests still run (parseCsv, languageMap). New behavior is view-coupled and not unit-testable without an Obsidian harness; we add manual smoke checks to the README:

- Edit a `.py` file, Cmd+S, verify disk content matches.
- Edit a file, then `echo "x" >> sample.py` from the terminal mid-edit, verify the conflict modal appears and each branch behaves correctly.
- Drag the right edge of a CSV column header, verify column shrinks/grows live and `<td>`s align.
- Click "Edit as text" on a CSV, verify CM6 editor appears with raw text; edit + Cmd+S; click "View as table"; verify edits show in the parsed table.
- Toggle word-wrap on a long-line code file; verify behavior.
- Open a binary file (e.g. an image renamed to `.txt`); verify the placeholder shows and typing does nothing.

## Out of scope (explicit)

- In-cell CSV editing.
- Persisted column widths.
- Persisted CSV view-mode preference.
- Multiple-file refactors / find-and-replace across files.
- Format-on-save, autocomplete, linting.
- LSP/IntelliSense.
- Diff view, merge UI beyond the 3-button conflict modal.

## File map

```
my-obsidian-plugin/
  src/
    main.ts                            (unchanged)
    views/
      CodeView.ts                      (modified — editable + conflict + wrap)
      CsvView.ts                       (modified — mode toggle + resize + text editor)
      columnResize.ts                  (new — drag-handle helper)
    conflict/
      ConflictModal.ts                 (new — 3-button modal + helper)
    csv/parseCsv.ts                    (unchanged)
    language/                          (unchanged)
    settings/                          (unchanged)
  styles.css                           (additions for column resize handles + mode-toggle button)
  README.md                            (updated smoke test matrix)
```
