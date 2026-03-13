import * as React from 'react';
import * as XLSX from 'xlsx';
import { saveAttendanceRecord } from './api/attendanceRecords.js';
import { getAppBootstrapData, getFallbackAppBootstrapData } from './api/bootstrap.js';
import { formatAttendedTime } from './api/mappers.js';
import { createMember, getMembers, updateMember } from './api/members.js';
import AdminDashboardScreen from './components/AdminDashboardScreen.jsx';
import AttendanceKioskScreen from './components/AttendanceKioskScreen.jsx';
import PreAttendanceConfirmScreen from './components/PreAttendanceConfirmScreen.jsx';
import { hasSupabaseEnv } from './lib/supabase.js';
import { getNextMemberDisplayNamePreview, resolveMemberDisplayNames } from './utils/memberDisplay.js';

const { useEffect, useMemo, useState } = React;

const ACCENT_COLOR = '#1677FF';
const APP_SCREENS = {
  preAttendanceConfirm: 'preAttendanceConfirm',
  attendanceKiosk: 'attendanceKiosk',
  adminDashboard: 'adminDashboard',
};
const ADMIN_SECTIONS = {
  attendance: 'attendance',
  members: 'members',
};
const MEMBER_DIRECTORY_FILTERS = {
  active: 'active',
  all: 'all',
  inactive: 'inactive',
};
const MEMBER_DIRECTORY_ALL_GROUPS_VALUE = 'ALL';
const MEMBER_DIRECTORY_TYPE_FILTERS = {
  all: 'all',
  regular: 'regular',
  newcomerRegistered: 'newcomerRegistered',
  newcomerVisitor: 'newcomerVisitor',
};
const RECENT_ABSENCE_WINDOW_SIZE = 3;
const CHOSUNG_QUERY_PATTERN = /^[ㄱ-ㅎ]+$/;
const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const ATTENDANCE_TYPE_LABELS = {
  absent: '결석',
  youth: '청년부(4부)',
  adult: '장년부(1~3부)',
};

function getChosung(text) {
  return String(text || '')
    .split('')
    .map((character) => {
      const code = character.charCodeAt(0);

      if (code < 0xac00 || code > 0xd7a3) {
        return character;
      }

      const chosungIndex = Math.floor((code - 0xac00) / 588);
      return CHOSUNG_LIST[chosungIndex] || character;
    })
    .join('');
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatNow(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function isPresentAttendanceType(attendanceType) {
  return attendanceType === 'youth' || attendanceType === 'adult';
}

function getAttendanceTypeLabel(attendanceType) {
  return ATTENDANCE_TYPE_LABELS[attendanceType] || '결석';
}

function formatMemberCreatedDate(value) {
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

function isMemberEligibleForRecentAbsenceWindow(member, latestWeekInWindow) {
  if (!member?.createdAt || !latestWeekInWindow?.serviceDate) return true;

  const registeredAt = new Date(member.createdAt);
  if (Number.isNaN(registeredAt.getTime())) return true;

  const eligibilityThreshold = new Date(`${latestWeekInWindow.serviceDate}T23:59:59`);
  eligibilityThreshold.setDate(eligibilityThreshold.getDate() - RECENT_ABSENCE_WINDOW_SIZE * 7);
  return registeredAt <= eligibilityThreshold;
}

function compareMemberDirectoryRows(a, b) {
  if (a.isActive !== b.isActive) {
    return a.isActive ? -1 : 1;
  }

  const displayNameCompare = String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ko');
  if (displayNameCompare !== 0) return displayNameCompare;

  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function getMemberDirectoryTypeValue(member, groups) {
  if (isNewcomerGroupId(groups, member?.groupId)) {
    return member?.memberType === 'visitor'
      ? MEMBER_DIRECTORY_TYPE_FILTERS.newcomerVisitor
      : MEMBER_DIRECTORY_TYPE_FILTERS.newcomerRegistered;
  }

  return MEMBER_DIRECTORY_TYPE_FILTERS.regular;
}

function getMemberDirectoryTypeLabel(member, groups) {
  const typeValue = getMemberDirectoryTypeValue(member, groups);

  if (typeValue === MEMBER_DIRECTORY_TYPE_FILTERS.newcomerVisitor) return '새가족(방문)';
  if (typeValue === MEMBER_DIRECTORY_TYPE_FILTERS.newcomerRegistered) return '새가족(등록)';
  return '등반';
}

function getMemberLifecycleLabel(member, groups) {
  return getMemberDirectoryTypeLabel(member, groups);
}

function normalizeMemberDirectoryDateValue(value) {
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

function isMemberWithinCreatedDateRange(member, registeredFrom, registeredTo) {
  const normalizedFrom = normalizeMemberDirectoryDateValue(registeredFrom);
  const normalizedTo = normalizeMemberDirectoryDateValue(registeredTo);
  if (!normalizedFrom && !normalizedTo) return true;

  const createdDate = String(member?.createdAt || '').slice(0, 10);
  if (!createdDate) return false;
  if (normalizedFrom && createdDate < normalizedFrom) return false;
  if (normalizedTo && createdDate > normalizedTo) return false;
  return true;
}

function findNewcomerGroup(groups) {
  return groups.find((group) => group.groupType === 'newcomer') || null;
}

function isNewcomerGroupId(groups, groupId) {
  return Boolean(groupId && groups.some((group) => group.id === groupId && group.groupType === 'newcomer'));
}

function buildAppMemberFromRow(row, groups) {
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

function buildFallbackUpdatedMember(member, groups, updates) {
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

function getAttendanceRecord(records, memberId, weekKey) {
  return records.find((record) => record.memberId === memberId && record.weekKey === weekKey) || null;
}

function getRecentAttendanceWindow(weekOptions, selectedWeekKey) {
  const selectedIndex = weekOptions.findIndex((option) => option.weekKey === selectedWeekKey);
  const startIndex = selectedIndex === -1 ? 0 : selectedIndex;
  return {
    startIndex,
    recentWeeks: weekOptions.slice(startIndex, startIndex + RECENT_ABSENCE_WINDOW_SIZE),
  };
}

function buildAttendanceMap(records, weekKey) {
  return Object.fromEntries(
    records
      .filter((record) => record.weekKey === weekKey && isPresentAttendanceType(record.attendanceType))
      .map((record) => [record.memberId, record.attendedAt]),
  );
}

function upsertAttendanceRecord(records, nextRecord) {
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

function buildAttendanceUpdate(
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

function buildAppAttendanceRecordFromRow(row, weekMeta) {
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

function filterMembers(members, query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];

  return members.filter((member) => {
    const haystack = `${member.name}${member.displayName || ''}${member.groupName || ''}${getChosung(member.name)}`;
    return haystack.includes(trimmed);
  });
}

function getResultState(query, filteredMembers) {
  if (!String(query || '').trim()) return 'idle';
  if (filteredMembers.length === 0) return 'empty';
  return 'results';
}

function getNameHighlightRange(member, query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return null;

  const nameIndex = member.name.indexOf(trimmed);
  if (nameIndex !== -1) {
    return { start: nameIndex, length: trimmed.length };
  }

  if (CHOSUNG_QUERY_PATTERN.test(trimmed)) {
    const chosungIndex = getChosung(member.name).indexOf(trimmed);
    if (chosungIndex !== -1) {
      return { start: chosungIndex, length: trimmed.length };
    }
  }

  return null;
}

function getRecentAbsenceStreakCount(members, records, weekOptions, selectedWeekKey) {
  const { recentWeeks } = getRecentAttendanceWindow(weekOptions, selectedWeekKey);
  const recentWeekKeys = recentWeeks.map((option) => option.weekKey);

  if (recentWeekKeys.length < RECENT_ABSENCE_WINDOW_SIZE) return 0;

  const latestWeekInWindow = recentWeeks[0];

  return members.filter((member) =>
    isMemberEligibleForRecentAbsenceWindow(member, latestWeekInWindow) &&
    recentWeekKeys.every((weekKey) => {
      const record = getAttendanceRecord(records, member.id, weekKey);
      return !isPresentAttendanceType(record?.attendanceType);
    }),
  ).length;
}

function getRecentAbsenceStreakRows(members, records, weekOptions, selectedWeekKey, groups) {
  const { startIndex, recentWeeks } = getRecentAttendanceWindow(weekOptions, selectedWeekKey);
  const recentWeekKeys = recentWeeks.map((option) => option.weekKey);

  if (recentWeekKeys.length < RECENT_ABSENCE_WINDOW_SIZE) return [];

  const latestWeekInWindow = recentWeeks[0];
  const oldestWeekInWindow = recentWeeks[recentWeeks.length - 1];
  const earlierWeeks = weekOptions.slice(startIndex + recentWeeks.length);

  return members
    .filter((member) =>
      isMemberEligibleForRecentAbsenceWindow(member, latestWeekInWindow) &&
      recentWeekKeys.every((weekKey) => {
        const record = getAttendanceRecord(records, member.id, weekKey);
        return !isPresentAttendanceType(record?.attendanceType);
      }),
    )
    .map((member) => {
      const lastPresentWeek = earlierWeeks.find((week) => {
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

function areFiltersEqual(a, b) {
  return (
    a.groupId === b.groupId &&
    JSON.stringify(a.weekKeys) === JSON.stringify(b.weekKeys) &&
    JSON.stringify(a.nameIds) === JSON.stringify(b.nameIds)
  );
}

function areMemberDirectoryFiltersEqual(a, b) {
  return (
    JSON.stringify(a.groupIds) === JSON.stringify(b.groupIds) &&
    a.registeredFrom === b.registeredFrom &&
    a.registeredTo === b.registeredTo &&
    a.status === b.status &&
    a.type === b.type
  );
}

const FALLBACK_BOOTSTRAP = getFallbackAppBootstrapData();

function getDefaultMemberDirectoryFilters() {
  return {
    groupIds: [],
    registeredFrom: '',
    registeredTo: '',
    status: MEMBER_DIRECTORY_FILTERS.all,
    type: MEMBER_DIRECTORY_TYPE_FILTERS.all,
  };
}

export default function App() {
  const [appBootstrap, setAppBootstrap] = useState(() => FALLBACK_BOOTSTRAP);
  const defaultAdminFilters = useMemo(
    () => ({
      weekKeys: [appBootstrap.currentWeekKey],
      groupId: 'all',
      nameIds: [],
    }),
    [appBootstrap.currentWeekKey],
  );

  const [screen, setScreen] = useState(APP_SCREENS.preAttendanceConfirm);
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState(() => FALLBACK_BOOTSTRAP.members);
  const [attendanceRecords, setAttendanceRecords] = useState(() => FALLBACK_BOOTSTRAP.attendanceRecords);
  const [newcomerIntakes, setNewcomerIntakes] = useState(() => FALLBACK_BOOTSTRAP.newcomerIntakes);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [toast, setToast] = useState('');
  const [showNewMemberModal, setShowNewMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberStatus, setNewMemberStatus] = useState('registered');

  const [draftFilters, setDraftFilters] = useState(defaultAdminFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultAdminFilters);
  const [adminSection, setAdminSection] = useState(ADMIN_SECTIONS.attendance);
  const [adminActiveWeekKey, setAdminActiveWeekKey] = useState(FALLBACK_BOOTSTRAP.currentWeekKey);
  const [adminSelectedRowIds, setAdminSelectedRowIds] = useState([]);
  const [adminPendingBulkActionType, setAdminPendingBulkActionType] = useState(null);
  const [draftMemberDirectoryFilters, setDraftMemberDirectoryFilters] = useState(() => getDefaultMemberDirectoryFilters());
  const [appliedMemberDirectoryFilters, setAppliedMemberDirectoryFilters] = useState(() => getDefaultMemberDirectoryFilters());
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editMemberDraft, setEditMemberDraft] = useState({
    name: '',
    groupId: '',
    memberType: 'registered',
  });
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberDraft, setAddMemberDraft] = useState({
    name: '',
    groupId: '',
    memberType: 'visitor',
  });
  const newcomerGroup = useMemo(() => findNewcomerGroup(appBootstrap.groups), [appBootstrap.groups]);

  useEffect(() => {
    let active = true;

    async function loadBootstrap() {
      try {
        const data = await getAppBootstrapData();
        if (!active) return;

        setAppBootstrap(data);
        setMembers(data.members);
        setAttendanceRecords(data.attendanceRecords);
        setNewcomerIntakes(data.newcomerIntakes);
        setDraftFilters((prev) =>
          prev.weekKeys.length === 1 && prev.weekKeys[0] === FALLBACK_BOOTSTRAP.currentWeekKey
            ? { ...prev, weekKeys: [data.currentWeekKey] }
            : prev,
        );
        setAppliedFilters((prev) =>
          prev.weekKeys.length === 1 && prev.weekKeys[0] === FALLBACK_BOOTSTRAP.currentWeekKey
            ? { ...prev, weekKeys: [data.currentWeekKey] }
            : prev,
        );
        setAdminActiveWeekKey((prev) => (prev === FALLBACK_BOOTSTRAP.currentWeekKey ? data.currentWeekKey : prev));
      } catch (error) {
        console.warn('Failed to load bootstrap data, using fallback mock source:', error);
      }
    }

    loadBootstrap();
    return () => {
      active = false;
    };
  }, []);

  const resolvedMembers = useMemo(() => resolveMemberDisplayNames(members), [members]);
  const activeMembers = useMemo(() => resolvedMembers.filter((member) => member.isActive), [resolvedMembers]);
  const membersById = useMemo(
    () => Object.fromEntries(resolvedMembers.map((member) => [member.id, member])),
    [resolvedMembers],
  );
  const filtered = useMemo(() => filterMembers(activeMembers, query), [activeMembers, query]);
  const currentAttendance = useMemo(
    () => buildAttendanceMap(attendanceRecords, appBootstrap.currentWeekKey),
    [attendanceRecords, appBootstrap.currentWeekKey],
  );
  const attendanceCount = useMemo(() => Object.values(currentAttendance).filter(Boolean).length, [currentAttendance]);
  const attendanceRate = appBootstrap.totalMemberCount > 0 ? Math.round((attendanceCount / appBootstrap.totalMemberCount) * 100) : 0;
  const resultState = getResultState(query, filtered);
  const canRegisterNewMember = Boolean(newMemberName.trim());
  const isFilterDirty = !areFiltersEqual(draftFilters, appliedFilters);
  const isMemberDirectoryFilterDirty = !areMemberDirectoryFiltersEqual(
    draftMemberDirectoryFilters,
    appliedMemberDirectoryFilters,
  );
  const addMemberNamePreview = useMemo(
    () => getNextMemberDisplayNamePreview(resolvedMembers, addMemberDraft.name),
    [resolvedMembers, addMemberDraft.name],
  );
  const addMemberNameGuide = useMemo(() => {
    if (!addMemberNamePreview) return null;

    return '동명이인이 있어요. 생성 시 이름 뒤 알파벳이 붙어요.';
  }, [addMemberNamePreview]);

  const appliedResolvedWeekKeys = useMemo(
    () =>
      appliedFilters.weekKeys.includes('ALL')
        ? appBootstrap.attendanceWeeks.map((option) => option.weekKey)
        : appliedFilters.weekKeys,
    [appliedFilters.weekKeys, appBootstrap.attendanceWeeks],
  );

  useEffect(() => {
    if (appliedResolvedWeekKeys.length === 0) {
      setAdminActiveWeekKey(appBootstrap.currentWeekKey);
      return;
    }

    if (!appliedResolvedWeekKeys.includes(adminActiveWeekKey)) {
      setAdminActiveWeekKey(appliedResolvedWeekKeys[0]);
    }
  }, [appliedResolvedWeekKeys, adminActiveWeekKey, appBootstrap.currentWeekKey]);

  const activeAdminWeekKey =
    appliedResolvedWeekKeys.length > 1 ? adminActiveWeekKey : appliedResolvedWeekKeys[0] || appBootstrap.currentWeekKey;
  const activeAdminWeekMeta =
    appBootstrap.attendanceWeeks.find((option) => option.weekKey === activeAdminWeekKey) || appBootstrap.currentAttendanceMeta;
  const editingMember = editingMemberId ? membersById[editingMemberId] || null : null;

  const draftNameOptions = useMemo(
    () =>
      activeMembers
        .filter((member) => draftFilters.groupId === 'all' || member.groupId === draftFilters.groupId)
        .map((member) => ({ value: member.id, label: member.displayName || member.name })),
    [activeMembers, draftFilters.groupId],
  );

  useEffect(() => {
    setDraftFilters((prev) => ({
      ...prev,
      nameIds: prev.nameIds.filter((memberId) => draftNameOptions.some((option) => option.value === memberId)),
    }));
  }, [draftNameOptions]);

  const filteredAdminMembers = useMemo(
    () =>
      activeMembers.filter((member) => {
        const matchGroup = appliedFilters.groupId === 'all' || member.groupId === appliedFilters.groupId;
        const matchName = appliedFilters.nameIds.length === 0 || appliedFilters.nameIds.includes(member.id);
        return matchGroup && matchName;
      }),
    [activeMembers, appliedFilters],
  );

  const adminRows = useMemo(
    () =>
      filteredAdminMembers.map((member) => {
        const record = getAttendanceRecord(attendanceRecords, member.id, activeAdminWeekKey);
        const attendanceType = record?.attendanceType || 'absent';

        return {
          id: member.id,
          name: member.displayName || member.name,
          memberTypeLabel: getMemberLifecycleLabel(member, appBootstrap.groups),
          groupName: member.groupName || '-',
          attendanceType,
          attendanceTypeLabel: getAttendanceTypeLabel(attendanceType),
          attendedAt: isPresentAttendanceType(attendanceType) ? record?.attendedAt || null : null,
        };
      }),
    [filteredAdminMembers, attendanceRecords, activeAdminWeekKey, appBootstrap.groups],
  );

  useEffect(() => {
    const visibleRowIds = adminRows.map((row) => row.id);
    setAdminSelectedRowIds((prev) => prev.filter((rowId) => visibleRowIds.includes(rowId)));
  }, [adminRows]);

  const adminAttendanceCount = adminRows.filter((row) => isPresentAttendanceType(row.attendanceType)).length;
  const adminTotalCount = adminRows.length;
  const adminAttendanceRate = adminTotalCount > 0 ? Math.round((adminAttendanceCount / adminTotalCount) * 100) : 0;
  const threeWeekAbsenceRows = useMemo(
    () =>
      getRecentAbsenceStreakRows(
        filteredAdminMembers,
        attendanceRecords,
        appBootstrap.attendanceWeeks,
        activeAdminWeekKey,
        appBootstrap.groups,
      ),
    [filteredAdminMembers, attendanceRecords, activeAdminWeekKey, appBootstrap.attendanceWeeks, appBootstrap.groups],
  );
  const threeWeekAbsenceCount = getRecentAbsenceStreakCount(
    filteredAdminMembers,
    attendanceRecords,
    appBootstrap.attendanceWeeks,
    activeAdminWeekKey,
  );
  const memberDirectorySummary = useMemo(
    () => ({
      activeCount: activeMembers.length,
      inactiveCount: resolvedMembers.filter((member) => !member.isActive).length,
      totalCount: resolvedMembers.length,
    }),
    [activeMembers.length, resolvedMembers],
  );
  const memberDirectoryGroupOptions = useMemo(
    () => appBootstrap.groups.map((group) => ({ value: group.id, label: group.name })),
    [appBootstrap.groups],
  );
  const memberDirectoryRows = useMemo(
    () =>
      resolvedMembers
        .filter((member) => {
          const matchesStatus =
            appliedMemberDirectoryFilters.status === MEMBER_DIRECTORY_FILTERS.all
              ? true
              : appliedMemberDirectoryFilters.status === MEMBER_DIRECTORY_FILTERS.inactive
                ? !member.isActive
                : member.isActive;
          const matchesGroup =
            appliedMemberDirectoryFilters.groupIds.length === 0 ||
            appliedMemberDirectoryFilters.groupIds.includes(member.groupId || '');
          const matchesType =
            appliedMemberDirectoryFilters.type === MEMBER_DIRECTORY_TYPE_FILTERS.all
              ? true
              : getMemberDirectoryTypeValue(member, appBootstrap.groups) === appliedMemberDirectoryFilters.type;
          const matchesDate = isMemberWithinCreatedDateRange(
            member,
            appliedMemberDirectoryFilters.registeredFrom,
            appliedMemberDirectoryFilters.registeredTo,
          );

          return matchesStatus && matchesGroup && matchesType && matchesDate;
        })
        .sort(compareMemberDirectoryRows)
        .map((member) => ({
          createdAt: member.createdAt,
          createdAtLabel: formatMemberCreatedDate(member.createdAt),
          displayName: member.displayName || member.name,
          groupName: member.groupName || '-',
          id: member.id,
          isActive: member.isActive,
          memberTypeLabel: getMemberDirectoryTypeLabel(member, appBootstrap.groups),
          rawName: member.name,
          statusLabel: member.isActive ? '재적' : '재적 제외',
        })),
    [appliedMemberDirectoryFilters, appBootstrap.groups, resolvedMembers],
  );

  useEffect(() => {
    const validGroupIds = new Set(memberDirectoryGroupOptions.map((option) => option.value));

    setDraftMemberDirectoryFilters((prev) => ({
      ...prev,
      groupIds: prev.groupIds.filter((groupId) => validGroupIds.has(groupId)),
    }));
    setAppliedMemberDirectoryFilters((prev) => ({
      ...prev,
      groupIds: prev.groupIds.filter((groupId) => validGroupIds.has(groupId)),
    }));
  }, [memberDirectoryGroupOptions]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const closeAddMemberModal = () => {
    setShowAddMemberModal(false);
    setAddMemberDraft({ name: '', groupId: '', memberType: 'visitor' });
  };

  const closeEditMemberModal = () => {
    setEditingMemberId(null);
    setEditMemberDraft({ name: '', groupId: '', memberType: 'registered' });
  };

  const applyMembersState = (nextMembers) => {
    setMembers(nextMembers);
    setAppBootstrap((prev) => ({
      ...prev,
      totalMemberCount: nextMembers.filter((member) => member.isActive).length,
    }));
    return nextMembers;
  };

  const syncMembersAfterWrite = async (buildFallbackMembers) => {
    if (hasSupabaseEnv) {
      try {
        const latestMemberRows = await getMembers();
        const nextMembers = latestMemberRows.map((row) => buildAppMemberFromRow(row, appBootstrap.groups));
        return applyMembersState(nextMembers);
      } catch (error) {
        console.warn('[app] member refresh after save failed, falling back to local state', error);
      }
    }

    return applyMembersState(buildFallbackMembers());
  };

  const applyAttendanceRecordState = (nextRecord) => {
    setAttendanceRecords((prev) => upsertAttendanceRecord(prev, nextRecord));
  };

  const persistAttendanceTypeChange = async ({
    existingRecord: existingRecordOverride,
    memberId,
    nextAttendanceType,
    source,
    weekMeta,
    baseTime = formatNow(),
  }) => {
    if (!weekMeta?.id) {
      throw new Error(`[attendance] missing attendance week id for ${weekMeta?.weekKey || 'unknown week'}`);
    }

    const existingRecord = existingRecordOverride || getAttendanceRecord(attendanceRecords, memberId, weekMeta.weekKey);
    const nextRecord = buildAttendanceUpdate(existingRecord, memberId, weekMeta, nextAttendanceType, source, baseTime);

    console.info('[app] persisting attendance change', {
      attendanceWeekId: weekMeta.id,
      memberId,
      nextAttendanceType,
      source,
      weekKey: weekMeta.weekKey,
    });

    const savedRow = await saveAttendanceRecord({
      attendance_type: nextRecord.attendanceType,
      attendance_week_id: weekMeta.id,
      attended_at: nextRecord.attendedAtRaw,
      member_id: memberId,
      note: nextRecord.note,
      source,
    });
    const syncedRecord = buildAppAttendanceRecordFromRow(savedRow, weekMeta);

    console.info('[app] attendance change saved', {
      memberId,
      recordId: savedRow.id,
      source,
      weekKey: weekMeta.weekKey,
    });

    return syncedRecord;
  };

  const handleKeyTap = (key) => setQuery((prev) => prev + key);
  const handleBackspace = () => setQuery((prev) => prev.slice(0, -1));
  const handleReset = () => setQuery('');

  const handleConfirmAttendance = async () => {
    if (!confirmTarget) return;
    const confirmTargetLabel = confirmTarget.displayName || confirmTarget.name;

    try {
      const syncedRecord = await persistAttendanceTypeChange({
        memberId: confirmTarget.id,
        nextAttendanceType: 'youth',
        source: 'kiosk',
        weekMeta: appBootstrap.currentAttendanceMeta,
      });

      applyAttendanceRecordState(syncedRecord);
      setConfirmTarget(null);
      setQuery('');
      setToast(`${confirmTargetLabel} 출석이 완료됐어요`);
    } catch (error) {
      console.error('[app] kiosk attendance save failed', error);
      setToast('출석 저장 중 오류가 발생했어요');
    }
  };

  const handleRegisterNewMember = async () => {
    const trimmedName = newMemberName.trim();
    if (!trimmedName) return;

    if (!newcomerGroup) {
      console.error('[app] newcomer registration failed: newcomer group not found');
      setToast('새가족숲 정보를 찾지 못했어요');
      return;
    }

    const memberType = newMemberStatus === 'visit' ? 'visitor' : 'registered';
    let savedMemberRow = null;

    try {
      console.info('[app] creating newcomer member', {
        groupId: newcomerGroup.id,
        memberType,
        name: trimmedName,
      });

      savedMemberRow = await createMember({
        group_id: newcomerGroup.id,
        is_active: true,
        member_type: memberType,
        name: trimmedName,
      });
      const appMember = buildAppMemberFromRow(savedMemberRow, appBootstrap.groups);
      await syncMembersAfterWrite(() => [...members, appMember]);

      const syncedAttendanceRecord = await persistAttendanceTypeChange({
        memberId: savedMemberRow.id,
        nextAttendanceType: 'youth',
        source: 'kiosk',
        weekMeta: appBootstrap.currentAttendanceMeta,
      });

      applyAttendanceRecordState(syncedAttendanceRecord);
      setNewcomerIntakes((prev) => [
        ...prev,
        {
          id: createId('intake'),
          name: trimmedName,
          intakeDate: appBootstrap.currentServiceDate,
          intakeType: memberType === 'visitor' ? 'visit' : 'registered',
          attendanceLinked: true,
          memberId: savedMemberRow.id,
        },
      ]);
      setShowNewMemberModal(false);
      setNewMemberName('');
      setNewMemberStatus('registered');
      setQuery('');
      setToast(`새가족 ${memberType === 'visitor' ? '방문' : '등록'} 및 출석처리가 완료됐어요`);
    } catch (error) {
      console.error('[app] newcomer registration failed', error);

      if (savedMemberRow) {
        setNewcomerIntakes((prev) => [
          ...prev,
          {
            id: createId('intake'),
            name: trimmedName,
            intakeDate: appBootstrap.currentServiceDate,
            intakeType: memberType === 'visitor' ? 'visit' : 'registered',
            attendanceLinked: false,
            memberId: savedMemberRow.id,
          },
        ]);
        setShowNewMemberModal(false);
        setNewMemberName('');
        setNewMemberStatus('registered');
        setQuery('');
        setToast('새가족 등록은 저장됐지만 출석 저장은 실패했어요');
        return;
      }

      setToast('새가족 저장 중 오류가 발생했어요');
    }
  };

  const handleAdminAttendanceTypeChange = async (memberId, nextAttendanceType) => {
    const member = membersById[memberId];
    const memberLabel = member?.displayName || member?.name;

    try {
      const syncedRecord = await persistAttendanceTypeChange({
        memberId,
        nextAttendanceType,
        source: 'admin',
        weekMeta: activeAdminWeekMeta,
      });

      applyAttendanceRecordState(syncedRecord);

      if (memberLabel) {
        setToast(`${memberLabel} 출결을 ${getAttendanceTypeLabel(nextAttendanceType)}로 변경했어요`);
      }
    } catch (error) {
      console.error('[app] admin attendance change failed', error);
      setToast('출결 저장 중 오류가 발생했어요');
    }
  };

  const handleDraftWeekToggle = (value) => {
    setDraftFilters((prev) => {
      if (value === 'ALL') {
        return { ...prev, weekKeys: ['ALL'] };
      }

      const base = prev.weekKeys.includes('ALL') ? [] : prev.weekKeys;
      const exists = base.includes(value);
      const nextWeekKeys = exists ? base.filter((item) => item !== value) : [...base, value];
      const normalized = nextWeekKeys.length > 0 ? nextWeekKeys : [appBootstrap.currentWeekKey];
      const ordered = appBootstrap.attendanceWeeks
        .map((option) => option.weekKey)
        .filter((weekKey) => normalized.includes(weekKey));
      return { ...prev, weekKeys: ordered };
    });
  };

  const handleDraftNameToggle = (memberId) => {
    setDraftFilters((prev) => ({
      ...prev,
      nameIds: prev.nameIds.includes(memberId)
        ? prev.nameIds.filter((item) => item !== memberId)
        : [...prev.nameIds, memberId],
    }));
  };

  const handleDraftGroupChange = (groupId) => {
    setDraftFilters((prev) => ({
      ...prev,
      groupId,
      nameIds: prev.nameIds.filter((memberId) =>
        activeMembers.some((member) => member.id === memberId && (groupId === 'all' || member.groupId === groupId)),
      ),
    }));
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
    const nextResolved = draftFilters.weekKeys.includes('ALL')
      ? appBootstrap.attendanceWeeks.map((option) => option.weekKey)
      : draftFilters.weekKeys;

    if (!nextResolved.includes(adminActiveWeekKey)) {
      setAdminActiveWeekKey(nextResolved[0] || appBootstrap.currentWeekKey);
    }

    setAdminSelectedRowIds([]);
  };

  const handleResetFilters = () => {
    setDraftFilters(defaultAdminFilters);
  };

  const handleToggleAllRows = () => {
    const rowIds = adminRows.map((row) => row.id);
    const allSelected = rowIds.length > 0 && rowIds.every((rowId) => adminSelectedRowIds.includes(rowId));

    setAdminSelectedRowIds((prev) => {
      if (allSelected) {
        return prev.filter((rowId) => !rowIds.includes(rowId));
      }

      return Array.from(new Set([...prev, ...rowIds]));
    });
  };

  const handleBulkActionConfirm = async () => {
    if (!adminPendingBulkActionType || adminSelectedRowIds.length === 0) return;

    const baseTime = formatNow();
    let nextRecords = attendanceRecords;

    try {
      for (const memberId of adminSelectedRowIds) {
        const existingRecord = getAttendanceRecord(nextRecords, memberId, activeAdminWeekKey);
        const syncedRecord = await persistAttendanceTypeChange({
          existingRecord,
          memberId,
          nextAttendanceType: adminPendingBulkActionType,
          source: 'admin',
          weekMeta: activeAdminWeekMeta,
          baseTime,
        });

        nextRecords = upsertAttendanceRecord(nextRecords, syncedRecord);
      }

      setAttendanceRecords(nextRecords);
      setToast(`선택한 ${adminSelectedRowIds.length}명의 출결을 ${getAttendanceTypeLabel(adminPendingBulkActionType)}로 변경했어요`);
      setAdminPendingBulkActionType(null);
      setAdminSelectedRowIds([]);
    } catch (error) {
      console.error('[app] bulk attendance change failed', error);
      setAttendanceRecords(nextRecords);
      setToast('일괄 출결 저장 중 오류가 발생했어요');
    }
  };

  const handleXlsxDownload = () => {
    const rows = adminRows.map((row) => ({
      이름: row.name,
      유형: row.memberTypeLabel,
      '소속 숲': row.groupName || '-',
      출결유무: row.attendanceTypeLabel,
      출석시각: row.attendedAt || '-',
      주차: activeAdminWeekMeta.adminLabel,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 10 },
      { wch: 14 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '출결관리');
    XLSX.writeFile(workbook, `출결관리-${activeAdminWeekMeta.weekKey}.xlsx`);
    setToast('선택한 주차만 다운로드 돼요');
  };

  const handleAddMemberDraftChange = (field, value) => {
    setAddMemberDraft((prev) => {
      if (field === 'groupId' && !isNewcomerGroupId(appBootstrap.groups, value)) {
        return { ...prev, groupId: value, memberType: 'registered' };
      }

      return { ...prev, [field]: value };
    });
  };

  const handleAddMemberSave = async () => {
    if (!addMemberDraft.name.trim() || !addMemberDraft.groupId) return;

    const selectedGroup = appBootstrap.groups.find((group) => group.id === addMemberDraft.groupId);
    const trimmedName = addMemberDraft.name.trim();
    const isNewcomerGroup = isNewcomerGroupId(appBootstrap.groups, addMemberDraft.groupId);
    const memberType = isNewcomerGroup ? addMemberDraft.memberType : 'registered';
    const expectedDisplayName = addMemberNamePreview?.expectedDisplayName || trimmedName;

    if (!selectedGroup) {
      console.error('[app] add member failed: selected group not found', addMemberDraft.groupId);
      setToast('소속 숲 정보를 찾지 못했어요');
      return;
    }

    try {
      console.info('[app] creating member from admin', {
        groupId: selectedGroup.id,
        memberType,
        name: trimmedName,
      });

      const savedMemberRow = await createMember({
        group_id: selectedGroup.id,
        is_active: true,
        member_type: memberType,
        name: trimmedName,
      });
      const appMember = buildAppMemberFromRow(savedMemberRow, appBootstrap.groups);
      const syncedMembers = await syncMembersAfterWrite(() => [...members, appMember]);
      const createdMemberDisplayName =
        resolveMemberDisplayNames(syncedMembers).find((member) => member.id === savedMemberRow.id)?.displayName ||
        expectedDisplayName;

      if (isNewcomerGroup) {
        setNewcomerIntakes((prev) => [
          ...prev,
          {
            id: createId('intake'),
            name: trimmedName,
            intakeDate: appBootstrap.currentServiceDate,
            intakeType: memberType === 'visitor' ? 'visit' : 'registered',
            attendanceLinked: false,
            memberId: savedMemberRow.id,
          },
        ]);
      }

      setShowAddMemberModal(false);
      setAddMemberDraft({ name: '', groupId: '', memberType: 'visitor' });
      setToast(`${createdMemberDisplayName} 청년을 추가했어요`);
    } catch (error) {
      console.error('[app] add member save failed', error);
      setToast('청년 추가 저장 중 오류가 발생했어요');
    }
  };

  const handleEditMemberDraftChange = (field, value) => {
    setEditMemberDraft((prev) => {
      if (field === 'groupId' && !isNewcomerGroupId(appBootstrap.groups, value)) {
        return { ...prev, groupId: value, memberType: 'registered' };
      }

      return { ...prev, [field]: value };
    });
  };

  const handleOpenEditMember = (memberId) => {
    const member = membersById[memberId];
    if (!member) return;

    setEditingMemberId(memberId);
    setEditMemberDraft({
      groupId: member.groupId || '',
      memberType: member.memberType,
      name: member.name,
    });
  };

  const handleEditMemberSave = async () => {
    if (!editingMemberId || !editingMember || !editMemberDraft.name.trim() || !editMemberDraft.groupId) return;

    const trimmedName = editMemberDraft.name.trim();
    const nextMemberType = isNewcomerGroupId(appBootstrap.groups, editMemberDraft.groupId)
      ? editMemberDraft.memberType
      : 'registered';

    try {
      const savedMemberRow = await updateMember(editingMemberId, {
        group_id: editMemberDraft.groupId,
        is_active: editingMember?.isActive !== false,
        member_type: nextMemberType,
        name: trimmedName,
      });
      const nextMember = hasSupabaseEnv
        ? buildAppMemberFromRow(savedMemberRow, appBootstrap.groups)
        : buildFallbackUpdatedMember(editingMember, appBootstrap.groups, {
            groupId: editMemberDraft.groupId,
            memberType: nextMemberType,
            name: trimmedName,
            updatedAt: savedMemberRow.updated_at,
          });
      const syncedMembers = await syncMembersAfterWrite(() =>
        members.map((member) => (member.id === editingMemberId ? nextMember : member)),
      );
      const updatedDisplayName =
        resolveMemberDisplayNames(syncedMembers).find((member) => member.id === editingMemberId)?.displayName || trimmedName;

      closeEditMemberModal();
      setToast(`${updatedDisplayName} 정보를 수정했어요`);
    } catch (error) {
      console.error('[app] edit member save failed', error);
      setToast('회원 정보 저장 중 오류가 발생했어요');
    }
  };

  const handleToggleMemberActive = async (memberId) => {
    const member = membersById[memberId];
    if (!member) return;

    const nextIsActive = !member.isActive;
    const confirmed = window.confirm(
      nextIsActive
        ? `${member.displayName || member.name} 청년을 다시 복구할까요?`
        : `${member.displayName || member.name} 청년을 재적에서 제외할까요?\n재적에서 제외하면 출결관리와 키오스크 검색에서 제외됩니다.`,
    );
    if (!confirmed) return;

    try {
      const savedMemberRow = await updateMember(memberId, {
        group_id: member.groupId,
        is_active: nextIsActive,
        member_type: member.memberType,
        name: member.name,
      });
      const nextMember = hasSupabaseEnv
        ? buildAppMemberFromRow(savedMemberRow, appBootstrap.groups)
        : buildFallbackUpdatedMember(member, appBootstrap.groups, {
            isActive: nextIsActive,
            updatedAt: savedMemberRow.updated_at,
          });
      const syncedMembers = await syncMembersAfterWrite(() =>
        members.map((item) => (item.id === memberId ? nextMember : item)),
      );
      const toggledDisplayName =
        resolveMemberDisplayNames(syncedMembers).find((item) => item.id === memberId)?.displayName ||
        member.displayName ||
        member.name;

      if (confirmTarget?.id === memberId) {
        setConfirmTarget(null);
      }

      setToast(nextIsActive ? `${toggledDisplayName} 청년을 다시 복구했어요` : `${toggledDisplayName} 청년을 재적에서 제외했어요`);
    } catch (error) {
      console.error('[app] member active toggle failed', error);
      setToast('회원 상태 변경 중 오류가 발생했어요');
    }
  };

  const renderName = (member) => {
    const highlightRange = getNameHighlightRange(member, query);
    const start = highlightRange?.start ?? -1;
    const end = start + (highlightRange?.length ?? 0);

    return (
      <>
        {member.name.split('').map((letter, index) => (
          <span
            key={`${member.id}-${letter}-${index}`}
            style={index >= start && index < end ? { color: ACCENT_COLOR } : undefined}
          >
            {letter}
          </span>
        ))}
        {member.nameSuffix ? <span>{member.nameSuffix}</span> : null}
        {member.groupName ? <span className="ml-3 text-black/25 font-medium">{member.groupName}</span> : null}
      </>
    );
  };

  const adminWeekOptions = appBootstrap.attendanceWeeks.map((option) => ({
    value: option.weekKey,
    label: option.adminLabel,
  }));

  const adminGroupOptions = appBootstrap.groupFilterOptions;
  const addMemberGroupOptions = appBootstrap.addMemberGroupOptions;
  const handleMemberDirectoryDraftChange = (field, value) => {
    setDraftMemberDirectoryFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleMemberDirectoryDraftGroupToggle = (value) => {
    setDraftMemberDirectoryFilters((prev) => {
      if (value === MEMBER_DIRECTORY_ALL_GROUPS_VALUE) {
        return { ...prev, groupIds: [] };
      }

      const exists = prev.groupIds.includes(value);
      const nextGroupIds = exists ? prev.groupIds.filter((groupId) => groupId !== value) : [...prev.groupIds, value];
      return { ...prev, groupIds: nextGroupIds };
    });
  };

  const handleApplyMemberDirectoryFilters = () => {
    setAppliedMemberDirectoryFilters(draftMemberDirectoryFilters);
  };

  const handleResetMemberDirectoryFilters = () => {
    const nextFilters = getDefaultMemberDirectoryFilters();
    setDraftMemberDirectoryFilters(nextFilters);
    setAppliedMemberDirectoryFilters(nextFilters);
  };

  const handleAdminSectionChange = (nextSection) => {
    setAdminSection(nextSection);
    setAdminPendingBulkActionType(null);
    setShowAddMemberModal(false);
    closeEditMemberModal();
  };

  if (screen === APP_SCREENS.preAttendanceConfirm) {
    return (
      <PreAttendanceConfirmScreen
        accentColor={ACCENT_COLOR}
        attendanceMeta={appBootstrap.currentAttendanceMeta}
        onStart={() => setScreen(APP_SCREENS.attendanceKiosk)}
      />
    );
  }

  if (screen === APP_SCREENS.adminDashboard) {
    return (
      <AdminDashboardScreen
        activeSection={adminSection}
        accentColor={ACCENT_COLOR}
        addMember={{
          canSave: Boolean(addMemberDraft.name.trim() && addMemberDraft.groupId),
          draft: addMemberDraft,
          groupOptions: addMemberGroupOptions,
          helperText: addMemberNameGuide,
          previewDisplayName: addMemberNamePreview?.expectedDisplayName || null,
          isNewcomerGroupSelected: isNewcomerGroupId(appBootstrap.groups, addMemberDraft.groupId),
          isOpen: showAddMemberModal,
          onClose: closeAddMemberModal,
          onDraftChange: handleAddMemberDraftChange,
          onOpen: () => setShowAddMemberModal(true),
          onSave: handleAddMemberSave,
        }}
        bulkAction={{
          onClose: () => setAdminPendingBulkActionType(null),
          onConfirm: handleBulkActionConfirm,
          pendingType: adminPendingBulkActionType,
        }}
        filters={{
          activeWeekKey: activeAdminWeekKey,
          appliedResolvedWeekKeys,
          draftGroupId: draftFilters.groupId,
          draftNameIds: draftFilters.nameIds,
          draftWeekKeys: draftFilters.weekKeys,
          groupOptions: adminGroupOptions,
          isDirty: isFilterDirty,
          nameOptions: draftNameOptions,
          onActiveWeekChange: setAdminActiveWeekKey,
          onApply: handleApplyFilters,
          onDraftGroupChange: handleDraftGroupChange,
          onDraftNameToggle: handleDraftNameToggle,
          onDraftWeekToggle: handleDraftWeekToggle,
          onReset: handleResetFilters,
          weekOptions: adminWeekOptions,
        }}
        memberDirectory={{
          editMember: {
            canSave: Boolean(editMemberDraft.name.trim() && editMemberDraft.groupId),
            draft: editMemberDraft,
            groupOptions: addMemberGroupOptions,
            isNewcomerGroupSelected: isNewcomerGroupId(appBootstrap.groups, editMemberDraft.groupId),
            isOpen: Boolean(editingMemberId),
            memberLabel: editingMember?.displayName || editingMember?.name || '',
            onClose: closeEditMemberModal,
            onDraftChange: handleEditMemberDraftChange,
            onOpen: handleOpenEditMember,
            onSave: handleEditMemberSave,
          },
          filters: {
            draft: draftMemberDirectoryFilters,
            groupOptions: memberDirectoryGroupOptions,
            isDirty: isMemberDirectoryFilterDirty,
            onApply: handleApplyMemberDirectoryFilters,
            onDraftChange: handleMemberDirectoryDraftChange,
            onDraftGroupToggle: handleMemberDirectoryDraftGroupToggle,
            onReset: handleResetMemberDirectoryFilters,
          },
          onToggleActive: handleToggleMemberActive,
          rows: memberDirectoryRows,
          summary: memberDirectorySummary,
        }}
        navigation={{
          activeSection: adminSection,
          onBackToKiosk: () => setScreen(APP_SCREENS.attendanceKiosk),
          onComingSoon: () => setToast('잘 써준다면 더 만들어볼게^^'),
          onSectionChange: handleAdminSectionChange,
        }}
        summary={{
          attendanceCount: adminAttendanceCount,
          attendanceRate: adminAttendanceRate,
          threeWeekAbsenceCount,
          totalCount: adminTotalCount,
        }}
        threeWeekAbsence={{
          rows: threeWeekAbsenceRows,
        }}
        table={{
          onAttendanceTypeChange: handleAdminAttendanceTypeChange,
          onDownload: handleXlsxDownload,
          onRequestBulkAction: setAdminPendingBulkActionType,
          onRowSelectToggle: (memberId) =>
            setAdminSelectedRowIds((prev) =>
              prev.includes(memberId) ? prev.filter((item) => item !== memberId) : [...prev, memberId],
            ),
          onSelectAllRows: handleToggleAllRows,
          rows: adminRows,
          selectedRowIds: adminSelectedRowIds,
        }}
        toast={toast}
      />
    );
  }

  return (
    <AttendanceKioskScreen
      accentColor={ACCENT_COLOR}
      attendance={currentAttendance}
      attendanceCount={attendanceCount}
      attendanceMeta={appBootstrap.currentAttendanceMeta}
      attendanceRate={attendanceRate}
      canRegisterNewMember={canRegisterNewMember}
      confirmTarget={confirmTarget}
      filtered={filtered}
      newMemberName={newMemberName}
      newMemberStatus={newMemberStatus}
      onBackspace={handleBackspace}
      onCloseNewMemberModal={() => setShowNewMemberModal(false)}
      onConfirmAttendance={handleConfirmAttendance}
      onKeyTap={handleKeyTap}
      onNewMemberNameChange={setNewMemberName}
      onNewMemberStatusChange={setNewMemberStatus}
      onOpenAdmin={() => setScreen(APP_SCREENS.adminDashboard)}
      onOpenNewMemberModal={() => setShowNewMemberModal(true)}
      onRegisterNewMember={handleRegisterNewMember}
      onReset={handleReset}
      onSelectConfirmTarget={setConfirmTarget}
      query={query}
      renderName={renderName}
      resultState={resultState}
      showNewMemberModal={showNewMemberModal}
      toast={toast}
      totalMemberCount={appBootstrap.totalMemberCount}
    />
  );
}
