// Trigger a browser download of in-memory bytes (e.g. the xlsx report export).
export function downloadBytes(
  filename: string,
  bytes: Uint8Array,
  mime: string,
): void {
  // Copy into a fresh ArrayBuffer-backed array (proto bytes are Uint8Array<ArrayBufferLike>,
  // which TS 5.7 won't accept directly as a BlobPart).
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
