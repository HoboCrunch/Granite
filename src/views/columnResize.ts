const MIN_COL_PX = 40;

export function attachColumnResize(
  table: HTMLTableElement,
  widths: Map<number, number>,
): void {
  const ths = Array.from(table.tHead?.rows[0]?.cells ?? []);
  ths.forEach((th, idx) => {
    const stored = widths.get(idx);
    if (stored !== undefined) th.style.width = `${stored}px`;

    const handle = document.createElement("div");
    handle.className = "csv-viewer-col-resizer";
    th.appendChild(handle);

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = th.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const next = Math.max(MIN_COL_PX, Math.round(startWidth + delta));
        th.style.width = `${next}px`;
        widths.set(idx, next);
        applyToBody(table, idx, next);
      };

      const onUp = () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  });
}

function applyToBody(table: HTMLTableElement, colIdx: number, px: number): void {
  const rows = table.tBodies[0]?.rows ?? [];
  for (let r = 0; r < rows.length; r++) {
    const cell = rows[r].cells[colIdx];
    if (cell) cell.style.width = `${px}px`;
  }
}
