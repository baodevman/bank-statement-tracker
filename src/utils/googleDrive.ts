/**
 * Google Drive API Utilities for Bank Statement Tracker.
 * Runs 100% client-side in the browser.
 */

// Download file bytes from Google Drive API as an ArrayBuffer
export async function downloadDriveFile(
  accessToken: string,
  fileId: string
): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Không thể tải tệp từ Google Drive: ${response.statusText} (${response.status})`);
  }
  
  return response.arrayBuffer();
}
