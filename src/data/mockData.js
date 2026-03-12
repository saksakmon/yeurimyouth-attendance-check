import { getAttendanceMetaByWeekOffset, getCurrentAttendanceMeta } from '../utils/attendanceMeta.js';

export const CURRENT_ATTENDANCE_META = getCurrentAttendanceMeta();
export const CURRENT_WEEK_KEY = CURRENT_ATTENDANCE_META.weekKey;
export const CURRENT_SERVICE_DATE = CURRENT_ATTENDANCE_META.serviceDate;
export const CURRENT_SERVICE_ROUND = 4;
export const TOTAL_MEMBER_COUNT = 123;

export const ADMIN_WEEK_OPTIONS = Array.from({ length: 6 }, (_, index) => getAttendanceMetaByWeekOffset(-index));
const [CURRENT_WEEK, PREVIOUS_WEEK_1, PREVIOUS_WEEK_2, PREVIOUS_WEEK_3, PREVIOUS_WEEK_4, PREVIOUS_WEEK_5] = ADMIN_WEEK_OPTIONS;

export const GROUP_OPTIONS = [
  { id: 'all', name: '전체' },
  { id: 'group-love', name: '사랑숲' },
  { id: 'group-grace', name: '은혜숲' },
  { id: 'group-newcomer', name: '새가족숲' },
];

export const MOCK_GROUPS = [
  { id: 'group-love', name: '사랑숲', group_type: 'regular', created_at: '2026-01-05T00:00:00+09:00' },
  { id: 'group-grace', name: '은혜숲', group_type: 'regular', created_at: '2026-01-05T00:00:00+09:00' },
  { id: 'group-newcomer', name: '새가족숲', group_type: 'newcomer', created_at: '2026-01-05T00:00:00+09:00' },
];

export const MOCK_ATTENDANCE_WEEKS = ADMIN_WEEK_OPTIONS.map((week, index) => ({
  id: `attendance-week-${index + 1}`,
  week_key: week.weekKey,
  sunday_date: week.serviceDate,
  label: week.adminLabel,
  is_current: index === 0,
  created_at: `${week.serviceDate}T00:00:00+09:00`,
}));

const ATTENDANCE_WEEK_ID_BY_KEY = Object.fromEntries(MOCK_ATTENDANCE_WEEKS.map((week) => [week.week_key, week.id]));

/**
 * @typedef {Object} Member
 * @property {string} id
 * @property {string} name
 * @property {'registered' | 'visitor'} memberType
 * @property {string | null} groupId
 * @property {string | null} groupName
 */

/**
 * @typedef {Object} AttendanceRecord
 * @property {string} id
 * @property {string} memberId
 * @property {string} weekKey
 * @property {string} serviceDate
 * @property {'absent' | 'youth' | 'adult'} attendanceType
 * @property {string | null} attendedAt
 * @property {'kiosk' | 'admin'} source
 */

/**
 * @typedef {Object} NewcomerIntake
 * @property {string} id
 * @property {string} name
 * @property {string} intakeDate
 * @property {'visit' | 'registered'} intakeType
 * @property {boolean} attendanceLinked
 * @property {string | null} memberId
 */

/** @type {Member[]} */
export const INITIAL_MEMBERS = [
  { id: 'member-1', name: '강지훈', memberType: 'registered', groupId: 'group-love', groupName: '사랑숲' },
  { id: 'member-2', name: '김나은', memberType: 'visitor', groupId: 'group-newcomer', groupName: '새가족숲' },
  { id: 'member-3', name: '김지원', memberType: 'registered', groupId: 'group-love', groupName: '사랑숲' },
  { id: 'member-4', name: '김정원', memberType: 'registered', groupId: 'group-grace', groupName: '은혜숲' },
  { id: 'member-5', name: '김시우', memberType: 'registered', groupId: 'group-grace', groupName: '은혜숲' },
  { id: 'member-6', name: '김예린', memberType: 'registered', groupId: 'group-newcomer', groupName: '새가족숲' },
  { id: 'member-7', name: '박서현', memberType: 'registered', groupId: 'group-love', groupName: '사랑숲' },
  { id: 'member-8', name: '이은수', memberType: 'visitor', groupId: 'group-newcomer', groupName: '새가족숲' },
];

export const MOCK_MEMBERS = INITIAL_MEMBERS.map((member) => ({
  id: member.id,
  name: member.name,
  member_type: member.memberType,
  group_id: member.groupId,
  is_active: true,
  created_at: '2026-01-12T00:00:00+09:00',
  updated_at: '2026-03-13T00:00:00+09:00',
}));

/** @type {AttendanceRecord[]} */
export const INITIAL_ATTENDANCE_RECORDS = [
  { id: 'attendance-1', memberId: 'member-6', weekKey: CURRENT_WEEK.weekKey, serviceDate: CURRENT_WEEK.serviceDate, attendanceType: 'youth', attendedAt: '11:08', source: 'admin' },
  { id: 'attendance-2', memberId: 'member-1', weekKey: CURRENT_WEEK.weekKey, serviceDate: CURRENT_WEEK.serviceDate, attendanceType: 'adult', attendedAt: '10:36', source: 'admin' },
  { id: 'attendance-3', memberId: 'member-4', weekKey: CURRENT_WEEK.weekKey, serviceDate: CURRENT_WEEK.serviceDate, attendanceType: 'absent', attendedAt: null, source: 'admin' },
  { id: 'attendance-4', memberId: 'member-1', weekKey: PREVIOUS_WEEK_1.weekKey, serviceDate: PREVIOUS_WEEK_1.serviceDate, attendanceType: 'youth', attendedAt: '11:03', source: 'admin' },
  { id: 'attendance-5', memberId: 'member-2', weekKey: PREVIOUS_WEEK_1.weekKey, serviceDate: PREVIOUS_WEEK_1.serviceDate, attendanceType: 'youth', attendedAt: '11:11', source: 'admin' },
  { id: 'attendance-6', memberId: 'member-6', weekKey: PREVIOUS_WEEK_1.weekKey, serviceDate: PREVIOUS_WEEK_1.serviceDate, attendanceType: 'adult', attendedAt: '09:52', source: 'admin' },
  { id: 'attendance-7', memberId: 'member-1', weekKey: PREVIOUS_WEEK_2.weekKey, serviceDate: PREVIOUS_WEEK_2.serviceDate, attendanceType: 'youth', attendedAt: '11:12', source: 'admin' },
  { id: 'attendance-8', memberId: 'member-3', weekKey: PREVIOUS_WEEK_2.weekKey, serviceDate: PREVIOUS_WEEK_2.serviceDate, attendanceType: 'youth', attendedAt: '11:17', source: 'admin' },
  { id: 'attendance-9', memberId: 'member-7', weekKey: PREVIOUS_WEEK_2.weekKey, serviceDate: PREVIOUS_WEEK_2.serviceDate, attendanceType: 'adult', attendedAt: '09:41', source: 'admin' },
  { id: 'attendance-10', memberId: 'member-2', weekKey: PREVIOUS_WEEK_3.weekKey, serviceDate: PREVIOUS_WEEK_3.serviceDate, attendanceType: 'youth', attendedAt: '11:07', source: 'admin' },
  { id: 'attendance-11', memberId: 'member-6', weekKey: PREVIOUS_WEEK_3.weekKey, serviceDate: PREVIOUS_WEEK_3.serviceDate, attendanceType: 'youth', attendedAt: '11:04', source: 'admin' },
  { id: 'attendance-12', memberId: 'member-1', weekKey: PREVIOUS_WEEK_4.weekKey, serviceDate: PREVIOUS_WEEK_4.serviceDate, attendanceType: 'youth', attendedAt: '11:16', source: 'admin' },
  { id: 'attendance-13', memberId: 'member-4', weekKey: PREVIOUS_WEEK_4.weekKey, serviceDate: PREVIOUS_WEEK_4.serviceDate, attendanceType: 'adult', attendedAt: '10:02', source: 'admin' },
  { id: 'attendance-14', memberId: 'member-7', weekKey: PREVIOUS_WEEK_5.weekKey, serviceDate: PREVIOUS_WEEK_5.serviceDate, attendanceType: 'absent', attendedAt: null, source: 'admin' },
];

export const MOCK_ATTENDANCE_RECORDS = INITIAL_ATTENDANCE_RECORDS.map((record) => ({
  id: record.id,
  member_id: record.memberId,
  attendance_week_id: ATTENDANCE_WEEK_ID_BY_KEY[record.weekKey] || null,
  attendance_type: record.attendanceType,
  attended_at: record.attendedAt ? `${record.serviceDate}T${record.attendedAt}:00+09:00` : null,
  source: record.source,
  note: null,
  created_at: `${record.serviceDate}T12:00:00+09:00`,
  updated_at: `${record.serviceDate}T12:00:00+09:00`,
}));

export const MOCK_ADMIN_USERS = [
  {
    id: 'admin-user-1',
    email: 'admin@example.com',
    name: '운영 관리자',
    role: 'admin',
    is_active: true,
    created_at: '2026-01-05T00:00:00+09:00',
  },
];

/** @type {NewcomerIntake[]} */
export const INITIAL_NEWCOMER_INTAKES = [
  { id: 'intake-1', name: '김나은', intakeDate: PREVIOUS_WEEK_2.serviceDate, intakeType: 'registered', attendanceLinked: true, memberId: 'member-2' },
  { id: 'intake-2', name: '이은수', intakeDate: CURRENT_WEEK.serviceDate, intakeType: 'visit', attendanceLinked: false, memberId: 'member-8' },
];
