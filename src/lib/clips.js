import { supabase } from './supabase';

// Every Monday, a cron job purges every clip with is_approved = false —
// see supabase/migrations/20260906000000_daily_clips.sql.
export const getDailyClips = () =>
  supabase
    .from('daily_clips')
    .select('id, video_url, is_approved, is_flagged, created_at, user:profiles(id, full_name, photo_url)')
    .order('created_at', { ascending: false });

export const createDailyClip = (userId, videoUrl) =>
  supabase.from('daily_clips').insert({ user_id: userId, video_url: videoUrl }).select().single();

export const deleteDailyClip = (id) =>
  supabase.from('daily_clips').delete().eq('id', id);

// Admin-only: RLS restricts these to profiles.is_admin = true
export const setClipApproved = (id, isApproved) =>
  supabase.from('daily_clips').update({ is_approved: isApproved }).eq('id', id);

export const setClipFlagged = (id, isFlagged) =>
  supabase.from('daily_clips').update({ is_flagged: isFlagged }).eq('id', id);
