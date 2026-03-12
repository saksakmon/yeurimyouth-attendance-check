import { MOCK_GROUPS } from '../data/mockData.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

export async function getGroups() {
  if (!hasSupabaseEnv || !supabase) {
    return MOCK_GROUPS;
  }

  const { data, error } = await supabase
    .from('groups')
    .select('id, name, group_type, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`[groups] read failed: ${error.message}`);
  }

  return data || [];
}
