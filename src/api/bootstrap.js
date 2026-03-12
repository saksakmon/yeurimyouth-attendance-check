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

function hasCoreBootstrapRows({ attendanceWeekRows, groupRows, memberRows }) {
  return groupRows.length > 0 && memberRows.length > 0 && attendanceWeekRows.length > 0;
}

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

function logBootstrapSource(message, payload) {
  console.info(`[bootstrap] ${message}`, payload || '');
}

export async function getAppBootstrapData() {
  if (!hasSupabaseEnv) {
    logBootstrapSource('falling back to mock source', 'missing supabase env');
    return getFallbackAppBootstrapData();
  }

  try {
    const [groupRows, memberRows, attendanceWeekRows, currentAttendanceWeekRow] = await Promise.all([
      getGroups(),
      getMembers(),
      getAttendanceWeeks(),
      getCurrentAttendanceWeek(),
    ]);

    if (!hasCoreBootstrapRows({ attendanceWeekRows, groupRows, memberRows })) {
      logBootstrapSource('falling back to mock source', {
        reason: 'core tables are empty',
        weeks: attendanceWeekRows.length,
        groups: groupRows.length,
        members: memberRows.length,
      });
      return getFallbackAppBootstrapData();
    }

    const resolvedCurrentWeek = currentAttendanceWeekRow || attendanceWeekRows.find((week) => week.is_current) || attendanceWeekRows[0] || null;
    const attendanceRecordRows = (
      await Promise.all(attendanceWeekRows.map((week) => getAttendanceRecordsByWeek(week.id)))
    ).flat();

    logBootstrapSource('using supabase source', {
      attendanceRecords: attendanceRecordRows.length,
      currentWeekId: resolvedCurrentWeek?.id || null,
      weeks: attendanceWeekRows.length,
      groups: groupRows.length,
      members: memberRows.length,
    });
    return buildBootstrapPayload({
      attendanceRecordRows,
      attendanceWeekRows,
      currentAttendanceWeekRow: resolvedCurrentWeek,
      groupRows,
      memberRows,
      source: 'supabase',
    });
  } catch (error) {
    logBootstrapSource('falling back to mock source', error?.message || error);
    return getFallbackAppBootstrapData();
  }
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
