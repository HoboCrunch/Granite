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
