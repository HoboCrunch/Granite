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
