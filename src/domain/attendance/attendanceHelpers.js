import { ATTENDANCE_TYPE_LABELS, RECENT_ABSENCE_WINDOW_SIZE } from '../../constants/app.js';
import { formatAttendedTime } from '../../api/mappers.js';
import { getMemberLifecycleLabel, isMemberEligibleForRecentAbsenceWindow } from '../members/memberHelpers.js';
import { createId, formatNow } from '../shared/helpers.js';

export function isPresentAttendanceType(attendanceType) {
  return attendanceType === 'youth' || attendanceType === 'adult';
}

export function getAttendanceTypeLabel(attendanceType) {
  return ATTENDANCE_TYPE_LABELS[attendanceType] || '결석';
}

export function getAttendanceRecord(records, memberId, weekKey) {
  return records.find((record) => record.memberId === memberId && record.weekKey === weekKey) || null;
}

export function getRecentAttendanceWindow(weekOptions, selectedWeekKey) {
  const selectedIndex = weekOptions.findIndex((option) => option.weekKey === selectedWeekKey);
  const startIndex = selectedIndex === -1 ? 0 : selectedIndex;

  return {
    startIndex,
    recentWeeks: weekOptions.slice(startIndex, startIndex + RECENT_ABSENCE_WINDOW_SIZE),
  };
}

export function buildAttendanceMap(records, weekKey) {
  return Object.fromEntries(
    records
      .filter((record) => record.weekKey === weekKey && isPresentAttendanceType(record.attendanceType))
      .map((record) => [record.memberId, record.attendedAt]),
  );
}

export function upsertAttendanceRecord(records, nextRecord) {
  const existingIndex = records.findIndex(
    (record) => record.memberId === nextRecord.memberId && record.weekKey === nextRecord.weekKey,
  );

  if (existingIndex === -1) {
    return [...records, { ...nextRecord, id: nextRecord.id || createId('attendance') }];
  }

  return records.map((record, index) =>
    index === existingIndex
      ? {
          ...record,
          ...nextRecord,
          id: nextRecord.id || record.id,
        }
      : record,
  );
}

export function buildAttendanceUpdate(
  existingRecord,
  memberId,
  weekMeta,
  nextAttendanceType,
  source,
  baseTime = formatNow(),
  baseTimestamp = new Date().toISOString(),
) {
  const wasPresent = isPresentAttendanceType(existingRecord?.attendanceType);
  const willBePresent = isPresentAttendanceType(nextAttendanceType);
  const attendedAtRaw = willBePresent
    ? wasPresent
      ? existingRecord?.attendedAtRaw || baseTimestamp
      : baseTimestamp
    : null;
  const attendedAt = willBePresent
    ? wasPresent
      ? existingRecord?.attendedAt || formatAttendedTime(attendedAtRaw) || baseTime
      : formatAttendedTime(attendedAtRaw) || baseTime
    : null;

  return {
    memberId,
    weekKey: weekMeta.weekKey,
    serviceDate: weekMeta.serviceDate,
    attendanceType: nextAttendanceType,
    attendedAt,
    attendedAtRaw,
    source,
    note: existingRecord?.note || null,
  };
}

export function buildAppAttendanceRecordFromRow(row, weekMeta) {
  return {
    id: row.id,
    memberId: row.member_id,
    weekKey: weekMeta.weekKey,
    serviceDate: weekMeta.serviceDate,
    attendanceType: row.attendance_type,
    attendedAt: formatAttendedTime(row.attended_at),
    attendedAtRaw: row.attended_at || null,
    source: row.source,
    note: row.note || null,
  };
}

export function getRecentAbsenceStreakCount(members, records, weekOptions, selectedWeekKey, isMemberActiveForWeek) {
  const { recentWeeks } = getRecentAttendanceWindow(weekOptions, selectedWeekKey);

  if (recentWeeks.length < RECENT_ABSENCE_WINDOW_SIZE) return 0;

  const latestWeekInWindow = recentWeeks[0];

  return members.filter((member) =>
    isMemberEligibleForRecentAbsenceWindow(member, latestWeekInWindow) &&
    recentWeeks.every((week) => {
      if (!isMemberActiveForWeek(member, week.serviceDate)) return false;

      const record = getAttendanceRecord(records, member.id, week.weekKey);
      return !isPresentAttendanceType(record?.attendanceType);
    }),
  ).length;
}

export function getRecentAbsenceStreakRows(
  members,
  records,
  weekOptions,
  selectedWeekKey,
  groups,
  isMemberActiveForWeek,
) {
  const { startIndex, recentWeeks } = getRecentAttendanceWindow(weekOptions, selectedWeekKey);

  if (recentWeeks.length < RECENT_ABSENCE_WINDOW_SIZE) return [];

  const latestWeekInWindow = recentWeeks[0];
  const oldestWeekInWindow = recentWeeks[recentWeeks.length - 1];
  const earlierWeeks = weekOptions.slice(startIndex + recentWeeks.length);

  return members
    .filter((member) =>
      isMemberEligibleForRecentAbsenceWindow(member, latestWeekInWindow) &&
      recentWeeks.every((week) => {
        if (!isMemberActiveForWeek(member, week.serviceDate)) return false;

        const record = getAttendanceRecord(records, member.id, week.weekKey);
        return !isPresentAttendanceType(record?.attendanceType);
      }),
    )
    .map((member) => {
      const lastPresentWeek = earlierWeeks.find((week) => {
        if (!isMemberActiveForWeek(member, week.serviceDate)) return false;

        const record = getAttendanceRecord(records, member.id, week.weekKey);
        return isPresentAttendanceType(record?.attendanceType);
      });

      return {
        id: member.id,
        name: member.displayName || member.name,
        memberTypeLabel: getMemberLifecycleLabel(member, groups),
        groupName: member.groupName || '-',
        absenceInfo: lastPresentWeek
          ? `마지막 출석 ${lastPresentWeek.adminLabel}`
          : `${oldestWeekInWindow.adminLabel} 이전 출석 기록 없음`,
      };
    });
}
