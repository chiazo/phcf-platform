export function csvCell(value: string | number): string {
  let text = String(value ?? "");
  // Members type their own names, so stop spreadsheets running them as formulas
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(
  filename: string,
  header: string[],
  rows: Array<Array<string | number>>,
) {
  const body = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  // The BOM makes Excel read accented names correctly
  const blob = new Blob(["\ufeff" + body], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}