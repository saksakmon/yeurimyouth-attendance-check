import { ADMIN_SECTIONS, APP_SCREENS } from '../constants/app.js';

export const ROLES = {
  superAdmin: 'super_admin',
  admin: 'admin',
  leader: 'leader',
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
  settingsAccess: 'settings.access',
  kioskAccess: 'kiosk.access',
};

const SUPER_ADMIN_PERMISSIONS = Object.values(PERMISSIONS);

export const ROLE_LABELS = {
  [ROLES.superAdmin]: '총관리자',
  [ROLES.admin]: '관리자',
  [ROLES.leader]: '리더',
};

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
  [ROLES.leader]: [
    PERMISSIONS.adminAccess,
    PERMISSIONS.attendanceView,
    PERMISSIONS.attendanceEdit,
    PERMISSIONS.kioskAccess,
  ],
};

export const SERVER_PROTECTED_PERMISSIONS = [
  PERMISSIONS.attendanceEdit,
  PERMISSIONS.memberCreate,
  PERMISSIONS.memberEdit,
  PERMISSIONS.memberStatusEdit,
  PERMISSIONS.memberGroupEdit,
];

const SECTION_PERMISSIONS = {
  [ADMIN_SECTIONS.attendance]: PERMISSIONS.attendanceView,
  [ADMIN_SECTIONS.members]: PERMISSIONS.memberView,
};

const PUBLIC_SCREENS = new Set([APP_SCREENS.attendanceKiosk, APP_SCREENS.preAttendanceConfirm]);

const SCREEN_PERMISSIONS = {
  [APP_SCREENS.adminLogin]: PERMISSIONS.adminAccess,
  [APP_SCREENS.adminDashboard]: PERMISSIONS.adminAccess,
};

export function normalizeRole(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) return null;
  if (normalized === ROLES.superAdmin || normalized === 'superadmin') return ROLES.superAdmin;
  if (normalized === ROLES.admin) return ROLES.admin;
  if (
    normalized === ROLES.leader ||
    normalized === 'attendance_leader' ||
    normalized === 'attendanceleader' ||
    normalized === 'leader'
  ) {
    return ROLES.leader;
  }

  return null;
}

export function resolveSessionPermissions(session) {
  if (!session?.isAuthenticated || !session?.user?.role) return [];
  return ROLE_PERMISSION_MAP[normalizeRole(session.user.role)] || [];
}

export function hasPermission(session, permission) {
  if (!permission) return true;
  return resolveSessionPermissions(session).includes(permission);
}

export function canAccessAdminSection(session, section) {
  if (!session?.isAuthenticated) return false;
  return hasPermission(session, SECTION_PERMISSIONS[section]);
}

export function canAccessScreen(session, screen) {
  if (PUBLIC_SCREENS.has(screen)) return true;
  if (!session?.isAuthenticated) return false;
  return hasPermission(session, SCREEN_PERMISSIONS[screen]);
}

export function getRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || '권한 없음';
}

export function getAuditActorName(session) {
  return session?.user?.name || session?.user?.email || '알 수 없는 관리자';
}
