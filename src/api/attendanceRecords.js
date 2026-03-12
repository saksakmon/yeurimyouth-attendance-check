import { MOCK_ATTENDANCE_RECORDS } from '../data/mockData.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

function createMockId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAttendanceRecordsByWeek(attendanceWeekId) {
  if (!attendanceWeekId) return [];

  if (!hasSupabaseEnv || !supabase) {
    return MOCK_ATTENDANCE_RECORDS.filter((record) => record.attendance_week_id === attendanceWeekId);
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .select('id, member_id, attendance_week_id, attendance_type, attended_at, source, note, created_at, updated_at')
    .eq('attendance_week_id', attendanceWeekId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`[attendance_records] read failed for week ${attendanceWeekId}: ${error.message}`);
  }

  return data || [];
}

export async function saveAttendanceRecord(payload) {
  if (!hasSupabaseEnv || !supabase) {
    console.info('[attendance_records] using local mock save', payload);
    return {
      id: createMockId('attendance'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...payload,
    };
  }

  console.info('[attendance_records] save via supabase', payload);

  const { data: existingRows, error: existingError } = await supabase
    .from('attendance_records')
    .select('id, member_id, attendance_week_id, attendance_type, attended_at, source, note, created_at, updated_at')
    .eq('member_id', payload.member_id)
    .eq('attendance_week_id', payload.attendance_week_id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('[attendance_records] existing record lookup failed', existingError);
    throw new Error(`[attendance_records] lookup failed: ${existingError.message}`);
  }

  const existing = existingRows?.[0] || null;

  if (existing) {
    const { data, error } = await supabase
      .from('attendance_records')
      .update({
        attendance_type: payload.attendance_type,
        attended_at: payload.attended_at,
        source: payload.source,
        note: payload.note ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, member_id, attendance_week_id, attendance_type, attended_at, source, note, created_at, updated_at')
      .single();

    if (error) {
      console.error('[attendance_records] update failed', error);
      throw new Error(`[attendance_records] update failed: ${error.message}`);
    }

    console.info('[attendance_records] update success', data);
    return data;
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert(payload)
    .select('id, member_id, attendance_week_id, attendance_type, attended_at, source, note, created_at, updated_at')
    .single();

  if (error) {
    console.error('[attendance_records] insert failed', error);
    throw new Error(`[attendance_records] insert failed: ${error.message}`);
  }

  console.info('[attendance_records] insert success', data);
  return data;
}
