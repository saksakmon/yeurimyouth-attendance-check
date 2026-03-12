import { MOCK_MEMBERS } from '../data/mockData.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

export async function getMembers() {
  if (!hasSupabaseEnv || !supabase) {
    return MOCK_MEMBERS;
  }

  const { data, error } = await supabase
    .from('members')
    .select('id, name, member_type, group_id, is_active, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Falling back to mock members:', error.message);
    return MOCK_MEMBERS;
  }

  return data || MOCK_MEMBERS;
}

