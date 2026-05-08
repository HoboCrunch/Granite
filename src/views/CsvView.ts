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
