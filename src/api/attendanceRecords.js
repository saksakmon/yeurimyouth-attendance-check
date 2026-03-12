import { MOCK_ATTENDANCE_RECORDS } from '../data/mockData.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

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
    console.warn(`Falling back to mock attendance records for week ${attendanceWeekId}:`, error.message);
    return MOCK_ATTENDANCE_RECORDS.filter((record) => record.attendance_week_id === attendanceWeekId);
  }

  return data || MOCK_ATTENDANCE_RECORDS.filter((record) => record.attendance_week_id === attendanceWeekId);
}

