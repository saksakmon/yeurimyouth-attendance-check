import { createId } from '../shared/helpers.js';
import { getMemberDirectoryTypeLabel } from './memberHelpers.js';

export const MEMBER_CHANGE_HISTORY_STORAGE_KEY = 'yeurim-member-change-history-v1';

export function formatHistoryDateTime(value) {
  if (!value) return '-';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

export function loadMemberChangeHistory() {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(MEMBER_CHANGE_HISTORY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[memberHistory] failed to load history', error);
    return [];
  }
}

export function getMomentFromValue(value, endOfDay = false) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isMemberActiveAtMoment(member, effectiveMoment, historyEntries) {
  if (!member) return false;

  const resolvedMoment = getMomentFromValue(effectiveMoment);
  if (!resolvedMoment) return member.isActive !== false;

  const createdAt = getMomentFromValue(member.createdAt);
  if (createdAt && createdAt > resolvedMoment) return false;

  const statusEvents = historyEntries
    .filter((entry) => entry.memberId === member.id && entry.kind === 'status')
    .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());

  if (statusEvents.length === 0) {
    return member.isActive !== false;
  }

  let active = true;
  for (const event of statusEvents) {
    const changedAt = getMomentFromValue(event.changedAt);
    if (!changedAt || changedAt > resolvedMoment) continue;
    active = event.nextIsActive !== false;
  }

  return active;
}

export function isMemberActiveOnServiceDate(member, serviceDate, historyEntries) {
  return isMemberActiveAtMoment(member, getMomentFromValue(serviceDate, true), historyEntries);
}

export function buildMemberHistoryEntry({ actionLabel, changedAt, changedBy = '운영 관리자', content, kind = 'edit', memberId, nextIsActive = null }) {
  return {
    id: createId('member-history'),
    actionLabel,
    changedAt: changedAt || new Date().toISOString(),
    changedBy,
    content,
    kind,
    memberId,
    nextIsActive,
  };
}

export function buildMemberEditHistoryContent(member, nextValues, groups) {
  const currentGroupName = groups.find((group) => group.id === member.groupId)?.name || member.groupName || '-';
  const nextGroupName = groups.find((group) => group.id === nextValues.groupId)?.name || '-';
  const currentTypeLabel = getMemberDirectoryTypeLabel(member, groups);
  const nextTypeLabel = getMemberDirectoryTypeLabel(
    {
      ...member,
      groupId: nextValues.groupId,
      memberType: nextValues.memberType,
    },
    groups,
  );
  const changes = [];

  if (member.name !== nextValues.name) {
    changes.push(`이름 ${member.name} → ${nextValues.name}`);
  }

  if ((member.groupId || '') !== (nextValues.groupId || '')) {
    changes.push(`숲 ${currentGroupName} → ${nextGroupName}`);
  }

  if (currentTypeLabel !== nextTypeLabel) {
    changes.push(`유형 ${currentTypeLabel} → ${nextTypeLabel}`);
  }

  return changes.length > 0 ? changes.join(' / ') : '회원 정보 수정';
}
