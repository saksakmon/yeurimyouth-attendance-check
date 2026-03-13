import { ADMIN_SECTIONS, APP_SCREENS } from '../constants/app.js';

export const ROLES = {
  superAdmin: 'super_admin',
  admin: 'admin',
  attendanceLeader: 'attendance_leader',
};

export const PERMISSIONS = {
  adminAccess: 'admin.access',
  attendanceView: 'attendance.view',
  attendanceEdit: 'attendance.edit',
  memberView: 'member.view',
  memberCreate: 'member.create',
  memberEdit: 'member.edit',
  memberStatusEdit: 'member.status.edit',
  memberGroupEdit: 'member.group.edit',
  auditView: 'audit.view',
  kioskAccess: 'kiosk.access',
};

const SUPER_ADMIN_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_PERMISSION_MAP = {
  [ROLES.superAdmin]: SUPER_ADMIN_PERMISSIONS,
  [ROLES.admin]: [
    PERMISSIONS.adminAccess,
    PERMISSIONS.attendanceView,
    PERMISSIONS.attendanceEdit,
    PERMISSIONS.memberView,
    PERMISSIONS.memberCreate,
    PERMISSIONS.memberEdit,
    PERMISSIONS.memberStatusEdit,
    PERMISSIONS.memberGroupEdit,
    PERMISSIONS.auditView,
    PERMISSIONS.kioskAccess,
  ],
  [ROLES.attendanceLeader]: [
    PERMISSIONS.adminAccess,
    PERMISSIONS.attendanceView,
    PERMISSIONS.attendanceEdit,
    PERMISSIONS.memberView,
    PERMISSIONS.kioskAccess,
  ],
};

export const MOCK_SESSION = {
  isAuthenticated: true,
  user: {
    email: 'admin@example.com',
    id: 'admin-user-1',
    name: '운영 관리자',
    role: ROLES.superAdmin,
  },
};

const SECTION_PERMISSIONS = {
  [ADMIN_SECTIONS.attendance]: PERMISSIONS.attendanceView,
  [ADMIN_SECTIONS.members]: PERMISSIONS.memberView,
};

const SCREEN_PERMISSIONS = {
  [APP_SCREENS.adminDashboard]: PERMISSIONS.adminAccess,
  [APP_SCREENS.attendanceKiosk]: PERMISSIONS.kioskAccess,
  [APP_SCREENS.preAttendanceConfirm]: PERMISSIONS.kioskAccess,
};

export function resolveSessionPermissions(session) {
  if (!session?.user?.role) return [];
  return ROLE_PERMISSION_MAP[session.user.role] || [];
}

export function hasPermission(session, permission) {
  if (!permission) return true;
  return resolveSessionPermissions(session).includes(permission);
}

export function canAccessAdminSection(session, section) {
  return hasPermission(session, SECTION_PERMISSIONS[section]);
}

export function canAccessScreen(session, screen) {
  return hasPermission(session, SCREEN_PERMISSIONS[screen]);
}

export function getAuditActorName(session) {
  return session?.user?.name || '운영 관리자';
}
