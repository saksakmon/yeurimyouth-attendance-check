import { getAttendanceMetaForDate, getCurrentAttendanceMeta } from '../utils/attendanceMeta.js';

function toSundayDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

export function formatAttendedTime(value) {
  if (!value) return null;
  if (/^\d{2}:\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const hours = String(parsed.getHours()).padStart(2, '0');
    const minutes = String(parsed.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const match = String(value).match(/(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

export function sortAttendanceWeeks(rows) {
  return [...rows].sort((a, b) => String(b.sunday_date).localeCompare(String(a.sunday_date)));
}

export function mapGroupRow(row) {
  return {
    id: row.id,
    name: row.name,
    groupType: row.group_type,
  };
}

export function mapAttendanceWeekRowToMeta(row) {
  const meta = getAttendanceMetaForDate(toSundayDate(row.sunday_date));

  return {
    ...meta,
    id: row.id,
    isCurrent: Boolean(row.is_current),
    serviceDate: row.sunday_date,
    weekKey: row.week_key,
    adminLabel: row.label || meta.adminLabel,
  };
}

export function mapCurrentAttendanceWeekRowToMeta(row) {
  const currentMeta = getCurrentAttendanceMeta();
  if (!row) return currentMeta;

  const weekMeta = mapAttendanceWeekRowToMeta(row);
  return {
    ...weekMeta,
    todayDate: currentMeta.todayDate,
    todayLabel: currentMeta.todayLabel,
  };
}

export function mapMemberRow(row, groupsById) {
  const group = row.group_id ? groupsById[row.group_id] : null;

  return {
    createdAt: row.created_at || null,
    id: row.id,
    name: row.name,
    memberType: row.member_type,
    groupId: row.group_id || null,
    groupName: group?.name || null,
    isActive: row.is_active !== false,
    updatedAt: row.updated_at || null,
  };
}

export function mapAttendanceRecordRow(row, attendanceWeeksById) {
  const attendanceWeek = attendanceWeeksById[row.attendance_week_id];

  return {
    id: row.id,
    memberId: row.member_id,
    weekKey: attendanceWeek?.weekKey || '',
    serviceDate: attendanceWeek?.serviceDate || null,
    attendanceType: row.attendance_type,
    attendedAt: formatAttendedTime(row.attended_at),
    attendedAtRaw: row.attended_at || null,
    source: row.source,
    note: row.note || null,
  };
}

export function buildGroupFilterOptions(groups) {
  return [{ value: 'all', label: '전체' }, ...groups.map((group) => ({ value: group.id, label: group.name }))];
}

export function buildAddMemberGroupOptions(groups) {
  return groups.map((group) => ({ value: group.id, label: group.name }));
}
