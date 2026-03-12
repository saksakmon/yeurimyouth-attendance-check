import { MOCK_MEMBERS } from '../data/mockData.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

function createMockId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function logMemberWrite(message, payload) {
  console.info(`[members] ${message}`, payload);
}

export async function getMembers() {
  if (!hasSupabaseEnv || !supabase) {
    return MOCK_MEMBERS;
  }

  const { data, error } = await supabase
    .from('members')
    .select('id, name, member_type, group_id, is_active, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`[members] read failed: ${error.message}`);
  }

  return data || [];
}

export async function createMember(payload) {
  if (!hasSupabaseEnv || !supabase) {
    const mockRow = {
      id: createMockId('member'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    };

    logMemberWrite('using local mock insert', mockRow);
    return mockRow;
  }

  logMemberWrite('createMember insert via supabase', payload);
  const { data, error } = await supabase
    .from('members')
    .insert(payload)
    .select('id, name, member_type, group_id, is_active, created_at, updated_at')
    .single();

  if (error) {
    console.error('[members] insert failed', error);
    throw new Error(`[members] insert failed: ${error.message}`);
  }

  logMemberWrite('createMember insert success', {
    groupId: data.group_id,
    id: data.id,
    memberType: data.member_type,
  });
  return data;
}
