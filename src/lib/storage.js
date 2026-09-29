import { File } from 'expo-file-system';
import { CONFIG } from '../constants/config';
import { supabase } from './supabase';

const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'm4v'];

// Bypasses supabase-js's storage client, which never attaches the signed-in
// user's access token to storage requests in this SDK version (it silently
// falls back to the anon key, so every RLS-protected call is rejected).
const authHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${session?.access_token ?? CONFIG.supabaseAnonKey}`,
  };
};

const uploadToBucket = async (bucket, path, uri, contentType, upsert) => {
  const arrayBuffer = await new File(uri).arrayBuffer();
  const response = await fetch(`${CONFIG.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': contentType, 'x-upsert': String(upsert) },
    body: arrayBuffer,
  });
  if (!response.ok) return { error: new Error(await response.text()) };
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
};

// Receipts live in a private bucket — returns the storage path (what the
// claim row keeps), never a public URL.
export const uploadReceipt = (userId, uri) => {
  const ext = uri.split('.').pop().split('?')[0].toLowerCase() || 'jpg';
  return uploadToBucket('receipts', `${userId}/${Date.now()}.${ext}`, uri, `image/${ext}`, false);
};

// Short-lived link to a private file, for displaying it. Null if the caller
// isn't allowed to see it.
export const getSignedUrl = async (bucket, path, expiresIn = 3600) => {
  const response = await fetch(`${CONFIG.supabaseUrl}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  if (!response.ok) return null;
  const { signedURL } = await response.json();
  return `${CONFIG.supabaseUrl}/storage/v1${signedURL}`;
};

export const uploadAvatar = async (userId, uri) => {
  const ext = uri.split('.').pop().toLowerCase();
  const path = `${userId}/avatar.${ext}`;
  const { url, error } = await uploadToBucket('avatars', path, uri, `image/${ext}`, true);
  if (error) return { error };
  return { url: `${url}?t=${Date.now()}` };
};

export const uploadPostPhoto = (userId, uri) => {
  const ext = uri.split('.').pop().split('?')[0].toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  return uploadToBucket('post-photos', path, uri, `image/${ext}`, false);
};

// Photo OR video for the feed features (happenings, events, activity events,
// spur, market). Routed to the `story-media` bucket rather than `post-photos`
// because that bucket already permits video. Mirrors uploadStoryMedia.
export const uploadPostMedia = async (userId, uri) => {
  const ext = uri.split('.').pop().split('?')[0].toLowerCase() || 'jpg';
  const isVideo = VIDEO_EXTS.includes(ext);
  const path = `${userId}/posts/${Date.now()}.${ext}`;
  const contentType = isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext}`;
  const { url, error } = await uploadToBucket('story-media', path, uri, contentType, false);
  if (error) return { error };
  return { url, isVideo };
};

export const uploadStoryMedia = async (userId, uri) => {
  const ext = uri.split('.').pop().split('?')[0].toLowerCase() || 'jpg';
  const isVideo = VIDEO_EXTS.includes(ext);
  const path = `${userId}/${Date.now()}.${ext}`;
  const contentType = isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext}`;
  const { url, error } = await uploadToBucket('story-media', path, uri, contentType, false);
  if (error) return { error };
  return { url, isVideo };
};

// Clip of the Day — reuses the story-media bucket (already supports video)
// rather than provisioning a new bucket just for this.
export const uploadClipVideo = (userId, uri) => {
  const ext = uri.split('.').pop().split('?')[0].toLowerCase() || 'mp4';
  const path = `${userId}/clips/${Date.now()}.${ext}`;
  const contentType = `video/${ext === 'mov' ? 'quicktime' : ext}`;
  return uploadToBucket('story-media', path, uri, contentType, false);
};

// Admin ad creatives — reuses the story-media bucket (already supports
// image/video) rather than provisioning a new bucket just for this.
export const uploadAdMedia = async (userId, uri) => {
  const ext = uri.split('.').pop().split('?')[0].toLowerCase() || 'jpg';
  const isVideo = VIDEO_EXTS.includes(ext);
  const path = `${userId}/ads/${Date.now()}.${ext}`;
  const contentType = isVideo ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext}`;
  const { url, error } = await uploadToBucket('story-media', path, uri, contentType, false);
  if (error) return { error };
  return { url, isVideo };
};
