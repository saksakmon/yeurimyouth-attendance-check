import { MEMBER_DIRECTORY_TYPE_FILTERS, RECENT_ABSENCE_WINDOW_SIZE } from '../../constants/app.js';

export function formatMemberCreatedDate(value) {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10) || '-';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

export function isMemberEligibleForRecentAbsenceWindow(member, latestWeekInWindow) {
  if (!member?.createdAt || !latestWeekInWindow?.serviceDate) return true;

  const registeredAt = new Date(member.createdAt);
  if (Number.isNaN(registeredAt.getTime())) return true;

  const eligibilityThreshold = new Date(`${latestWeekInWindow.serviceDate}T23:59:59`);
  eligibilityThreshold.setDate(eligibilityThreshold.getDate() - RECENT_ABSENCE_WINDOW_SIZE * 7);
  return registeredAt <= eligibilityThreshold;
}

export function compareMemberDirectoryRows(a, b) {
  if (a.isActive !== b.isActive) {
    return a.isActive ? -1 : 1;
  }

  const displayNameCompare = String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ko');
  if (displayNameCompare !== 0) return displayNameCompare;

  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

export function getMemberDirectoryTypeValue(member, groups) {
  if (isNewcomerGroupId(groups, member?.groupId)) {
    return member?.memberType === 'visitor'
      ? MEMBER_DIRECTORY_TYPE_FILTERS.newcomerVisitor
      : MEMBER_DIRECTORY_TYPE_FILTERS.newcomerRegistered;
  }

  return MEMBER_DIRECTORY_TYPE_FILTERS.regular;
}

export function getMemberDirectoryTypeLabel(member, groups) {
  const typeValue = getMemberDirectoryTypeValue(member, groups);

  if (typeValue === MEMBER_DIRECTORY_TYPE_FILTERS.newcomerVisitor) return '새가족(방문)';
  if (typeValue === MEMBER_DIRECTORY_TYPE_FILTERS.newcomerRegistered) return '새가족(등록)';
  return '등반';
}

export function getMemberLifecycleLabel(member, groups) {
  return getMemberDirectoryTypeLabel(member, groups);
}

export function normalizeMemberDirectoryDateValue(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digits.length !== 8) return '';

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    return '';
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function isMemberWithinCreatedDateRange(member, registeredFrom, registeredTo) {
  const normalizedFrom = normalizeMemberDirectoryDateValue(registeredFrom);
  const normalizedTo = normalizeMemberDirectoryDateValue(registeredTo);
  if (!normalizedFrom && !normalizedTo) return true;

  const createdDate = String(member?.createdAt || '').slice(0, 10);
  if (!createdDate) return false;
  if (normalizedFrom && createdDate < normalizedFrom) return false;
  if (normalizedTo && createdDate > normalizedTo) return false;
  return true;
}

export function findNewcomerGroup(groups) {
  return groups.find((group) => group.groupType === 'newcomer') || null;
}

export function isNewcomerGroupId(groups, groupId) {
  return Boolean(groupId && groups.some((group) => group.id === groupId && group.groupType === 'newcomer'));
}

export function buildAppMemberFromRow(row, groups) {
  const group = row.group_id ? groups.find((item) => item.id === row.group_id) : null;

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

export function buildFallbackUpdatedMember(member, groups, updates) {
  const nextGroupId = updates.groupId ?? member.groupId ?? null;
  const group = nextGroupId ? groups.find((item) => item.id === nextGroupId) : null;

  return {
    ...member,
    groupId: nextGroupId,
    groupName: group?.name || null,
    isActive: updates.isActive ?? member.isActive,
    memberType: updates.memberType ?? member.memberType,
    name: updates.name ?? member.name,
    updatedAt: updates.updatedAt || new Date().toISOString(),
  };
}
