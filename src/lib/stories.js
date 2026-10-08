import { supabase } from './supabase';

export const STORY_EXPIRY_DAYS = 15;

const expiryThreshold = () =>
  new Date(Date.now() - STORY_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

export const getStories = () =>
  supabase
    .from('stories')
    .select('*, profiles:user_id(full_name, photo_url), story_likes(count)')
    .gte('created_at', expiryThreshold())
    .order('created_at', { ascending: false })
    .limit(50);

export const getFriendStories = async (userId) => {
  const { data: friendships, error: fErr } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (fErr) return { data: [], error: fErr };

  const ids = [
    ...(friendships ?? []).map((f) =>
      f.requester_id === userId ? f.addressee_id : f.requester_id
    ),
    userId,
  ];

  return supabase
    .from('stories')
    .select('*, profiles:user_id(full_name, photo_url), story_likes(count)')
    .in('user_id', ids)
    .gte('created_at', expiryThreshold())
    .order('created_at', { ascending: false })
    .limit(50);
};

export const createStory = (userId, { text, photo_url, video_url, link_url = null, link_title = null, link_image = null, link_domain = null }) =>
  supabase.from('stories').insert({ user_id: userId, text, photo_url, video_url, link_url, link_title, link_image, link_domain });

// Admin-only: RLS restricts this to profiles.is_admin = true
export const adminDeleteStory = (id) =>
  supabase.from('stories').delete().eq('id', id);

export const deleteStory = (id, userId) =>
  supabase.from('stories').delete().eq('id', id).eq('user_id', userId);

export const getStoryReplies = (storyId) =>
  supabase
    .from('story_replies')
    .select('*, profiles:user_id(full_name)')
    .eq('story_id', storyId)
    .order('created_at', { ascending: true });

export const createStoryReply = (userId, storyId, message) =>
  supabase.from('story_replies').insert({ story_id: storyId, user_id: userId, message });

// Which of the given stories the user has liked/saved — scoped to the
// currently-loaded batch rather than their full history.
export const getMyStoryLikes = (userId, storyIds) =>
  supabase.from('story_likes').select('story_id').eq('user_id', userId).in('story_id', storyIds);

export const getMyStorySaves = (userId, storyIds) =>
  supabase.from('story_saves').select('story_id').eq('user_id', userId).in('story_id', storyIds);

export const likeStory = (storyId, userId) =>
  supabase.from('story_likes').insert({ story_id: storyId, user_id: userId });

export const unlikeStory = (storyId, userId) =>
  supabase.from('story_likes').delete().eq('story_id', storyId).eq('user_id', userId);

export const saveStory = (storyId, userId) =>
  supabase.from('story_saves').insert({ story_id: storyId, user_id: userId });

export const unsaveStory = (storyId, userId) =>
  supabase.from('story_saves').delete().eq('story_id', storyId).eq('user_id', userId);

// No expiry filter here — the whole point of saving is to still find it
// later, even after it's aged out of the main feed.
export const getSavedStories = async (userId) => {
  const { data, error } = await supabase
    .from('story_saves')
    .select('story:stories(*, profiles:user_id(full_name, photo_url), story_likes(count))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data: (data ?? []).map((r) => r.story).filter(Boolean), error };
};
