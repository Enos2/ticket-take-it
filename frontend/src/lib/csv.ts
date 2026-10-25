// ==========================================
// FILE: frontend/src/lib/csv.ts
// PURPOSE: Builds and downloads CSV files that open safely in Excel.
// ==========================================
// A cell starting with one of these can run as a formula in Excel, so it gets a leading apostrophe.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // The byte order mark makes Excel read accents and symbols correctly.
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
// ==========================================
// END OF FILE: frontend/src/lib/csv.ts
// ==========================================