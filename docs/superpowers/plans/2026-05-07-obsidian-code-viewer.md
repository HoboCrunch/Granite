# Obsidian Code Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Obsidian plugin that renders non-markdown files (`.js`, `.py`, `.sql`, `.html`, `.csv`, etc.) with IDE-quality formatting — CodeMirror 6 syntax highlighting for code, sortable HTML tables for CSV — and auto-reloads when files change on disk.

**Architecture:** A single Obsidian plugin (`main.ts`) registers two `TextFileView` subclasses: `CodeView` (CM6 read-only with line numbers, search, fold, bracket matching) for code files, and `CsvView` (PapaParse → sortable table) for `.csv`. Both views subscribe to the vault's `modify` event so external edits (e.g. Claude saving from the terminal) refresh the view. Theming follows Obsidian via CSS variables. Read-only by design — editing happens elsewhere.

**Tech Stack:** TypeScript, esbuild, Obsidian plugin API (`obsidian` package, peer dep), CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/search`, `@codemirror/commands` and per-language packages), `@lezer/highlight`, PapaParse, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-07-obsidian-code-viewer-design.md`

**Background context for engineers unfamiliar with Obsidian plugins:**

- An Obsidian plugin is a TS project that compiles to a single `main.js` next to a `manifest.json`. The user copies these into `<vault>/.obsidian/plugins/<id>/` and enables it in Obsidian's Community Plugins settings.
- `obsidian` (the npm package) provides type definitions and runtime classes — but it's a **peer dependency**, not bundled. esbuild must mark it (and all `@codemirror/*` and `@lezer/*` packages) as **external** because Obsidian itself ships those at runtime; bundling them would duplicate code and break instanceof checks.
- A `TextFileView` is the standard base class for views that own a text file. Obsidian wires up open/modify/close events automatically; the subclass implements `getViewType`, `getViewData`, `setViewData`, and `clear`.
- `registerExtensions(["py", "sql"], "code-viewer")` tells Obsidian "when the user clicks any `.py` or `.sql` file, open it in the view registered as `code-viewer`".
- CodeMirror 6 (CM6) is what Obsidian uses for its own editor. We're not creating a second copy — we're using the CM6 packages already loaded by Obsidian, configured as a read-only `EditorView` inside our `TextFileView`.

---

## File Structure

```
my-obsidian-plugin/
  manifest.json                              # Obsidian plugin manifest
  package.json                               # npm config, deps, scripts
  tsconfig.json                              # TypeScript config
  esbuild.config.mjs                         # Build script
  styles.css                                 # CSV table + viewer CSS
  .gitignore
  README.md                                  # Install + manual smoke test matrix
  src/
    main.ts                                  # Plugin entry, registers views/extensions
    views/
      CodeView.ts                            # CM6 read-only view
      CsvView.ts                             # Sortable table view
    language/
      languageMap.ts                         # ext → CM6 LanguageSupport (lazy)
      obsidianTheme.ts                       # CM6 theme bound to Obsidian CSS vars
    csv/
      parseCsv.ts                            # PapaParse wrapper + truncation
    settings/
      defaults.ts                            # Default settings
      settings.ts                            # Settings tab UI
  tests/
    parseCsv.test.ts                         # Unit tests for CSV parser
    languageMap.test.ts                      # Unit tests for extension routing
  fixtures/                                  # Sample files for manual smoke testing
    sample.js
    sample.py
    sample.sql
    sample.html
    sample.csv
    sample.json
```

**Responsibility boundaries:**
- `main.ts` — plugin lifecycle only. No view logic, no parsing.
- `views/*` — view rendering only. No persistence, no settings logic.
- `language/languageMap.ts` — pure lookup. Returns a function that returns a Promise of `Extension`. No CM6 view manipulation.
- `language/obsidianTheme.ts` — pure CM6 theme. No DOM access.
- `csv/parseCsv.ts` — pure parsing function. No DOM, no Obsidian.
- `settings/*` — persisted config + tab UI. Doesn't know about views.

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `manifest.json`
- Create: `esbuild.config.mjs`
- Create: `.gitignore`
- Create: `vitest.config.ts`
- Create: `src/main.ts` (placeholder, just a class skeleton so the build runs)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "obsidian-code-viewer",
  "version": "0.1.0",
  "description": "Read-only viewer for non-markdown files in Obsidian.",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["obsidian-plugin"],
  "author": "",
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/papaparse": "^5.3.14",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.20.0",
    "obsidian": "^1.5.7",
    "tslib": "^2.6.2",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  },
  "dependencies": {
    "@codemirror/commands": "^6.3.3",
    "@codemirror/lang-cpp": "^6.0.2",
    "@codemirror/lang-css": "^6.2.1",
    "@codemirror/lang-go": "^6.0.0",
    "@codemirror/lang-html": "^6.4.8",
    "@codemirror/lang-java": "^6.0.1",
    "@codemirror/lang-javascript": "^6.2.2",
    "@codemirror/lang-json": "^6.0.1",
    "@codemirror/lang-python": "^6.1.4",
    "@codemirror/lang-rust": "^6.0.1",
    "@codemirror/lang-sql": "^6.6.1",
    "@codemirror/lang-xml": "^6.1.0",
    "@codemirror/lang-yaml": "^6.0.0",
    "@codemirror/language": "^6.10.1",
    "@codemirror/legacy-modes": "^6.4.0",
    "@codemirror/search": "^6.5.5",
    "@codemirror/state": "^6.4.0",
    "@codemirror/view": "^6.23.1",
    "@lezer/highlight": "^1.2.0",
    "papaparse": "^5.4.1"
  }
}
```

NOTE on dependencies vs devDependencies: although `@codemirror/*` and `@lezer/*` are **externalized** at build time (Obsidian provides them at runtime), they live in `dependencies` so TypeScript can resolve their type imports during compilation. esbuild's `external` config (Step 4) is what keeps them out of the bundle.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "inlineSourceMap": true,
    "inlineSources": true,
    "declaration": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "src/*": ["src/*"] }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `manifest.json`**

```json
{
  "id": "code-viewer",
  "name": "Code Viewer",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Read-only viewer for non-markdown files (js, py, sql, html, csv, and more) with syntax highlighting and auto-reload on disk change.",
  "author": "",
  "isDesktopOnly": false
}
```

- [ ] **Step 4: Create `esbuild.config.mjs`**

```js
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
```

NOTE: language packages (`@codemirror/lang-*` and `@codemirror/legacy-modes`) are NOT externalized — they get bundled into `main.js` because Obsidian doesn't ship every language. Only the core CM6 framework packages are external.

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
main.js
*.log
.DS_Store
.vscode/
dist/
coverage/
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: Create placeholder `src/main.ts`**

```ts
import { Plugin } from "obsidian";

export default class CodeViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    // Implemented in Task 7.
  }
}
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no audit errors that block install. Warnings about peer deps for `obsidian` are fine.

- [ ] **Step 9: Verify the build runs**

Run: `npm run build`
Expected: `main.js` is produced at the repo root with no errors.

- [ ] **Step 10: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No output, exit 0.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json manifest.json esbuild.config.mjs vitest.config.ts .gitignore src/main.ts
git commit -m "Scaffold Obsidian plugin project"
```

---

## Task 1: CSV parser module (TDD)

**Files:**
- Create: `tests/parseCsv.test.ts`
- Create: `src/csv/parseCsv.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/parseCsv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv, MAX_ROWS } from "../src/csv/parseCsv";

describe("parseCsv", () => {
  it("parses a simple CSV with a header", () => {
    const result = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(result.headers).toEqual(["a", "b", "c"]);
    expect(result.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCsv('name,note\n"Smith, John","hi, there"\n');
    expect(result.rows).toEqual([["Smith, John", "hi, there"]]);
  });

  it("handles quoted fields containing newlines", () => {
    const result = parseCsv('a,b\n"line1\nline2","ok"\n');
    expect(result.rows).toEqual([["line1\nline2", "ok"]]);
  });

  it("returns empty headers and rows for an empty input", () => {
    const result = parseCsv("");
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("treats single-line input as a header with no rows", () => {
    const result = parseCsv("only,a,header");
    expect(result.headers).toEqual(["only", "a", "header"]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("truncates rows beyond MAX_ROWS and sets truncated=true", () => {
    const lines = ["h1,h2"];
    for (let i = 0; i < MAX_ROWS + 50; i++) lines.push(`r${i},x`);
    const result = parseCsv(lines.join("\n"));
    expect(result.rows.length).toBe(MAX_ROWS);
    expect(result.rowCount).toBe(MAX_ROWS + 50);
    expect(result.truncated).toBe(true);
  });

  it("normalizes ragged rows to header length (pads short, truncates long)", () => {
    const result = parseCsv("a,b,c\n1,2\n4,5,6,7\n");
    expect(result.rows).toEqual([
      ["1", "2", ""],
      ["4", "5", "6"],
    ]);
  });

  it("skips fully-empty lines", () => {
    const result = parseCsv("a,b\n\n1,2\n\n3,4\n\n");
    expect(result.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with module-not-found error for `../src/csv/parseCsv`.

- [ ] **Step 3: Implement `parseCsv`**

Create `src/csv/parseCsv.ts`:

```ts
import Papa from "papaparse";

export const MAX_ROWS = 10_000;

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  rowCount: number;
  truncated: boolean;
  errors: string[];
}

export function parseCsv(input: string): ParsedCsv {
  if (input.length === 0) {
    return { headers: [], rows: [], rowCount: 0, truncated: false, errors: [] };
  }

  const result = Papa.parse<string[]>(input, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const data = result.data as string[][];
  if (data.length === 0) {
    return { headers: [], rows: [], rowCount: 0, truncated: false, errors: [] };
  }

  const headers = data[0].map((h) => String(h));
  const rawRows = data.slice(1);
  const rowCount = rawRows.length;
  const sliced = rawRows.slice(0, MAX_ROWS);

  const rows = sliced.map((row) => {
    const out = new Array<string>(headers.length);
    for (let i = 0; i < headers.length; i++) {
      out[i] = i < row.length ? String(row[i] ?? "") : "";
    }
    return out;
  });

  return {
    headers,
    rows,
    rowCount,
    truncated: rowCount > MAX_ROWS,
    errors: result.errors.map((e) => `${e.type}: ${e.message} (row ${e.row ?? "?"})`),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/parseCsv.test.ts src/csv/parseCsv.ts
git commit -m "Add CSV parser with truncation and ragged-row normalization"
```

---

## Task 2: Language map (TDD)

**Files:**
- Create: `tests/languageMap.test.ts`
- Create: `src/language/languageMap.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/languageMap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CODE_EXTENSIONS,
  hasLanguage,
  getLanguageLoader,
} from "../src/language/languageMap";

describe("languageMap", () => {
  it("includes all expected extensions in CODE_EXTENSIONS", () => {
    const expected = [
      "js", "mjs", "cjs", "jsx", "ts", "tsx",
      "py", "sql", "html", "htm", "css", "scss",
      "json", "yaml", "yml", "xml",
      "sh", "bash", "zsh", "rb",
      "go", "rs", "java",
      "c", "h", "cpp", "hpp", "cc",
      "toml",
    ];
    for (const ext of expected) {
      expect(CODE_EXTENSIONS).toContain(ext);
    }
  });

  it("does NOT include md or canvas (Obsidian owns those)", () => {
    expect(CODE_EXTENSIONS).not.toContain("md");
    expect(CODE_EXTENSIONS).not.toContain("canvas");
  });

  it("does NOT include csv (CsvView handles that)", () => {
    expect(CODE_EXTENSIONS).not.toContain("csv");
  });

  it("hasLanguage returns true for known extensions", () => {
    expect(hasLanguage("py")).toBe(true);
    expect(hasLanguage("ts")).toBe(true);
    expect(hasLanguage("toml")).toBe(true);
  });

  it("hasLanguage is case-insensitive", () => {
    expect(hasLanguage("PY")).toBe(true);
    expect(hasLanguage("Ts")).toBe(true);
  });

  it("hasLanguage returns false for unknown extensions", () => {
    expect(hasLanguage("xyz")).toBe(false);
    expect(hasLanguage("")).toBe(false);
  });

  it("getLanguageLoader returns a function for known extensions", () => {
    const loader = getLanguageLoader("py");
    expect(typeof loader).toBe("function");
  });

  it("getLanguageLoader returns null for unknown extensions", () => {
    expect(getLanguageLoader("xyz")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL with module-not-found error for `../src/language/languageMap`.

- [ ] **Step 3: Implement `languageMap.ts`**

Create `src/language/languageMap.ts`:

```ts
import type { Extension } from "@codemirror/state";

export type LanguageLoader = () => Promise<Extension>;

const map: Record<string, LanguageLoader> = {
  // JavaScript / TypeScript
  js: async () => (await import("@codemirror/lang-javascript")).javascript(),
  mjs: async () => (await import("@codemirror/lang-javascript")).javascript(),
  cjs: async () => (await import("@codemirror/lang-javascript")).javascript(),
  jsx: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  ts: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  tsx: async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }),

  // Python
  py: async () => (await import("@codemirror/lang-python")).python(),

  // SQL
  sql: async () => (await import("@codemirror/lang-sql")).sql(),

  // HTML / CSS
  html: async () => (await import("@codemirror/lang-html")).html(),
  htm: async () => (await import("@codemirror/lang-html")).html(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  scss: async () => (await import("@codemirror/lang-css")).css(),

  // Data formats
  json: async () => (await import("@codemirror/lang-json")).json(),
  yaml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  yml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  xml: async () => (await import("@codemirror/lang-xml")).xml(),

  // Systems / compiled
  go: async () => (await import("@codemirror/lang-go")).go(),
  rs: async () => (await import("@codemirror/lang-rust")).rust(),
  java: async () => (await import("@codemirror/lang-java")).java(),
  c: async () => (await import("@codemirror/lang-cpp")).cpp(),
  h: async () => (await import("@codemirror/lang-cpp")).cpp(),
  cpp: async () => (await import("@codemirror/lang-cpp")).cpp(),
  hpp: async () => (await import("@codemirror/lang-cpp")).cpp(),
  cc: async () => (await import("@codemirror/lang-cpp")).cpp(),

  // Legacy modes
  sh: async () => {
    const { StreamLanguage } = await import("@codemirror/language");
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return StreamLanguage.define(shell);
  },
  bash: async () => {
    const { StreamLanguage } = await import("@codemirror/language");
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return StreamLanguage.define(shell);
  },
  zsh: async () => {
    const { StreamLanguage } = await import("@codemirror/language");
    const { shell } = await import("@codemirror/legacy-modes/mode/shell");
    return StreamLanguage.define(shell);
  },
  rb: async () => {
    const { StreamLanguage } = await import("@codemirror/language");
    const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
    return StreamLanguage.define(ruby);
  },
  toml: async () => {
    const { StreamLanguage } = await import("@codemirror/language");
    const { toml } = await import("@codemirror/legacy-modes/mode/toml");
    return StreamLanguage.define(toml);
  },
};

export const CODE_EXTENSIONS: string[] = Object.keys(map);

export function hasLanguage(ext: string): boolean {
  return ext.toLowerCase() in map;
}

export function getLanguageLoader(ext: string): LanguageLoader | null {
  const lower = ext.toLowerCase();
  return lower in map ? map[lower] : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all languageMap tests + previous parseCsv tests still green.

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/languageMap.test.ts src/language/languageMap.ts
git commit -m "Add language map with lazy-loaded CodeMirror language packs"
```

---

## Task 3: Obsidian theme adapter

**Files:**
- Create: `src/language/obsidianTheme.ts`

This file is a pure CM6 extension producer — it does not access the DOM, it just returns CM6 `Extension` objects that reference Obsidian CSS variables. No tests; the only meaningful verification is visual (Task 9).

- [ ] **Step 1: Implement the theme**

Create `src/language/obsidianTheme.ts`:

```ts
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

const themedView = EditorView.theme({
  "&": {
    backgroundColor: "var(--background-primary)",
    color: "var(--text-normal)",
    height: "100%",
    fontFamily: "var(--font-monospace)",
    fontSize: "var(--font-text-size)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-monospace)",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "var(--text-normal)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background-secondary)",
    color: "var(--text-faint)",
    border: "none",
    borderRight: "1px solid var(--background-modifier-border)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--background-modifier-hover)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--background-modifier-hover)",
    color: "var(--text-normal)",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--text-selection) !important",
  },
  ".cm-cursor": { display: "none" },
  ".cm-matchingBracket": {
    backgroundColor: "var(--background-modifier-active-hover)",
    outline: "1px solid var(--text-accent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--text-highlight-bg)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--text-accent)",
    color: "var(--text-on-accent)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--background-secondary-alt)",
    color: "var(--text-muted)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "3px",
    padding: "0 4px",
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--code-keyword, var(--text-accent))" },
  { tag: [t.name, t.deleted, t.character, t.macroName], color: "var(--text-normal)" },
  { tag: [t.propertyName], color: "var(--code-property, var(--text-normal))" },
  { tag: [t.string, t.special(t.string)], color: "var(--code-string, #98c379)" },
  { tag: [t.function(t.variableName), t.labelName], color: "var(--code-function, var(--text-accent))" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "var(--code-keyword, var(--text-accent))" },
  { tag: [t.definition(t.name), t.separator], color: "var(--text-normal)" },
  { tag: [t.typeName], color: "var(--code-type, var(--text-accent-hover))" },
  { tag: [t.className], color: "var(--code-type, var(--text-accent-hover))" },
  { tag: [t.number, t.bool, t.null], color: "var(--code-value, #d19a66)" },
  { tag: [t.operator, t.operatorKeyword], color: "var(--code-operator, var(--text-muted))" },
  { tag: [t.url, t.escape, t.regexp, t.link], color: "var(--code-string, #98c379)" },
  { tag: [t.meta, t.comment], color: "var(--code-comment, var(--text-faint))", fontStyle: "italic" },
  { tag: t.tagName, color: "var(--code-tag, var(--text-accent))" },
  { tag: t.attributeName, color: "var(--code-property, var(--text-accent-hover))" },
  { tag: t.attributeValue, color: "var(--code-string, #98c379)" },
  { tag: t.heading, fontWeight: "bold" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.invalid, color: "var(--text-error)" },
]);

export function obsidianTheme(): Extension {
  return [themedView, syntaxHighlighting(highlightStyle)];
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No output, exit 0.

- [ ] **Step 3: Verify build still succeeds**

Run: `npm run build`
Expected: `main.js` produced with no errors. (The theme isn't wired in yet — we just want to confirm imports resolve.)

- [ ] **Step 4: Commit**

```bash
git add src/language/obsidianTheme.ts
git commit -m "Add CodeMirror theme adapter binding to Obsidian CSS variables"
```

---

## Task 4: Settings module

**Files:**
- Create: `src/settings/defaults.ts`
- Create: `src/settings/settings.ts`

- [ ] **Step 1: Create `src/settings/defaults.ts`**

```ts
import { CODE_EXTENSIONS } from "../language/languageMap";

export interface CodeViewerSettings {
  enabledExtensions: Record<string, boolean>;
}

export const ALL_EXTENSIONS: string[] = [...CODE_EXTENSIONS, "csv"].sort();

export const DEFAULT_SETTINGS: CodeViewerSettings = {
  enabledExtensions: Object.fromEntries(ALL_EXTENSIONS.map((e) => [e, true])),
};

export function mergeSettings(loaded: unknown): CodeViewerSettings {
  const enabled: Record<string, boolean> = { ...DEFAULT_SETTINGS.enabledExtensions };
  if (
    loaded &&
    typeof loaded === "object" &&
    "enabledExtensions" in loaded &&
    typeof (loaded as { enabledExtensions: unknown }).enabledExtensions === "object" &&
    (loaded as { enabledExtensions: unknown }).enabledExtensions !== null
  ) {
    const incoming = (loaded as { enabledExtensions: Record<string, unknown> }).enabledExtensions;
    for (const ext of ALL_EXTENSIONS) {
      if (typeof incoming[ext] === "boolean") {
        enabled[ext] = incoming[ext] as boolean;
      }
    }
  }
  return { enabledExtensions: enabled };
}
```

- [ ] **Step 2: Create `src/settings/settings.ts`**

```ts
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type CodeViewerPlugin from "../main";
import { ALL_EXTENSIONS, DEFAULT_SETTINGS } from "./defaults";

export class CodeViewerSettingTab extends PluginSettingTab {
  plugin: CodeViewerPlugin;

  constructor(app: App, plugin: CodeViewerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Code Viewer" });
    containerEl.createEl("p", {
      text: "Enable or disable per-extension. Changes take effect after reloading Obsidian (Ctrl/Cmd+R).",
      cls: "setting-item-description",
    });

    for (const ext of ALL_EXTENSIONS) {
      new Setting(containerEl).setName(`.${ext}`).addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabledExtensions[ext] ?? true)
          .onChange(async (value) => {
            this.plugin.settings.enabledExtensions[ext] = value;
            await this.plugin.saveSettings();
          }),
      );
    }

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Restore defaults")
        .setCta()
        .onClick(async () => {
          this.plugin.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
          await this.plugin.saveSettings();
          new Notice("Code Viewer: defaults restored. Reload Obsidian to apply.");
          this.display();
        }),
    );
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: Errors about `CodeViewerPlugin.settings` and `CodeViewerPlugin.saveSettings` — these are added in Task 7. Resolve by stubbing `main.ts` with the required surface area now:

Replace `src/main.ts` with:

```ts
import { Plugin } from "obsidian";
import { type CodeViewerSettings, DEFAULT_SETTINGS, mergeSettings } from "./settings/defaults";

export default class CodeViewerPlugin extends Plugin {
  settings: CodeViewerSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    // View registration is implemented in Task 7.
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

Re-run: `npm run typecheck`
Expected: No output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/settings/defaults.ts src/settings/settings.ts src/main.ts
git commit -m "Add settings module with per-extension toggles"
```

---

## Task 5: CodeView (CM6 read-only)

**Files:**
- Create: `src/views/CodeView.ts`

This view requires the Obsidian runtime to exercise. It is verified manually in Task 9 and indirectly via the typecheck and build.

- [ ] **Step 1: Implement `src/views/CodeView.ts`**

```ts
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No output, exit 0.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: `main.js` produced with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/CodeView.ts
git commit -m "Add CodeView for read-only code rendering with CodeMirror 6"
```

---

## Task 6: CsvView (sortable table)

**Files:**
- Create: `src/views/CsvView.ts`

- [ ] **Step 1: Implement `src/views/CsvView.ts`**

```ts
import { TextFileView, type WorkspaceLeaf } from "obsidian";
import { parseCsv, type ParsedCsv } from "../csv/parseCsv";

export const CSV_VIEW_TYPE = "csv-viewer";

type SortDir = "asc" | "desc" | null;
interface SortState { column: number; dir: SortDir; }

export class CsvView extends TextFileView {
  private rawText = "";
  private parsed: ParsedCsv = { headers: [], rows: [], rowCount: 0, truncated: false, errors: [] };
  private sort: SortState = { column: -1, dir: null };

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
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  getViewData(): string {
    return this.rawText;
  }

  setViewData(data: string, _clear: boolean): void {
    this.rawText = data;
    this.parsed = parseCsv(data);
    this.sort = { column: -1, dir: null };
    this.render();
  }

  clear(): void {
    this.rawText = "";
    this.parsed = { headers: [], rows: [], rowCount: 0, truncated: false, errors: [] };
    this.sort = { column: -1, dir: null };
    this.contentEl.empty();
  }

  private render(): void {
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
      th.setText(h);
      th.addClass("csv-viewer-th");
      if (this.sort.column === idx && this.sort.dir) {
        th.addClass(`csv-viewer-sort-${this.sort.dir}`);
      }
      th.addEventListener("click", () => this.cycleSort(idx));
    });

    const tbody = table.createEl("tbody");
    const rows = this.sortedRows();
    for (const row of rows) {
      const tr = tbody.createEl("tr");
      for (const cell of row) tr.createEl("td", { text: cell });
    }
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
    this.render();
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No output, exit 0.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: `main.js` produced with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/CsvView.ts
git commit -m "Add CsvView with sortable table and truncation banner"
```

---

## Task 7: Wire it all together in `main.ts`

**Files:**
- Modify: `src/main.ts` (full rewrite)

- [ ] **Step 1: Replace `src/main.ts` with the full implementation**

```ts
import { Plugin } from "obsidian";
import {
  type CodeViewerSettings,
  DEFAULT_SETTINGS,
  mergeSettings,
} from "./settings/defaults";
import { CodeViewerSettingTab } from "./settings/settings";
import { CODE_EXTENSIONS } from "./language/languageMap";
import { CodeView, CODE_VIEW_TYPE } from "./views/CodeView";
import { CsvView, CSV_VIEW_TYPE } from "./views/CsvView";

export default class CodeViewerPlugin extends Plugin {
  settings: CodeViewerSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());

    this.registerView(CODE_VIEW_TYPE, (leaf) => new CodeView(leaf));
    this.registerView(CSV_VIEW_TYPE, (leaf) => new CsvView(leaf));

    const enabledCode = CODE_EXTENSIONS.filter(
      (ext) => this.settings.enabledExtensions[ext] !== false,
    );
    if (enabledCode.length > 0) {
      this.registerExtensions(enabledCode, CODE_VIEW_TYPE);
    }

    if (this.settings.enabledExtensions["csv"] !== false) {
      this.registerExtensions(["csv"], CSV_VIEW_TYPE);
    }

    this.addSettingTab(new CodeViewerSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No output, exit 0.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: `main.js` produced with no errors.

- [ ] **Step 4: Confirm tests still pass**

Run: `npm test`
Expected: All tests in `tests/` pass.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "Wire CodeView and CsvView into plugin lifecycle"
```

---

## Task 8: Styles

**Files:**
- Create: `styles.css`

- [ ] **Step 1: Create `styles.css`**

```css
.code-viewer {
  height: 100%;
  padding: 0;
}

.code-viewer .cm-editor {
  height: 100%;
}

.csv-viewer {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.csv-viewer-banner {
  padding: 6px 12px;
  background-color: var(--background-secondary);
  color: var(--text-muted);
  font-size: 12px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.csv-viewer-warning {
  background-color: var(--background-modifier-error);
  color: var(--text-error);
}

.csv-viewer-empty {
  padding: 24px;
  color: var(--text-muted);
  text-align: center;
}

.csv-viewer-table-wrapper {
  overflow: auto;
  flex: 1 1 auto;
}

.csv-viewer-table {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-family: var(--font-monospace);
  font-size: var(--font-text-size);
}

.csv-viewer-table th,
.csv-viewer-table td {
  border: 1px solid var(--background-modifier-border);
  padding: 4px 8px;
  text-align: left;
  vertical-align: top;
  white-space: pre;
}

.csv-viewer-table thead th {
  position: sticky;
  top: 0;
  background-color: var(--background-secondary);
  cursor: pointer;
  user-select: none;
  z-index: 1;
}

.csv-viewer-table thead th:hover {
  background-color: var(--background-modifier-hover);
}

.csv-viewer-table tbody tr:hover {
  background-color: var(--background-modifier-hover);
}

.csv-viewer-th.csv-viewer-sort-asc::after {
  content: " ▲";
  color: var(--text-accent);
}

.csv-viewer-th.csv-viewer-sort-desc::after {
  content: " ▼";
  color: var(--text-accent);
}
```

- [ ] **Step 2: Verify build still succeeds**

Run: `npm run build`
Expected: `main.js` produced. (esbuild does not bundle `styles.css`; it's loaded by Obsidian directly from the plugin folder.)

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "Add styles for CodeView and CsvView"
```

---

## Task 9: Fixtures, README, and final verification

**Files:**
- Create: `fixtures/sample.js`
- Create: `fixtures/sample.py`
- Create: `fixtures/sample.sql`
- Create: `fixtures/sample.html`
- Create: `fixtures/sample.csv`
- Create: `fixtures/sample.json`
- Create: `README.md`

- [ ] **Step 1: Create fixture files**

`fixtures/sample.js`:
```js
// Sample JS for smoke testing the Code Viewer plugin.
function greet(name) {
  return `Hello, ${name}!`;
}
const numbers = [1, 2, 3, 4, 5];
console.log(numbers.map((n) => n * 2));
console.log(greet("world"));
```

`fixtures/sample.py`:
```py
"""Sample Python module for smoke testing."""

def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

if __name__ == "__main__":
    for i in range(10):
        print(fib(i))
```

`fixtures/sample.sql`:
```sql
-- Sample SQL for smoke testing.
SELECT
  u.id,
  u.email,
  COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.email
ORDER BY order_count DESC
LIMIT 50;
```

`fixtures/sample.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sample</title>
  </head>
  <body>
    <h1>Hello</h1>
    <p>Sample HTML for the Code Viewer plugin.</p>
  </body>
</html>
```

`fixtures/sample.csv`:
```csv
name,age,city,active
Alice,30,Brooklyn,true
Bob,42,Queens,false
"Carol, the great",27,"New York, NY",true
Dan,55,Manhattan,true
Eve,19,Bronx,false
```

`fixtures/sample.json`:
```json
{
  "name": "Sample",
  "version": 1,
  "items": [
    { "id": 1, "label": "First" },
    { "id": 2, "label": "Second" }
  ],
  "active": true
}
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Code Viewer (Obsidian plugin)

Read-only viewer for non-markdown files in Obsidian. Renders code with
CodeMirror 6 syntax highlighting and CSV files as sortable tables.
Auto-reloads when files change on disk.

## Install (manual / from source)

1. `npm install`
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
```

- [ ] **Step 3: Final verification — typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck silent / exit 0; vitest reports all tests passing; esbuild emits `main.js` with no errors.

- [ ] **Step 4: Commit**

```bash
git add fixtures README.md
git commit -m "Add fixtures and README with smoke test matrix"
```

- [ ] **Step 5: Final report**

Print to stdout:
```
Build artifacts: main.js, manifest.json, styles.css (drop into <vault>/.obsidian/plugins/code-viewer/)
Tests:           parseCsv (8) + languageMap (8) — see vitest output
Manual checks:   See README.md "Manual smoke test matrix" — these require a real Obsidian install.
```

---

## Notes for the executor

- **`obsidian` is a peer dep.** Don't try to bundle it. esbuild's `external` list already handles this.
- **`@codemirror/*` framework packages are external; `@codemirror/lang-*` are NOT.** Obsidian provides the framework but not the language packs — bundling lang packs is correct.
- **No DOM access in tests.** `parseCsv` and `languageMap` are pure modules and run under Node-environment vitest. View tests would require an Obsidian harness we don't have.
- **Auto-reload comes for free.** `TextFileView` calls `setViewData` whenever the underlying file changes — we don't need to subscribe to vault events ourselves. Verify this manually in Task 9 step 2.
- **Per-extension toggles require an Obsidian reload to take effect.** This is because `registerExtensions` only runs once on plugin load. The settings UI tells the user to reload; this is intentional and not a bug.
