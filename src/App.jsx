import * as React from 'react';
import * as XLSX from 'xlsx';
import { getAppBootstrapData, getFallbackAppBootstrapData } from './api/bootstrap.js';
import AdminDashboardScreen from './components/AdminDashboardScreen.jsx';
import AttendanceKioskScreen from './components/AttendanceKioskScreen.jsx';
import PreAttendanceConfirmScreen from './components/PreAttendanceConfirmScreen.jsx';

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
    return [...records, { ...nextRecord, id: createId('attendance') }];
  }

  return records.map((record, index) =>
    index === existingIndex
      ? {
          ...record,
          ...nextRecord,
          id: record.id,
        }
      : record,
  );
}

function buildAttendanceUpdate(existingRecord, memberId, weekMeta, nextAttendanceType, source, baseTime = formatNow()) {
  const wasPresent = isPresentAttendanceType(existingRecord?.attendanceType);
  const willBePresent = isPresentAttendanceType(nextAttendanceType);

  return {
    memberId,
    weekKey: weekMeta.weekKey,
    serviceDate: weekMeta.serviceDate,
    attendanceType: nextAttendanceType,
    attendedAt: willBePresent ? (wasPresent ? existingRecord?.attendedAt || baseTime : baseTime) : null,
    source,
  };
}

function filterMembers(members, query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];

  return members.filter((member) => {
    const haystack = `${member.name}${member.groupName || ''}${getChosung(member.name)}`;
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
        name: member.name,
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

  const filtered = useMemo(() => filterMembers(members, query), [members, query]);
  const currentAttendance = useMemo(
    () => buildAttendanceMap(attendanceRecords, appBootstrap.currentWeekKey),
    [attendanceRecords, appBootstrap.currentWeekKey],
  );
  const attendanceCount = useMemo(() => Object.values(currentAttendance).filter(Boolean).length, [currentAttendance]);
  const attendanceRate = appBootstrap.totalMemberCount > 0 ? Math.round((attendanceCount / appBootstrap.totalMemberCount) * 100) : 0;
  const resultState = getResultState(query, filtered);
  const canRegisterNewMember = Boolean(newMemberName.trim());
  const isFilterDirty = !areFiltersEqual(draftFilters, appliedFilters);

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
      members
        .filter((member) => draftFilters.groupId === 'all' || member.groupId === draftFilters.groupId)
        .map((member) => ({ value: member.id, label: member.name })),
    [members, draftFilters.groupId],
  );

  useEffect(() => {
    setDraftFilters((prev) => ({
      ...prev,
      nameIds: prev.nameIds.filter((memberId) => draftNameOptions.some((option) => option.value === memberId)),
    }));
  }, [draftNameOptions]);

  const filteredAdminMembers = useMemo(
    () =>
      members.filter((member) => {
        const matchGroup = appliedFilters.groupId === 'all' || member.groupId === appliedFilters.groupId;
        const matchName = appliedFilters.nameIds.length === 0 || appliedFilters.nameIds.includes(member.id);
        return matchGroup && matchName;
      }),
    [members, appliedFilters],
  );

  const adminRows = useMemo(
    () =>
      filteredAdminMembers.map((member) => {
        const record = getAttendanceRecord(attendanceRecords, member.id, activeAdminWeekKey);
        const attendanceType = record?.attendanceType || 'absent';

        return {
          id: member.id,
          name: member.name,
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

  const applyAttendanceTypeChange = ({ memberId, weekMeta, nextAttendanceType, source, baseTime = formatNow() }) => {
    setAttendanceRecords((prev) => {
      const existingRecord = getAttendanceRecord(prev, memberId, weekMeta.weekKey);
      return upsertAttendanceRecord(
        prev,
        buildAttendanceUpdate(existingRecord, memberId, weekMeta, nextAttendanceType, source, baseTime),
      );
    });
  };

  const handleKeyTap = (key) => setQuery((prev) => prev + key);
  const handleBackspace = () => setQuery((prev) => prev.slice(0, -1));
  const handleReset = () => setQuery('');

  const handleConfirmAttendance = () => {
    if (!confirmTarget) return;

    applyAttendanceTypeChange({
      memberId: confirmTarget.id,
      weekMeta: appBootstrap.currentAttendanceMeta,
      nextAttendanceType: 'youth',
      source: 'kiosk',
    });

    setConfirmTarget(null);
    setQuery('');
    setToast(`${confirmTarget.name} 출석이 완료됐어요`);
  };

  const handleRegisterNewMember = () => {
    const trimmedName = newMemberName.trim();
    if (!trimmedName) return;

    const memberId = createId('member');
    const memberType = newMemberStatus === 'visit' ? 'visitor' : 'registered';

    setMembers((prev) => [
      ...prev,
      {
        id: memberId,
        name: trimmedName,
        memberType,
        groupId: 'group-newcomer',
        groupName: '새가족숲',
      },
    ]);

    applyAttendanceTypeChange({
      memberId,
      weekMeta: appBootstrap.currentAttendanceMeta,
      nextAttendanceType: 'youth',
      source: 'kiosk',
    });

    setNewcomerIntakes((prev) => [
      ...prev,
      {
        id: createId('intake'),
        name: trimmedName,
        intakeDate: appBootstrap.currentServiceDate,
        intakeType: memberType === 'visitor' ? 'visit' : 'registered',
        attendanceLinked: true,
        memberId,
      },
    ]);

    setShowNewMemberModal(false);
    setNewMemberName('');
    setNewMemberStatus('registered');
    setQuery('');
    setToast(`새가족 ${memberType === 'visitor' ? '방문' : '등록'} 및 출석처리가 완료됐어요`);
  };

  const handleAdminAttendanceTypeChange = (memberId, nextAttendanceType) => {
    const member = members.find((item) => item.id === memberId);

    applyAttendanceTypeChange({
      memberId,
      weekMeta: activeAdminWeekMeta,
      nextAttendanceType,
      source: 'admin',
    });

    if (member) {
      setToast(`${member.name} 출결을 ${getAttendanceTypeLabel(nextAttendanceType)}로 변경했어요`);
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
        members.some((member) => member.id === memberId && (groupId === 'all' || member.groupId === groupId)),
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

  const handleBulkActionConfirm = () => {
    if (!adminPendingBulkActionType || adminSelectedRowIds.length === 0) return;

    const baseTime = formatNow();

    setAttendanceRecords((prev) =>
      adminSelectedRowIds.reduce((records, memberId) => {
        const existingRecord = getAttendanceRecord(records, memberId, activeAdminWeekKey);
        return upsertAttendanceRecord(
          records,
          buildAttendanceUpdate(existingRecord, memberId, activeAdminWeekMeta, adminPendingBulkActionType, 'admin', baseTime),
        );
      }, prev),
    );

    setToast(`선택한 ${adminSelectedRowIds.length}명의 출결을 ${getAttendanceTypeLabel(adminPendingBulkActionType)}로 변경했어요`);
    setAdminPendingBulkActionType(null);
    setAdminSelectedRowIds([]);
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
      if (field === 'groupId' && value !== 'group-newcomer') {
        return { ...prev, groupId: value, memberType: 'registered' };
      }

      return { ...prev, [field]: value };
    });
  };

  const handleAddMemberSave = () => {
    if (!addMemberDraft.name.trim() || !addMemberDraft.groupId) return;

    const selectedGroup = appBootstrap.groups.find((group) => group.id === addMemberDraft.groupId);
    const memberId = createId('member');
    const memberType = addMemberDraft.groupId === 'group-newcomer' ? addMemberDraft.memberType : 'registered';

    setMembers((prev) => [
      ...prev,
      {
        id: memberId,
        name: addMemberDraft.name.trim(),
        memberType,
        groupId: selectedGroup?.id || null,
        groupName: selectedGroup?.name || null,
      },
    ]);

    if (addMemberDraft.groupId === 'group-newcomer') {
      setNewcomerIntakes((prev) => [
        ...prev,
        {
          id: createId('intake'),
          name: addMemberDraft.name.trim(),
          intakeDate: appBootstrap.currentServiceDate,
          intakeType: memberType === 'visitor' ? 'visit' : 'registered',
          attendanceLinked: false,
          memberId,
        },
      ]);
    }

    setShowAddMemberModal(false);
    setAddMemberDraft({ name: '', groupId: '', memberType: 'visitor' });
    setToast(`${addMemberDraft.name.trim()} 청년을 추가했어요`);
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
