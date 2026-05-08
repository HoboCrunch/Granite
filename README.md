# Code Viewer (Obsidian plugin)

Read-only viewer for non-markdown files in Obsidian. Renders code with
CodeMirror 6 syntax highlighting and CSV files as sortable tables.
Auto-reloads when files change on disk.

## Install (manual / from source)

1. `npm install` (an `.npmrc` sets `legacy-peer-deps=true`, required because Obsidian's CodeMirror peer pin disagrees with the language packs)
2. `npm run build`
3. Copy `main.js`, `manifest.json`, and `styles.css` into
   `<your-vault>/.obsidian/plugins/code-viewer/`.
4. In Obsidian, enable "Code Viewer" under Settings → Community Plugins.

## Supported extensions

js, mjs, cjs, jsx, ts, tsx, py, sql, html, htm, css, scss, json, yaml, yml,
xml, sh, bash, zsh, rb, go, rs, java, c, h, cpp, hpp, cc, toml, csv.

Toggle individual extensions in Settings → Code Viewer.

## Manual smoke test matrix

After installing into a real vault, copy `fixtures/*` into the vault and verify:

- [ ] `sample.js` opens with JS syntax highlighting and line numbers.
- [ ] `sample.py` opens with Python syntax highlighting.
- [ ] `sample.sql` opens with SQL keywords highlighted.
- [ ] `sample.html` opens with tag/attribute highlighting.
- [ ] `sample.json` opens with JSON highlighting.
- [ ] `sample.csv` opens as a table with sticky header.
- [ ] Clicking a CSV column header sorts ascending; again descending; again unsorted.
- [ ] Cmd/Ctrl+F inside an open code file opens search.
- [ ] Editing `sample.py` from a terminal (e.g. `echo "# touch" >> sample.py`)
      causes the open view to refresh automatically.
- [ ] Switching Obsidian's theme between light and dark recolors both views.
- [ ] Disabling `.py` in plugin settings, reloading Obsidian (Cmd/Ctrl+R), then
      opening a `.py` file shows Obsidian's default "no view" behaviour again.

## Limits

- Files larger than 5 MB show a "too large" placeholder in the code view.
- CSVs are capped at the first 10,000 rows; the banner reports the full count.
- Read-only by design. Edit via your normal editor; the viewer auto-reloads.
