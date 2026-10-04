import { supabase } from './supabase';
import { updatePointsRule } from './points';

// Agents: a member who gets enough friends to complete their profile is made an
// agent automatically, and earns a higher referral bonus. Everything is decided
// server-side — see supabase/migrations/20261004000000_referrals_and_agents.sql.

// --- Member ---

// Their own progress: counted friends, friends still to finish their profile, the
// number needed to become an agent, and what each referral pays them.
export const getMyReferralStats = () => supabase.rpc('my_referral_stats');

// --- Admin ---

export const getAgentSettings = () =>
  supabase.from('agent_settings').select('enabled, referrals_required').eq('id', true).single();

export const updateAgentSettings = ({ enabled, referralsRequired }) =>
  supabase
    .from('agent_settings')
    .update({ enabled, referrals_required: referralsRequired, updated_at: new Date().toISOString() })
    .eq('id', true);

// The shared agent bonus lives with the other points rules.
export const getAgentRate = () =>
  supabase.from('points_rules').select('amount').eq('rule_key', 'agent_referral_bonus').maybeSingle();

export const setAgentRate = (amount) => updatePointsRule('agent_referral_bonus', amount);

// Every agent, plus everyone who has referred somebody (with their progress).
export const getAgentOverview = () => supabase.rpc('agent_overview');

export const setAgent = (userId, isAgent) =>
  supabase.rpc('set_agent', { p_user_id: userId, p_is_agent: isAgent });

// Bonus for one agent; null goes back to the shared agent rate.
export const setAgentBonus = (userId, amount) =>
  supabase.rpc('set_agent_bonus', { p_user_id: userId, p_amount: amount });

// After the number changes: promotes everyone who already qualifies. Returns how many.
export const evaluateAllAgents = () => supabase.rpc('evaluate_all_agents');
