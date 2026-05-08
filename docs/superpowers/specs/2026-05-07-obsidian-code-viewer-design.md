# Obsidian Code Viewer Plugin — Design

**Date:** 2026-05-07
**Status:** Approved, ready for implementation planning.

## Problem

The user works in an Obsidian vault that contains non-markdown files (`.js`, `.py`, `.sql`, `.csv`, `.html`, etc.) created or edited by Claude running in the Obsidian terminal. Obsidian itself has no viewer for these file types, so the user has no way to read them inside Obsidian — they show as "no view available" or open externally. The user wants to **view** these files in Obsidian with IDE-quality formatting, without leaving the workspace.

This plugin is **read-only by design**. Editing continues to happen in the terminal (or wherever Claude is operating). The plugin's job is to present the files clearly.

## Goals

- Click a non-markdown file in the Obsidian file explorer → it opens in a viewer with syntax highlighting and IDE niceties.
- Auto-refresh the view when the file changes on disk (Claude saves it from the terminal → user sees the new content immediately).
- Render `.csv` files as a styled, scrollable, sortable table rather than as raw text.
- Inherit Obsidian's light/dark theme so the viewer feels native.

## Non-goals

- **No editing.** The viewer is read-only. No save, no in-place edits.
- **No diffing, no Git integration, no LSP.** This is a viewer, not an IDE.
- **No support for `.md` or `.canvas`.** Those are owned by Obsidian core.
- **No support for image/audio/video extensions.** Those are owned by Obsidian core.
- **No pixel-perfect VSCode parity.** CodeMirror 6's highlighting is the target; we are not shipping TextMate grammars.

## High-level approach

A single Obsidian plugin (`main.ts`) that, on load, registers two Obsidian `FileView` subclasses against a configurable list of extensions:

1. **`CodeView`** — handles all text/code extensions. Uses CodeMirror 6 in read-only mode. Re-uses the CM6 instance Obsidian already bundles (no added bundle weight from the editor itself; only language packages are added).
2. **`CsvView`** — handles `.csv` only. Parses the file with [PapaParse](https://www.papaparse.com/) and renders a scrollable HTML table with sticky header and click-to-sort columns.

Both views extend Obsidian's `TextFileView` so they get vault file lifecycle (open, modify, close) for free, including the modify event needed for auto-reload.

## Component design

### `main.ts` — plugin entry

Responsibilities:
- On `onload()`, read settings, then call `registerView` and `registerExtensions` for each enabled extension.
- On `onunload()`, Obsidian automatically tears down registered views — no manual cleanup needed.
- Owns the settings tab (see Settings).

### `views/CodeView.ts`

A `TextFileView` that hosts a CodeMirror 6 `EditorView` configured read-only.

- `getViewType()` returns `"code-viewer"`.
- `getViewData()` / `setViewData()` use the file's text content.
- On `setViewData`, look up the language pack for the current extension via `languageMap.ts` (lazy import) and reconfigure the CM6 view.
- CM6 extensions used: `lineNumbers`, `highlightActiveLine`, `bracketMatching`, `foldGutter`, `search` (Cmd/Ctrl+F), `EditorState.readOnly.of(true)`, `EditorView.editable.of(false)`, syntax highlight from `@codemirror/language`, theme adapter that reads Obsidian CSS vars.
- On vault `modify` event for the open file: re-read content, preserve scroll position, replace doc.

### `views/CsvView.ts`

A `TextFileView` that renders a table.

- `getViewType()` returns `"csv-viewer"`.
- On `setViewData`, parse with PapaParse (`header: true`, `skipEmptyLines: true`, `dynamicTyping: false` — keep strings, simpler).
- Render: `<div class="csv-viewer">` containing a `<table>` with sticky `<thead>` and a virtualized or paginated `<tbody>` for large files.
  - **Virtualization decision:** v1 ships without virtualization. CSVs in this user's vault are expected to be small-to-medium; if performance is an issue we can add it later. Cap rendering at 10,000 rows with a "showing first 10,000 of N" banner; documented limit.
- Click a column header → sort ascending; click again → descending; click a third time → unsorted (original order).
- On vault `modify`: re-parse, re-render, attempt to preserve current sort.

### `language/languageMap.ts`

Maps a file extension to a CM6 `LanguageSupport` factory. Each entry uses dynamic `import()` so the language package only loads when a file of that type is opened.

Initial set:

| Extensions | CM6 package |
|---|---|
| `.js`, `.mjs`, `.cjs`, `.jsx` | `@codemirror/lang-javascript` |
| `.ts`, `.tsx` | `@codemirror/lang-javascript` (with `typescript: true`) |
| `.py` | `@codemirror/lang-python` |
| `.sql` | `@codemirror/lang-sql` |
| `.html`, `.htm` | `@codemirror/lang-html` |
| `.css`, `.scss` | `@codemirror/lang-css` |
| `.json` | `@codemirror/lang-json` |
| `.yaml`, `.yml` | `@codemirror/lang-yaml` |
| `.xml` | `@codemirror/lang-xml` |
| `.md` (NOT registered — Obsidian owns it) | — |
| `.sh`, `.bash`, `.zsh` | `@codemirror/legacy-modes/mode/shell` |
| `.rb` | `@codemirror/legacy-modes/mode/ruby` |
| `.go` | `@codemirror/lang-go` |
| `.rs` | `@codemirror/lang-rust` |
| `.java` | `@codemirror/lang-java` |
| `.c`, `.h`, `.cpp`, `.hpp`, `.cc` | `@codemirror/lang-cpp` |
| `.toml` | `@codemirror/legacy-modes/mode/toml` |

Anything not in the map but present in the user's enabled-extensions list still opens in `CodeView` with no language highlighting (plain monospace).

### `csv/parseCsv.ts`

Thin wrapper around PapaParse. Returns `{ headers: string[], rows: string[][], rowCount: number, truncated: boolean }`. Centralizes the 10,000-row truncation logic.

### `settings/settings.ts`

A single Obsidian `PluginSettingTab` with one section:

- A list of supported extensions, each with a toggle (default: all on).
- A "restore defaults" button.

Persisted via Obsidian's `loadData()`/`saveData()`. Changing a setting triggers re-registration of extensions; this requires an Obsidian reload — show a notice telling the user.

## Data flow

```
Obsidian file explorer click on foo.py
  → Obsidian routes to registered view "code-viewer"
  → CodeView.onLoadFile(file) → setViewData(content)
  → languageMap[".py"] dynamic import → @codemirror/lang-python
  → CM6 EditorView updated with content + language
  → User sees highlighted, line-numbered, foldable read-only Python

Later: terminal saves foo.py
  → Vault fires "modify" event for foo.py
  → CodeView listens → re-reads file → CM6 doc replaced (scroll preserved)
```

CSV path is the same shape, just `CsvView` and a re-render of the table.

## Theming

CodeView uses a small CM6 theme that reads Obsidian's CSS custom properties (`--background-primary`, `--text-normal`, `--text-accent`, etc.) for foreground/background, and a HighlightStyle that maps token types (`tags.keyword`, `tags.string`, `tags.comment`, etc.) to Obsidian's existing syntax-color CSS variables. This way, switching Obsidian's theme also switches the viewer.

CsvView is plain CSS using the same Obsidian variables — borders use `--background-modifier-border`, header uses `--background-secondary`, hover uses `--background-modifier-hover`.

## Error handling

- **Binary file opened by mistake:** detect non-UTF8 / replacement-character heavy content on `setViewData`; render a single-line message "This file appears to be binary and can't be displayed." Do not throw.
- **CSV parse failure:** PapaParse always returns something; surface its `errors` array as a warning banner above the table but still render whatever rows did parse.
- **Language pack import failure (e.g. offline, missing dep):** catch the dynamic-import rejection; render the file in `CodeView` without highlighting and log a console warning. Do not throw.
- **File too large (>5 MB):** CodeView renders a placeholder "File too large to display (5 MB limit). Open in your terminal." rather than freezing the UI. CSV uses the 10,000-row cap.

## Testing

- **Unit:** `parseCsv.ts` (header detection, row truncation, edge cases — embedded commas, quoted newlines, empty rows). `languageMap.ts` (correct package selected per extension).
- **Manual smoke matrix** (documented in README): open one file of each registered extension, confirm highlighting; open a CSV, confirm sort; edit a file in terminal, confirm auto-reload; toggle Obsidian theme, confirm viewer follows; toggle off an extension in settings, reload, confirm Obsidian reverts to default behavior for that extension.
- No headless-Obsidian test harness exists in this project; views are exercised manually.

## Build & packaging

- TypeScript + esbuild (standard Obsidian plugin template).
- `manifest.json` declares plugin id `code-viewer`, name "Code Viewer", min Obsidian version `1.4.0` (CM6 stable).
- Output: `main.js`, `manifest.json`, `styles.css` at the repo root, ready to drop into `<vault>/.obsidian/plugins/code-viewer/`.

## Project structure

```
my-obsidian-plugin/
  manifest.json
  package.json
  tsconfig.json
  esbuild.config.mjs
  styles.css
  src/
    main.ts
    views/
      CodeView.ts
      CsvView.ts
    language/
      languageMap.ts
      obsidianTheme.ts        # CM6 theme adapter to Obsidian CSS vars
    csv/
      parseCsv.ts
    settings/
      settings.ts
      defaults.ts
  docs/
    superpowers/specs/
      2026-05-07-obsidian-code-viewer-design.md  (this file)
```

## Out of scope (explicit)

- Editing
- Diff view
- Image/audio/video viewers (Obsidian already has these)
- Markdown rendering (Obsidian owns it)
- Live LSP / IntelliSense
- Multi-cursor, formatting commands, autocompletion
- Persisting per-file scroll position across reopens
