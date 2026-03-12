import { MOCK_ATTENDANCE_RECORDS } from '../data/mockData.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

function createMockId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildAttendanceRecordPayload(payload) {
  return {
    ...payload,
    note: payload.note ?? null,
  };
}

function logAttendanceWrite(message, payload) {
  console.info(`[attendance_records] ${message}`, payload);
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
  const nextPayload = buildAttendanceRecordPayload(payload);

  if (!hasSupabaseEnv || !supabase) {
    const mockRow = {
      id: createMockId('attendance'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...nextPayload,
    };

    logAttendanceWrite('using local mock save', mockRow);
    return mockRow;
  }

  logAttendanceWrite('saveAttendanceRecord via supabase', nextPayload);

  const { data: existingRows, error: existingError } = await supabase
    .from('attendance_records')
    .select('id, member_id, attendance_week_id, attendance_type, attended_at, source, note, created_at, updated_at')
    .eq('member_id', nextPayload.member_id)
    .eq('attendance_week_id', nextPayload.attendance_week_id)
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
        attendance_type: nextPayload.attendance_type,
        attended_at: nextPayload.attended_at,
        source: nextPayload.source,
        note: nextPayload.note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, member_id, attendance_week_id, attendance_type, attended_at, source, note, created_at, updated_at')
      .single();

    if (error) {
      console.error('[attendance_records] update failed', error);
      throw new Error(`[attendance_records] update failed: ${error.message}`);
    }

    logAttendanceWrite('saveAttendanceRecord update success', {
      attendanceType: data.attendance_type,
      id: data.id,
      memberId: data.member_id,
      weekId: data.attendance_week_id,
    });
    return data;
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert(nextPayload)
    .select('id, member_id, attendance_week_id, attendance_type, attended_at, source, note, created_at, updated_at')
    .single();

  if (error) {
    console.error('[attendance_records] insert failed', error);
    throw new Error(`[attendance_records] insert failed: ${error.message}`);
  }

  logAttendanceWrite('saveAttendanceRecord insert success', {
    attendanceType: data.attendance_type,
    id: data.id,
    memberId: data.member_id,
    weekId: data.attendance_week_id,
  });
  return data;
}
