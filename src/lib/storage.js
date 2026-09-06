import { File } from 'expo-file-system';
import { CONFIG } from '../constants/config';
import { supabase } from './supabase';

const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'm4v'];

// Bypasses supabase-js's storage client, which never attaches the signed-in
// user's access token to upload requests in this SDK version (it silently
// falls back to the anon key, so every RLS-protected upload is rejected).
const uploadToBucket = async (bucket, path, uri, contentType, upsert) => {
  const arrayBuffer = await new File(uri).arrayBuffer();
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${CONFIG.supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token ?? CONFIG.supabaseAnonKey}`,
      'Content-Type': contentType,
      'x-upsert': String(upsert),
    },
    body: arrayBuffer,
  });
  if (!response.ok) return { error: new Error(await response.text()) };
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl };
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
