# Granite

> Another rock for your Obsidian vault.

A viewer and editor for the non-markdown files that already live alongside
your notes. Code files (`.js`, `.py`, `.sql`, `.html`, `.json`, `.yaml`, …)
open with CodeMirror 6 syntax highlighting, line numbers, search, and
Cmd/Ctrl+S to save. CSV files open as a sortable table with draggable
column resizers, and a pencil button in the view header flips to a raw-text
editor when you need to make changes. Auto-reloads when the file changes on
disk, and prompts before clobbering your unsaved edits.

Built primarily for the workflow of editing files via the Obsidian terminal
plugin (or any external tool) while viewing them inside Obsidian.

Repository: <https://github.com/HoboCrunch/Granite>

## Install

### 1 — Make Obsidian show non-markdown files first

By default Obsidian hides anything that isn't `.md`. **Turn this on before
installing Granite or none of the file types it supports will appear in the
file explorer.**

> Open Obsidian → **Settings** → **Files & Links** → toggle on
> **"Detect all file extensions"** (some Obsidian versions label this
> "Show all file types").

You only need to do this once per vault.

### 2 — Install Granite

#### Option A: download a release (recommended)

Grab `main.js`, `manifest.json`, and `styles.css` from the latest release at
<https://github.com/HoboCrunch/Granite/releases> and copy all three into
`<your-vault>/.obsidian/plugins/code-viewer/` (create the folder if it
doesn't exist).

> Note: the on-disk plugin folder is still `code-viewer` — that's the
> plugin's stable id. The display name in Obsidian is "Granite".

#### Option B: build from source

```bash
git clone https://github.com/HoboCrunch/Granite.git
cd Granite
npm install   # an .npmrc sets legacy-peer-deps=true automatically
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into
`<your-vault>/.obsidian/plugins/code-viewer/`.

#### Option C: BRAT

If you have [BRAT](https://github.com/TfTHacker/obsidian42-brat) installed,
add the repo `HoboCrunch/Granite` and BRAT will keep you on the latest
release automatically.

### 3 — Enable it in Obsidian

> Open Obsidian → **Settings** → **Community plugins** → enable
> **"Granite"**. (If your vault is in Restricted Mode, turn that off
> first.)

That's it. Click any `.py`, `.json`, `.csv`, `.html`, … file in the file
explorer.

## Supported extensions

`js`, `mjs`, `cjs`, `jsx`, `ts`, `tsx`, `py`, `sql`, `html`, `htm`, `css`,
`scss`, `json`, `yaml`, `yml`, `xml`, `sh`, `bash`, `zsh`, `rb`, `go`, `rs`,
`java`, `c`, `h`, `cpp`, `hpp`, `cc`, `toml`, `csv`.

Per-extension toggles live at **Settings → Granite**. Disable any extension
you'd rather Obsidian leave alone (it'll fall back to "no view available",
as before).

## What's in the editor

**For code files:**

- CodeMirror 6 with line numbers, fold gutter, bracket matching, active-line
  highlight, and search (`Cmd/Ctrl+F`).
- Editable. Cmd/Ctrl+S saves to disk via Obsidian's vault.
- "Toggle word wrap" action button in the view header.
- Word wrap on by default.

**For CSV files:**

- Default: a sortable, scrollable table with sticky header. Click any
  column header to cycle ascending → descending → unsorted.
- Drag the right edge of any column header to resize the column live. Width
  applies to header + body cells.
- Pencil action button in the view header switches to **text mode** — a
  full CodeMirror editor over the raw CSV. Edit, Cmd/Ctrl+S, then click
  the action again to flip back to table view.

**Auto-reload + conflict guard:**

- When the file changes on disk while no edits are pending, the view
  refreshes automatically (preserving scroll position).
- When the file changes on disk while you have unsaved edits in Obsidian,
  a modal asks you to **Keep yours / Reload from disk / Cancel**.

## Limits

- Files larger than 5 MB show a "too large" placeholder; the editor stays
  read-only for those.
- Binary files show a "this file appears to be binary" placeholder.
- CSV table mode caps at the first 10,000 rows; the banner reports the
  full count. Switch to text mode to inspect/edit rows beyond that limit.
- Column widths and CSV view-mode (table vs text) reset when you reopen a
  file — they aren't persisted yet.

## Manual smoke test matrix

After installing into a real vault, copy `fixtures/*` into the vault and
verify:

- [ ] `sample.js` opens with JS syntax highlighting and line numbers.
- [ ] `sample.py` opens with Python syntax highlighting.
- [ ] `sample.sql` opens with SQL keywords highlighted.
- [ ] `sample.html` opens with tag/attribute highlighting.
- [ ] `sample.json` opens with JSON highlighting.
- [ ] `sample.csv` opens as a table with sticky header.
- [ ] Clicking a CSV column header sorts ascending; again descending; again unsorted.
- [ ] Cmd/Ctrl+F inside an open code file opens search.
- [ ] Editing `sample.py` from a terminal (`echo "# touch" >> sample.py`) causes the open view to refresh automatically.
- [ ] Switching Obsidian's theme between light and dark recolors both views.
- [ ] Disabling `.py` in plugin settings, reloading Obsidian (Cmd/Ctrl+R), then opening a `.py` file shows Obsidian's default "no view" behaviour again.
- [ ] Edit a code file in Obsidian, press Cmd/Ctrl+S, verify the file on disk has the new content.
- [ ] Edit a code file (don't save), then run `echo "" >> sample.py` from a terminal — verify the conflict modal appears with three buttons and each button behaves correctly.
- [ ] In a CSV file, drag the right edge of a column header — column should resize live; matching `<td>` cells should follow.
- [ ] Click the "Edit as text" action (pencil icon) in a CSV's header — the table should disappear and a CodeMirror editor should appear with the raw CSV text. Edit, Cmd/Ctrl+S, click the action again to return to table view; verify edits show.
- [ ] Click the "Toggle word wrap" action in a code file with long lines — the editor should switch between wrapping and horizontal-scroll.
- [ ] Open a binary file (e.g. an image renamed to `.txt`) — the placeholder appears and typing does nothing.

## Development

```bash
npm install
npm run typecheck # tsc --noEmit
npm run dev       # esbuild watch — rebuilds main.js on change
npm run build     # production build
```

Architecture:

- `src/main.ts` — plugin lifecycle, view + extension registration.
- `src/views/CodeView.ts` — CodeMirror 6 editor for all code file types.
- `src/views/CsvView.ts` — sortable table + text-mode editor for CSV.
- `src/views/columnResize.ts` — drag-handle helper for CSV column widths.
- `src/conflict/ConflictModal.ts` — three-button modal for concurrent-edit resolution.
- `src/csv/parseCsv.ts` — PapaParse wrapper with row truncation.
- `src/language/languageMap.ts` — extension → CodeMirror `LanguageSupport` (lazy).
- `src/language/obsidianTheme.ts` — CodeMirror theme bound to Obsidian CSS variables.
- `src/settings/` — settings tab + persistence.

## License

MIT.
