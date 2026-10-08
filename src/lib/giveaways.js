import { supabase } from './supabase';

// Only giveaways that haven't ended; the hourly cleanup deletes them a day after.
export const getGiveaways = () =>
  supabase
    .from('giveaways')
    .select('id, created_by, venue_name, title, description, photo_url, video_url, ends_at, created_at, profiles:created_by(full_name)')
    .gt('ends_at', new Date().toISOString())
    .order('ends_at', { ascending: true });

// RLS: only an approved venue or an admin can insert, and only as themselves.
export const createGiveaway = ({ userId, venueName, title, description, photo_url, video_url, endsAt }) =>
  supabase.from('giveaways').insert({
    created_by: userId,
    venue_name: venueName,
    title,
    description,
    photo_url,
    video_url,
    ends_at: endsAt,
  });

export const deleteGiveaway = (id) => supabase.from('giveaways').delete().eq('id', id);
