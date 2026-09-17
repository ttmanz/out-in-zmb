import { supabase } from './supabase';

export const getProfile = (userId) =>
  supabase
    .from('profiles')
    .select('id, full_name, visibility, venue_visibility, allow_friend_requests, push_notifications_enabled, status, is_admin, is_staff, account_type, photo_url, dob, gender, city, bio, interests, spoken_languages, phone, instagram, profile_completed, subscription_plan, subscription_expires_at, created_at')
    .eq('id', userId)
    .single();

export const updateProfileSettings = (userId, { visibility, allow_friend_requests, full_name, venue_visibility, push_notifications_enabled }) =>
  supabase.from('profiles').update({ visibility, allow_friend_requests, full_name, venue_visibility, push_notifications_enabled }).eq('id', userId);

export const updateFullProfile = (userId, fields) =>
  supabase.from('profiles').update({ ...fields, profile_completed: true }).eq('id', userId);
