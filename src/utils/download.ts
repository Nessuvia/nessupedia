export function downloadFile(data: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // The click starts the download synchronously, but some browsers read the URL a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
