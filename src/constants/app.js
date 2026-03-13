export const ACCENT_COLOR = '#1677FF';

export const APP_SCREENS = {
  preAttendanceConfirm: 'preAttendanceConfirm',
  attendanceKiosk: 'attendanceKiosk',
  adminLogin: 'adminLogin',
  adminDashboard: 'adminDashboard',
};

export const APP_PATHS = {
  landing: '/',
  kiosk: '/kiosk',
  admin: '/admin',
  adminAttendance: '/admin/attendance',
  adminMembers: '/admin/members',
};

export const ADMIN_SECTIONS = {
  attendance: 'attendance',
  members: 'members',
};

export const ADMIN_SECTION_PATHS = {
  [ADMIN_SECTIONS.attendance]: APP_PATHS.adminAttendance,
  [ADMIN_SECTIONS.members]: APP_PATHS.adminMembers,
};

export const PATH_ADMIN_SECTION_MAP = {
  [APP_PATHS.adminAttendance]: ADMIN_SECTIONS.attendance,
  [APP_PATHS.adminMembers]: ADMIN_SECTIONS.members,
};

export const MEMBER_DIRECTORY_FILTERS = {
  active: 'active',
  all: 'all',
  inactive: 'inactive',
};

export const MEMBER_DIRECTORY_ALL_GROUPS_VALUE = 'ALL';

export const MEMBER_DIRECTORY_TYPE_FILTERS = {
  all: 'all',
  regular: 'regular',
  newcomerRegistered: 'newcomerRegistered',
  newcomerVisitor: 'newcomerVisitor',
};

export const RECENT_ABSENCE_WINDOW_SIZE = 3;

export const ATTENDANCE_TYPE_LABELS = {
  absent: '결석',
  youth: '청년부(4부)',
  adult: '장년부(1~3부)',
};
