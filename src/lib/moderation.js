import { supabase } from './supabase';

const NOT_FLAGGED = { flagged: false, reason: null, score: null };

// Claude via the moderate-content Edge Function, so the API key stays
// server-side. Fails open: if the function is unreachable the post is
// allowed through.
export const moderateContent = async (text) => {
  try {
    const { data, error } = await supabase.functions.invoke('moderate-content', {
      body: { text },
    });
    if (error || !data) return NOT_FLAGGED;
    return {
      flagged: data.flagged ?? false,
      reason: data.reason ?? null,
      score: data.score ?? null,
    };
  } catch {
    return NOT_FLAGGED;
  }
};

// Separate from moderateContent above — this isn't a safety check, it's a
// business-policy classifier: is this member using a personal post to
// advertise a business, rather than posting socially? Never blocks the
// post either way; it only feeds commercial_post_flags for admin review.
// Fails open (never flags) if the function is unreachable.
const detectCommercialContent = async (text) => {
  try {
    const { data, error } = await supabase.functions.invoke('detect-commercial-content', {
      body: { text },
    });
    if (error || !data) return { commercial: false, reason: null };
    return { commercial: data.commercial ?? false, reason: data.reason ?? null };
  } catch {
    return { commercial: false, reason: null };
  }
};

const flagCommercialPost = (userId, targetType, targetId, contentExcerpt, reason) =>
  supabase.from('commercial_post_flags').insert({
    user_id: userId,
    target_type: targetType,
    target_id: targetId,
    content_excerpt: contentExcerpt ? contentExcerpt.slice(0, 200) : null,
    reason,
  });

// One-liner for create-flows to call after a successful post: skips venue
// accounts entirely (Market listings excluded by callers simply never
// calling this for that flow — commercial content there is expected),
// classifies, and logs a flag row if it's commercial. Never throws, never
// blocks the post — this runs after the post already succeeded.
export const checkAndFlagIfCommercial = async (profile, targetType, targetId, text) => {
  if (!text || profile?.account_type === 'venue_owner') return;
  const { commercial, reason } = await detectCommercialContent(text);
  if (commercial) {
    // supabase-js query builders are lazy — must be awaited to actually fire
    await flagCommercialPost(profile.id, targetType, targetId, text, reason);
  }
};
