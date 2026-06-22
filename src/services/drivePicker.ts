/**
 * Google Drive Picker integration.
 *
 * Loads the Google Identity Services + Picker API on demand, asks the user for
 * a drive.readonly token, shows the Picker, then downloads the chosen image
 * files and returns them as base64 data URIs (ready for /api/upload).
 *
 * Requires:
 *   VITE_GOOGLE_CLIENT_ID       (already configured for Gmail OAuth)
 *   VITE_GOOGLE_PICKER_API_KEY  (API key with Picker API enabled)
 *   VITE_GOOGLE_APP_ID          (GCP project number, e.g. 178790784709)
 */

// drive.file: app only accesses files the user explicitly picks via the Picker.
// This is a NON-sensitive scope (no Google verification required), unlike
// drive.readonly which is restricted. The Picker grants per-file access, so
// downloading the chosen images works without full-Drive permission.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

let gisLoaded = false;
let pickerLoaded = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureLibs(): Promise<void> {
  if (!gisLoaded) {
    await loadScript('https://accounts.google.com/gsi/client');
    gisLoaded = true;
  }
  if (!pickerLoaded) {
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise<void>((resolve) => (window as any).gapi.load('picker', resolve));
    pickerLoaded = true;
  }
}

function getAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return reject(new Error('VITE_GOOGLE_CLIENT_ID is not set'));

    const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: any) => {
        if (resp.error) return reject(new Error(resp.error));
        resolve(resp.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
}

function showPicker(accessToken: string): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const apiKey = import.meta.env.VITE_GOOGLE_PICKER_API_KEY;
    const appId = import.meta.env.VITE_GOOGLE_APP_ID;
    const google = (window as any).google;

    // Allow picking either individual images or a whole folder.
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);

    const builder = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const files: PickedFile[] = (data.docs || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            mimeType: d.mimeType,
          }));
          resolve(files);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      });

    if (apiKey) builder.setDeveloperKey(apiKey);
    if (appId) builder.setAppId(appId);

    builder.build().setVisible(true);
  });
}

async function downloadAsDataUri(fileId: string, accessToken: string): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`Drive download failed (${res.status}): ${detail}`);
  }
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** List all image files inside a Drive folder (handles pagination). */
async function listImagesInFolder(folderId: string, accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'nextPageToken, files(id)',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Drive list failed (${res.status}): ${detail}`);
    }
    const data = await res.json();
    (data.files || []).forEach((f: any) => ids.push(f.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

/**
 * Full flow: auth → picker → download. Returns base64 data URIs.
 * Supports picking individual images AND folders (expands folder → all images inside).
 */
export async function pickFromDrive(): Promise<string[]> {
  await ensureLibs();
  const accessToken = await getAccessToken();
  const picked = await showPicker(accessToken);

  // Resolve folders into their image file IDs.
  const imageIds: string[] = [];
  for (const f of picked) {
    if (f.mimeType === FOLDER_MIME) {
      const childIds = await listImagesInFolder(f.id, accessToken);
      imageIds.push(...childIds);
    } else if (f.mimeType.startsWith('image/')) {
      imageIds.push(f.id);
    }
  }

  return await Promise.all(imageIds.map((id) => downloadAsDataUri(id, accessToken)));
}
