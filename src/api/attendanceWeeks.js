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
    console.warn('Falling back to mock attendance weeks:', error.message);
    return sortAttendanceWeeks(MOCK_ATTENDANCE_WEEKS);
  }

  return sortAttendanceWeeks(data || MOCK_ATTENDANCE_WEEKS);
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
    console.warn('Falling back to mock current attendance week:', error.message);
    return MOCK_ATTENDANCE_WEEKS.find((week) => week.is_current) || MOCK_ATTENDANCE_WEEKS[0] || null;
  }

  return data || MOCK_ATTENDANCE_WEEKS.find((week) => week.is_current) || MOCK_ATTENDANCE_WEEKS[0] || null;
}

