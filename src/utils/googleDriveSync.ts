/**
 * Google Drive Database Sync Utilities
 * Uses client-side fetch requests to sync bst_sync_data.json with Google Drive.
 */

export async function findSyncFile(accessToken: string, folderId?: string): Promise<string | null> {
  try {
    let query = "name = 'bst_sync_data.json' and trashed = false";
    if (folderId && folderId.trim()) {
      query += ` and '${folderId.trim()}' in parents`;
    }
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      console.warn('Failed to search for sync file:', res.statusText);
      return null;
    }
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch (e) {
    console.error('Error finding sync file:', e);
    return null;
  }
}

export async function downloadSyncFile(accessToken: string, fileId: string): Promise<any> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`Failed to download sync file: ${res.statusText}`);
  }
  return await res.json();
}

export async function uploadSyncFile(accessToken: string, folderId: string | undefined, fileId: string | null, data: any): Promise<string | null> {
  try {
    if (fileId) {
      // Update existing file content using PATCH media upload
      const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        throw new Error(`Failed to update sync file: ${res.statusText}`);
      }
      return fileId;
    } else {
      // Create new file using Multipart upload
      const metadata = {
        name: 'bst_sync_data.json',
        mimeType: 'application/json',
        parents: folderId && folderId.trim() ? [folderId.trim()] : undefined
      };
      
      const boundary = 'bst_boundary_sync_999';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      
      const multipartBody = 
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(data) +
        closeDelimiter;

      const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBody
      });
      if (!res.ok) {
        throw new Error(`Failed to create sync file: ${res.statusText}`);
      }
      const responseData = await res.json();
      return responseData.id || null;
    }
  } catch (e) {
    console.error('Error uploading sync file to Drive:', e);
    return null;
  }
}
