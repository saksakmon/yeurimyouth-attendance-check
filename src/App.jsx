import * as React from 'react';
import * as XLSX from 'xlsx';
import { saveAttendanceRecord } from './api/attendanceRecords.js';
import { getAppBootstrapData, getFallbackAppBootstrapData } from './api/bootstrap.js';
import { formatAttendedTime } from './api/mappers.js';
import { createMember, getMembers } from './api/members.js';
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
const RECENT_ABSENCE_WINDOW_SIZE = 3;
const CHOSUNG_QUERY_PATTERN = /^[ㄱ-ㅎ]+$/;
const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const MEMBER_TYPE_LABELS = {
  registered: '등록 회원',
  visitor: '방문 회원',
};
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

function getMemberTypeLabel(memberType) {
  return MEMBER_TYPE_LABELS[memberType] || '등록 회원';
}

function getAttendanceTypeLabel(attendanceType) {
  return ATTENDANCE_TYPE_LABELS[attendanceType] || '결석';
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

  return members.filter((member) =>
    recentWeekKeys.every((weekKey) => {
      const record = getAttendanceRecord(records, member.id, weekKey);
      return !isPresentAttendanceType(record?.attendanceType);
    }),
  ).length;
}

function getRecentAbsenceStreakRows(members, records, weekOptions, selectedWeekKey) {
  const { startIndex, recentWeeks } = getRecentAttendanceWindow(weekOptions, selectedWeekKey);
  const recentWeekKeys = recentWeeks.map((option) => option.weekKey);

  if (recentWeekKeys.length < RECENT_ABSENCE_WINDOW_SIZE) return [];

  const oldestWeekInWindow = recentWeeks[recentWeeks.length - 1];
  const earlierWeeks = weekOptions.slice(startIndex + recentWeeks.length);

  return members
    .filter((member) =>
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
        memberTypeLabel: getMemberTypeLabel(member.memberType),
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

const FALLBACK_BOOTSTRAP = getFallbackAppBootstrapData();

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
  const [adminActiveWeekKey, setAdminActiveWeekKey] = useState(FALLBACK_BOOTSTRAP.currentWeekKey);
  const [adminSelectedRowIds, setAdminSelectedRowIds] = useState([]);
  const [adminPendingBulkActionType, setAdminPendingBulkActionType] = useState(null);
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
  const membersById = useMemo(
    () => Object.fromEntries(resolvedMembers.map((member) => [member.id, member])),
    [resolvedMembers],
  );
  const filtered = useMemo(() => filterMembers(resolvedMembers, query), [resolvedMembers, query]);
  const currentAttendance = useMemo(
    () => buildAttendanceMap(attendanceRecords, appBootstrap.currentWeekKey),
    [attendanceRecords, appBootstrap.currentWeekKey],
  );
  const attendanceCount = useMemo(() => Object.values(currentAttendance).filter(Boolean).length, [currentAttendance]);
  const attendanceRate = appBootstrap.totalMemberCount > 0 ? Math.round((attendanceCount / appBootstrap.totalMemberCount) * 100) : 0;
  const resultState = getResultState(query, filtered);
  const canRegisterNewMember = Boolean(newMemberName.trim());
  const isFilterDirty = !areFiltersEqual(draftFilters, appliedFilters);
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

  const draftNameOptions = useMemo(
    () =>
      resolvedMembers
        .filter((member) => draftFilters.groupId === 'all' || member.groupId === draftFilters.groupId)
        .map((member) => ({ value: member.id, label: member.displayName || member.name })),
    [resolvedMembers, draftFilters.groupId],
  );

  useEffect(() => {
    setDraftFilters((prev) => ({
      ...prev,
      nameIds: prev.nameIds.filter((memberId) => draftNameOptions.some((option) => option.value === memberId)),
    }));
  }, [draftNameOptions]);

  const filteredAdminMembers = useMemo(
    () =>
      resolvedMembers.filter((member) => {
        const matchGroup = appliedFilters.groupId === 'all' || member.groupId === appliedFilters.groupId;
        const matchName = appliedFilters.nameIds.length === 0 || appliedFilters.nameIds.includes(member.id);
        return matchGroup && matchName;
      }),
    [resolvedMembers, appliedFilters],
  );

  const adminRows = useMemo(
    () =>
      filteredAdminMembers.map((member) => {
        const record = getAttendanceRecord(attendanceRecords, member.id, activeAdminWeekKey);
        const attendanceType = record?.attendanceType || 'absent';

        return {
          id: member.id,
          name: member.displayName || member.name,
          memberTypeLabel: getMemberTypeLabel(member.memberType),
          groupName: member.groupName || '-',
          attendanceType,
          attendanceTypeLabel: getAttendanceTypeLabel(attendanceType),
          attendedAt: isPresentAttendanceType(attendanceType) ? record?.attendedAt || null : null,
        };
      }),
    [filteredAdminMembers, attendanceRecords, activeAdminWeekKey],
  );

  useEffect(() => {
    const visibleRowIds = adminRows.map((row) => row.id);
    setAdminSelectedRowIds((prev) => prev.filter((rowId) => visibleRowIds.includes(rowId)));
  }, [adminRows]);

  const adminAttendanceCount = adminRows.filter((row) => isPresentAttendanceType(row.attendanceType)).length;
  const adminTotalCount = adminRows.length;
  const adminAttendanceRate = adminTotalCount > 0 ? Math.round((adminAttendanceCount / adminTotalCount) * 100) : 0;
  const threeWeekAbsenceRows = useMemo(
    () => getRecentAbsenceStreakRows(filteredAdminMembers, attendanceRecords, appBootstrap.attendanceWeeks, activeAdminWeekKey),
    [filteredAdminMembers, attendanceRecords, activeAdminWeekKey, appBootstrap.attendanceWeeks],
  );
  const threeWeekAbsenceCount = getRecentAbsenceStreakCount(
    filteredAdminMembers,
    attendanceRecords,
    appBootstrap.attendanceWeeks,
    activeAdminWeekKey,
  );

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const closeAddMemberModal = () => {
    setShowAddMemberModal(false);
    setAddMemberDraft({ name: '', groupId: '', memberType: 'visitor' });
  };

  const syncMembersAfterWrite = async (newMember) => {
    if (!hasSupabaseEnv) {
      const nextMembers = [...members, newMember];
      setMembers(nextMembers);
      setAppBootstrap((prev) => ({
        ...prev,
        totalMemberCount: nextMembers.filter((member) => member.isActive).length,
      }));
      return nextMembers;
    }

    try {
      const latestMemberRows = await getMembers();
      const nextMembers = latestMemberRows.map((row) => buildAppMemberFromRow(row, appBootstrap.groups));

      setMembers(nextMembers);
      setAppBootstrap((prev) => ({
        ...prev,
        totalMemberCount: nextMembers.filter((member) => member.isActive).length,
      }));
      return nextMembers;
    } catch (error) {
      console.warn('[app] member refresh after save failed, falling back to local state', error);
      const nextMembers = [...members, newMember];
      setMembers(nextMembers);
      setAppBootstrap((prev) => ({
        ...prev,
        totalMemberCount: nextMembers.filter((member) => member.isActive).length,
      }));
      return nextMembers;
    }
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
      await syncMembersAfterWrite(appMember);

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
        resolvedMembers.some((member) => member.id === memberId && (groupId === 'all' || member.groupId === groupId)),
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
      '회원 유형': row.memberTypeLabel,
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
      const syncedMembers = await syncMembersAfterWrite(appMember);
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
        navigation={{
          onBackToKiosk: () => setScreen(APP_SCREENS.attendanceKiosk),
          onComingSoon: () => setToast('잘 써준다면 더 만들어볼게^^'),
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
