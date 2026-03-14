import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

const MEMBER_CHANGE_HISTORY_COLUMNS = [
  'id',
  'member_id',
  'action_label',
  'content',
  'kind',
  'changed_by',
  'changed_at',
  'next_is_active',
].join(', ');

function mapMemberChangeHistoryRow(row) {
  return {
    id: row.id,
    actionLabel: row.action_label,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
    content: row.content,
    kind: row.kind,
    memberId: row.member_id,
    nextIsActive: row.next_is_active ?? null,
  };
}

function mapMemberChangeHistoryEntry(entry) {
  return {
    action_label: entry.actionLabel,
    changed_at: entry.changedAt,
    changed_by: entry.changedBy,
    content: entry.content,
    id: entry.id,
    kind: entry.kind,
    member_id: entry.memberId,
    next_is_active: entry.nextIsActive,
  };
}

export async function getMemberChangeHistory() {
  if (!hasSupabaseEnv || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('member_change_history')
    .select(MEMBER_CHANGE_HISTORY_COLUMNS)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    throw new Error(`[member_change_history] read failed: ${error.message}`);
  }

  return (data || []).map(mapMemberChangeHistoryRow);
}

export async function saveMemberChangeHistoryEntries(entries) {
  if (!entries?.length) return [];

  if (!hasSupabaseEnv || !supabase) {
    return entries;
  }

  const payload = entries.map(mapMemberChangeHistoryEntry);
  const { data, error } = await supabase
    .from('member_change_history')
    .insert(payload)
    .select(MEMBER_CHANGE_HISTORY_COLUMNS);

  if (error) {
    throw new Error(`[member_change_history] insert failed: ${error.message}`);
  }

  return (data || []).map(mapMemberChangeHistoryRow);
}
