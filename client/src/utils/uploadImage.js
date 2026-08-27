import { removeImageBackground } from './removeBackground';
import { authFetch } from './apiClient';

export async function uploadImage(file, options = {}) {
  if (!file) {
    throw new Error('No file provided');
  }

  const shouldRemoveBackground = options.removeBackground === true;
  const shouldUpscale = options.upscale !== false;
  let uploadFile = file;

  if (shouldRemoveBackground) {
    uploadFile = await removeImageBackground(file, options.onProgress);
  }

  const formData = new FormData();
  formData.append('image', uploadFile);
  formData.append('upscale', shouldUpscale ? 'true' : 'false');
  formData.append('watermark', options.watermark !== false ? 'true' : 'false');

  // Uploads are admin-only and verified server-side; the token proves the role.
  const response = await authFetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let message = 'Upload failed';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // ignore parse errors, keep default message
    }
    throw new Error(message);
  }

  const data = await response.json();
  return data.url;
}
