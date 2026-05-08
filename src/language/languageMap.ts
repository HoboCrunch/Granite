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
