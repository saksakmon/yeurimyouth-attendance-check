import * as React from 'react';
import * as XLSX from 'xlsx';
import { PERMISSIONS } from '../auth/permissions.js';
import {
  buildAttendanceMap,
  getAttendanceRecord,
  getAttendanceTypeLabel,
  getRecentAbsenceStreakCount,
  getRecentAbsenceStreakRows,
  isPresentAttendanceType,
  upsertAttendanceRecord,
} from '../domain/attendance/attendanceHelpers.js';
import { isMemberActiveOnServiceDate } from '../domain/members/memberHistory.js';
import { getMemberLifecycleLabel } from '../domain/members/memberHelpers.js';

const { useEffect, useMemo, useRef, useState } = React;

function areFiltersEqual(a, b) {
  return (
    a.groupId === b.groupId &&
    JSON.stringify(a.weekKeys) === JSON.stringify(b.weekKeys) &&
    JSON.stringify(a.nameIds) === JSON.stringify(b.nameIds)
  );
}

export function useAdminAttendanceController({
  appBootstrap,
  attendanceRecords,
  auth,
  memberChangeHistory,
  persistAttendanceTypeChange,
  replaceAttendanceRecords,
  resolvedMembers,
  setToast,
}) {
  const defaultAdminFilters = useMemo(
    () => ({
      weekKeys: [appBootstrap.currentWeekKey],
      groupId: 'all',
      nameIds: [],
    }),
    [appBootstrap.currentWeekKey],
  );
  const previousCurrentWeekRef = useRef(appBootstrap.currentWeekKey);

  const [draftFilters, setDraftFilters] = useState(defaultAdminFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultAdminFilters);
  const [adminActiveWeekKey, setAdminActiveWeekKey] = useState(appBootstrap.currentWeekKey);
  const [adminSelectedRowIds, setAdminSelectedRowIds] = useState([]);
  const [adminPendingBulkActionType, setAdminPendingBulkActionType] = useState(null);

  useEffect(() => {
    const previousCurrentWeek = previousCurrentWeekRef.current;
    if (previousCurrentWeek === appBootstrap.currentWeekKey) return;

    setDraftFilters((prev) =>
      prev.weekKeys.length === 1 && prev.weekKeys[0] === previousCurrentWeek
        ? { ...prev, weekKeys: [appBootstrap.currentWeekKey] }
        : prev,
    );
    setAppliedFilters((prev) =>
      prev.weekKeys.length === 1 && prev.weekKeys[0] === previousCurrentWeek
        ? { ...prev, weekKeys: [appBootstrap.currentWeekKey] }
        : prev,
    );
    setAdminActiveWeekKey((prev) => (prev === previousCurrentWeek ? appBootstrap.currentWeekKey : prev));
    previousCurrentWeekRef.current = appBootstrap.currentWeekKey;
  }, [appBootstrap.currentWeekKey]);

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

  const isMemberActiveForAdminWeek = React.useCallback(
    (member, serviceDate) => isMemberActiveOnServiceDate(member, serviceDate, memberChangeHistory),
    [memberChangeHistory],
  );

  const adminWeekActiveMembers = useMemo(
    () =>
      resolvedMembers.filter((member) => isMemberActiveForAdminWeek(member, activeAdminWeekMeta?.serviceDate || null)),
    [activeAdminWeekMeta?.serviceDate, isMemberActiveForAdminWeek, resolvedMembers],
  );

  const draftNameOptions = useMemo(
    () =>
      adminWeekActiveMembers
        .filter((member) => draftFilters.groupId === 'all' || member.groupId === draftFilters.groupId)
        .map((member) => ({ value: member.id, label: member.displayName || member.name })),
    [adminWeekActiveMembers, draftFilters.groupId],
  );

  useEffect(() => {
    setDraftFilters((prev) => ({
      ...prev,
      nameIds: prev.nameIds.filter((memberId) => draftNameOptions.some((option) => option.value === memberId)),
    }));
  }, [draftNameOptions]);

  const filteredAdminMembers = useMemo(
    () =>
      adminWeekActiveMembers.filter((member) => {
        const matchGroup = appliedFilters.groupId === 'all' || member.groupId === appliedFilters.groupId;
        const matchName = appliedFilters.nameIds.length === 0 || appliedFilters.nameIds.includes(member.id);
        return matchGroup && matchName;
      }),
    [adminWeekActiveMembers, appliedFilters],
  );

  const adminRows = useMemo(
    () =>
      filteredAdminMembers.map((member) => {
        const record = getAttendanceRecord(attendanceRecords, member.id, activeAdminWeekKey);
        const attendanceType = record?.attendanceType || 'absent';

        return {
          attendanceType,
          attendanceTypeLabel: getAttendanceTypeLabel(attendanceType),
          attendedAt: isPresentAttendanceType(attendanceType) ? record?.attendedAt || null : null,
          groupName: member.groupName || '-',
          id: member.id,
          memberTypeLabel: getMemberLifecycleLabel(member, appBootstrap.groups),
          name: member.displayName || member.name,
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
        isMemberActiveForAdminWeek,
      ),
    [
      filteredAdminMembers,
      attendanceRecords,
      appBootstrap.attendanceWeeks,
      activeAdminWeekKey,
      appBootstrap.groups,
      isMemberActiveForAdminWeek,
    ],
  );
  const threeWeekAbsenceCount = getRecentAbsenceStreakCount(
    filteredAdminMembers,
    attendanceRecords,
    appBootstrap.attendanceWeeks,
    activeAdminWeekKey,
    isMemberActiveForAdminWeek,
  );

  const handleDraftWeekToggle = (value) => {
    setDraftFilters((prev) => {
      if (value === 'ALL') {
        return { ...prev, weekKeys: ['ALL'] };
      }

      const base = prev.weekKeys.includes('ALL') ? [] : prev.weekKeys;
      const normalized = base.includes(value) ? base.filter((item) => item !== value) : [...base, value];

      if (normalized.length === 0) {
        return { ...prev, weekKeys: [appBootstrap.currentWeekKey] };
      }

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
        adminWeekActiveMembers.some((member) => member.id === memberId && (groupId === 'all' || member.groupId === groupId)),
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

  const handleAdminAttendanceTypeChange = async (memberId, nextAttendanceType) => {
    if (!auth.can(PERMISSIONS.attendanceEdit)) {
      setToast('출결을 수정할 권한이 없어요');
      return;
    }

    const member = resolvedMembers.find((item) => item.id === memberId);
    const memberLabel = member?.displayName || member?.name;

    try {
      const syncedRecord = await persistAttendanceTypeChange({
        memberId,
        nextAttendanceType,
        source: 'admin',
        weekMeta: activeAdminWeekMeta,
      });

      replaceAttendanceRecords(upsertAttendanceRecord(attendanceRecords, syncedRecord));

      if (memberLabel) {
        setToast(`${memberLabel} 출결을 ${getAttendanceTypeLabel(nextAttendanceType)}로 변경했어요`);
      }
    } catch (error) {
      console.error('[adminAttendance] change failed', error);
      setToast('출결 저장 중 오류가 발생했어요');
    }
  };

  const handleBulkActionConfirm = async () => {
    if (!adminPendingBulkActionType || adminSelectedRowIds.length === 0) return;

    if (!auth.can(PERMISSIONS.attendanceEdit)) {
      setToast('출결을 수정할 권한이 없어요');
      return;
    }

    const nextRecordsSeed = attendanceRecords;
    let nextRecords = nextRecordsSeed;

    try {
      for (const memberId of adminSelectedRowIds) {
        const existingRecord = getAttendanceRecord(nextRecords, memberId, activeAdminWeekKey);
        const syncedRecord = await persistAttendanceTypeChange({
          existingRecord,
          memberId,
          nextAttendanceType: adminPendingBulkActionType,
          source: 'admin',
          weekMeta: activeAdminWeekMeta,
        });

        nextRecords = upsertAttendanceRecord(nextRecords, syncedRecord);
      }

      replaceAttendanceRecords(nextRecords);
      setToast(`선택한 ${adminSelectedRowIds.length}명의 출결을 ${getAttendanceTypeLabel(adminPendingBulkActionType)}로 변경했어요`);
      setAdminPendingBulkActionType(null);
      setAdminSelectedRowIds([]);
    } catch (error) {
      console.error('[adminAttendance] bulk change failed', error);
      replaceAttendanceRecords(nextRecords);
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
    worksheet['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 14 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '출결관리');
    XLSX.writeFile(workbook, `출결관리-${activeAdminWeekMeta.weekKey}.xlsx`);
    setToast('선택한 주차만 다운로드 돼요');
  };

  const resetSectionState = () => {
    setAdminPendingBulkActionType(null);
    setAdminSelectedRowIds([]);
  };

  return {
    actions: {
      resetSectionState,
    },
    adminSummary: {
      attendanceCount: adminAttendanceCount,
      attendanceRate: adminAttendanceRate,
      totalCount: adminTotalCount,
      threeWeekAbsenceCount,
    },
    filtersProps: {
      activeWeekKey: adminActiveWeekKey,
      appliedResolvedWeekKeys,
      draftGroupId: draftFilters.groupId,
      draftNameIds: draftFilters.nameIds,
      draftWeekKeys: draftFilters.weekKeys,
      groupOptions: appBootstrap.groupFilterOptions,
      isDirty: isFilterDirty,
      nameOptions: draftNameOptions,
      onActiveWeekChange: setAdminActiveWeekKey,
      onApply: handleApplyFilters,
      onDraftGroupChange: handleDraftGroupChange,
      onDraftNameToggle: handleDraftNameToggle,
      onDraftWeekToggle: handleDraftWeekToggle,
      onReset: handleResetFilters,
      weekOptions: appBootstrap.attendanceWeeks.map((option) => ({ value: option.weekKey, label: option.adminLabel })),
    },
    tableProps: {
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
    },
    tableSelection: {
      bulkAction: {
        onClose: () => setAdminPendingBulkActionType(null),
        onConfirm: handleBulkActionConfirm,
        pendingType: adminPendingBulkActionType,
      },
    },
    threeWeekAbsence: {
      rows: threeWeekAbsenceRows,
    },
  };
}
