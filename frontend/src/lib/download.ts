// ==========================================
// FILE: frontend/src/lib/download.ts
// PURPOSE: Saves a file that was fetched with the API (which needs the sign-in token) to the person's device.
// ==========================================

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the browser a moment to start the download before the link is thrown away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
// ==========================================
// END OF FILE: frontend/src/lib/download.ts
// ==========================================