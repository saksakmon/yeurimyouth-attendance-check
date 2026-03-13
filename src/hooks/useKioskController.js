import * as React from 'react';
import { createMember } from '../api/members.js';
import { buildAttendanceMap } from '../domain/attendance/attendanceHelpers.js';
import { filterMembers, getResultState } from '../domain/kiosk/search.js';
import { buildAppMemberFromRow } from '../domain/members/memberHelpers.js';
import { createId } from '../domain/shared/helpers.js';

const { useMemo, useState } = React;

export function useKioskController({
  appBootstrap,
  attendanceRecords,
  currentActiveMembers,
  groups,
  newcomerGroup,
  members,
  persistAttendanceTypeChange,
  syncMembersAfterWrite,
  applyAttendanceRecordState,
  setNewcomerIntakes,
  setToast,
}) {
  const [query, setQuery] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [showNewMemberModal, setShowNewMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberStatus, setNewMemberStatus] = useState('registered');

  const filtered = useMemo(() => filterMembers(currentActiveMembers, query), [currentActiveMembers, query]);
  const resultState = getResultState(query, filtered);
  const currentAttendance = useMemo(
    () => buildAttendanceMap(attendanceRecords, appBootstrap.currentWeekKey),
    [attendanceRecords, appBootstrap.currentWeekKey],
  );
  const attendanceCount = useMemo(
    () => currentActiveMembers.filter((member) => Boolean(currentAttendance[member.id])).length,
    [currentActiveMembers, currentAttendance],
  );
  const attendanceRate = currentActiveMembers.length > 0 ? Math.round((attendanceCount / currentActiveMembers.length) * 100) : 0;
  const canRegisterNewMember = Boolean(newMemberName.trim());

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
      console.error('[kiosk] attendance save failed', error);
      setToast('출석 저장 중 오류가 발생했어요');
    }
  };

  const handleRegisterNewMember = async () => {
    const trimmedName = newMemberName.trim();
    if (!trimmedName) return;

    if (!newcomerGroup) {
      setToast('새가족숲 정보를 찾지 못했어요');
      return;
    }

    const memberType = newMemberStatus === 'visit' ? 'visitor' : 'registered';
    let savedMemberRow = null;

    try {
      savedMemberRow = await createMember({
        group_id: newcomerGroup.id,
        is_active: true,
        member_type: memberType,
        name: trimmedName,
      });

      const appMember = buildAppMemberFromRow(savedMemberRow, groups);
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
      console.error('[kiosk] newcomer registration failed', error);

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

  const clearConfirmTargetForMembers = (memberIds) => {
    if (confirmTarget?.id && memberIds.includes(confirmTarget.id)) {
      setConfirmTarget(null);
    }
  };

  return {
    actions: {
      clearConfirmTargetForMembers,
      closeNewMemberModal: () => setShowNewMemberModal(false),
      confirmAttendance: handleConfirmAttendance,
      openNewMemberModal: () => setShowNewMemberModal(true),
      registerNewMember: handleRegisterNewMember,
      selectConfirmTarget: setConfirmTarget,
      setNewMemberName,
      setNewMemberStatus,
      tapBackspace: handleBackspace,
      tapKey: handleKeyTap,
      tapReset: handleReset,
    },
    state: {
      attendanceCount,
      attendanceMap: currentAttendance,
      attendanceRate,
      canRegisterNewMember,
      confirmTarget,
      filtered,
      newMemberName,
      newMemberStatus,
      query,
      resultState,
      showNewMemberModal,
      totalMemberCount: currentActiveMembers.length,
    },
  };
}
