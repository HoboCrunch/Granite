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
