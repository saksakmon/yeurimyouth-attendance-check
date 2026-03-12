import { MOCK_ATTENDANCE_WEEKS } from '../data/mockData.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';
import { sortAttendanceWeeks } from './mappers.js';

export async function getAttendanceWeeks() {
  if (!hasSupabaseEnv || !supabase) {
    return sortAttendanceWeeks(MOCK_ATTENDANCE_WEEKS);
  }

  const { data, error } = await supabase
    .from('attendance_weeks')
    .select('id, week_key, sunday_date, label, is_current, created_at')
    .order('sunday_date', { ascending: false });

  if (error) {
    throw new Error(`[attendance_weeks] read failed: ${error.message}`);
  }

  return sortAttendanceWeeks(data || []);
}

export async function getCurrentAttendanceWeek() {
  if (!hasSupabaseEnv || !supabase) {
    return MOCK_ATTENDANCE_WEEKS.find((week) => week.is_current) || MOCK_ATTENDANCE_WEEKS[0] || null;
  }

  const { data, error } = await supabase
    .from('attendance_weeks')
    .select('id, week_key, sunday_date, label, is_current, created_at')
    .eq('is_current', true)
    .maybeSingle();

  if (error) {
    throw new Error(`[attendance_weeks] current read failed: ${error.message}`);
  }

  return data || null;
}
