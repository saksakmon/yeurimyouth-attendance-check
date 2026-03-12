import {
  INITIAL_NEWCOMER_INTAKES,
  MOCK_ATTENDANCE_RECORDS,
  MOCK_ATTENDANCE_WEEKS,
  MOCK_GROUPS,
  MOCK_MEMBERS,
  TOTAL_MEMBER_COUNT,
} from '../data/mockData.js';
import { hasSupabaseEnv } from '../lib/supabase.js';
import { getAttendanceRecordsByWeek } from './attendanceRecords.js';
import { getAttendanceWeeks, getCurrentAttendanceWeek } from './attendanceWeeks.js';
import { getGroups } from './groups.js';
import { getMembers } from './members.js';
import {
  buildAddMemberGroupOptions,
  buildGroupFilterOptions,
  mapAttendanceRecordRow,
  mapAttendanceWeekRowToMeta,
  mapCurrentAttendanceWeekRowToMeta,
  mapGroupRow,
  mapMemberRow,
  sortAttendanceWeeks,
} from './mappers.js';

function buildBootstrapPayload({ attendanceRecordRows, attendanceWeekRows, currentAttendanceWeekRow, groupRows, memberRows, source }) {
  const groups = groupRows.map(mapGroupRow);
  const groupsById = Object.fromEntries(groups.map((group) => [group.id, group]));
  const attendanceWeeks = sortAttendanceWeeks(attendanceWeekRows).map(mapAttendanceWeekRowToMeta);
  const attendanceWeeksById = Object.fromEntries(attendanceWeeks.map((week) => [week.id, week]));
  const members = memberRows.map((member) => mapMemberRow(member, groupsById));
  const attendanceRecords = attendanceRecordRows.map((record) => mapAttendanceRecordRow(record, attendanceWeeksById));
  const currentAttendanceMeta = mapCurrentAttendanceWeekRowToMeta(currentAttendanceWeekRow);

  return {
    addMemberGroupOptions: buildAddMemberGroupOptions(groups),
    attendanceRecords,
    attendanceWeeks,
    currentAttendanceMeta,
    currentServiceDate: currentAttendanceWeekRow?.sunday_date || currentAttendanceMeta.serviceDate,
    currentWeekKey: currentAttendanceWeekRow?.week_key || currentAttendanceMeta.weekKey,
    groupFilterOptions: buildGroupFilterOptions(groups),
    groups,
    members,
    newcomerIntakes: INITIAL_NEWCOMER_INTAKES,
    source,
    totalMemberCount: source === 'mock' ? TOTAL_MEMBER_COUNT : members.filter((member) => member.isActive).length,
  };
}

export async function getAppBootstrapData() {
  const [groupRows, memberRows, attendanceWeekRows, currentAttendanceWeekRow] = await Promise.all([
    getGroups(),
    getMembers(),
    getAttendanceWeeks(),
    getCurrentAttendanceWeek(),
  ]);

  if (hasSupabaseEnv && (groupRows.length === 0 || memberRows.length === 0 || attendanceWeekRows.length === 0)) {
    return getFallbackAppBootstrapData();
  }

  const resolvedWeekRows = attendanceWeekRows.length > 0 ? attendanceWeekRows : MOCK_ATTENDANCE_WEEKS;
  const resolvedCurrentWeek = currentAttendanceWeekRow || resolvedWeekRows.find((week) => week.is_current) || resolvedWeekRows[0] || null;
  const attendanceRecordRows = (
    await Promise.all(resolvedWeekRows.map((week) => getAttendanceRecordsByWeek(week.id)))
  ).flat();

  return buildBootstrapPayload({
    attendanceRecordRows,
    attendanceWeekRows: resolvedWeekRows,
    currentAttendanceWeekRow: resolvedCurrentWeek,
    groupRows,
    memberRows,
    source: hasSupabaseEnv ? 'supabase' : 'mock',
  });
}

export function getFallbackAppBootstrapData() {
  return buildBootstrapPayload({
    attendanceRecordRows: MOCK_ATTENDANCE_RECORDS,
    attendanceWeekRows: MOCK_ATTENDANCE_WEEKS,
    currentAttendanceWeekRow: MOCK_ATTENDANCE_WEEKS.find((week) => week.is_current) || MOCK_ATTENDANCE_WEEKS[0] || null,
    groupRows: MOCK_GROUPS,
    memberRows: MOCK_MEMBERS,
    source: 'mock',
  });
}
