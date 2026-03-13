import * as React from 'react';
import { saveAttendanceRecord } from '../api/attendanceRecords.js';
import { getAppBootstrapData, getFallbackAppBootstrapData } from '../api/bootstrap.js';
import { getMembers } from '../api/members.js';
import { hasSupabaseEnv } from '../lib/supabase.js';
import {
  buildAppAttendanceRecordFromRow,
  buildAttendanceUpdate,
  getAttendanceRecord,
  upsertAttendanceRecord,
} from '../domain/attendance/attendanceHelpers.js';
import { MEMBER_CHANGE_HISTORY_STORAGE_KEY, loadMemberChangeHistory } from '../domain/members/memberHistory.js';
import { buildAppMemberFromRow } from '../domain/members/memberHelpers.js';

const { useCallback, useEffect, useState } = React;

const FALLBACK_BOOTSTRAP = getFallbackAppBootstrapData();

export function useAppBootstrapState() {
  const [appBootstrap, setAppBootstrap] = useState(() => FALLBACK_BOOTSTRAP);
  const [members, setMembers] = useState(() => FALLBACK_BOOTSTRAP.members);
  const [attendanceRecords, setAttendanceRecords] = useState(() => FALLBACK_BOOTSTRAP.attendanceRecords);
  const [newcomerIntakes, setNewcomerIntakes] = useState(() => FALLBACK_BOOTSTRAP.newcomerIntakes);
  const [memberChangeHistory, setMemberChangeHistory] = useState(() => loadMemberChangeHistory());
  const [toast, setToast] = useState('');

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
      } catch (error) {
        console.warn('Failed to load bootstrap data, using fallback mock source:', error);
      }
    }

    loadBootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(MEMBER_CHANGE_HISTORY_STORAGE_KEY, JSON.stringify(memberChangeHistory));
    } catch (error) {
      console.warn('[appState] failed to persist member change history', error);
    }
  }, [memberChangeHistory]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const applyMembersState = useCallback((nextMembers) => {
    setMembers(nextMembers);
    setAppBootstrap((prev) => ({
      ...prev,
      totalMemberCount: nextMembers.filter((member) => member.isActive).length,
    }));
    return nextMembers;
  }, []);

  const syncMembersAfterWrite = useCallback(
    async (buildFallbackMembers) => {
      if (hasSupabaseEnv) {
        try {
          const latestMemberRows = await getMembers();
          const nextMembers = latestMemberRows.map((row) => buildAppMemberFromRow(row, appBootstrap.groups));
          return applyMembersState(nextMembers);
        } catch (error) {
          console.warn('[appState] member refresh after save failed, falling back to local state', error);
        }
      }

      return applyMembersState(buildFallbackMembers());
    },
    [appBootstrap.groups, applyMembersState],
  );

  const applyAttendanceRecordState = useCallback((nextRecord) => {
    setAttendanceRecords((prev) => upsertAttendanceRecord(prev, nextRecord));
  }, []);

  const replaceAttendanceRecords = useCallback((nextRecords) => {
    setAttendanceRecords(nextRecords);
  }, []);

  const persistAttendanceTypeChange = useCallback(
    async ({ existingRecord: existingRecordOverride, memberId, nextAttendanceType, source, weekMeta, baseTime }) => {
      if (!weekMeta?.id) {
        throw new Error(`[attendance] missing attendance week id for ${weekMeta?.weekKey || 'unknown week'}`);
      }

      const existingRecord = existingRecordOverride || getAttendanceRecord(attendanceRecords, memberId, weekMeta.weekKey);
      const nextRecord = buildAttendanceUpdate(existingRecord, memberId, weekMeta, nextAttendanceType, source, baseTime);

      const savedRow = await saveAttendanceRecord({
        attendance_type: nextRecord.attendanceType,
        attendance_week_id: weekMeta.id,
        attended_at: nextRecord.attendedAtRaw,
        member_id: memberId,
        note: nextRecord.note,
        source,
      });

      return buildAppAttendanceRecordFromRow(savedRow, weekMeta);
    },
    [attendanceRecords],
  );

  const appendMemberHistoryEntries = useCallback((entries) => {
    if (!entries?.length) return;
    setMemberChangeHistory((prev) => [...entries, ...prev]);
  }, []);

  return {
    actions: {
      appendMemberHistoryEntries,
      applyAttendanceRecordState,
      applyMembersState,
      persistAttendanceTypeChange,
      replaceAttendanceRecords,
      setAppBootstrap,
      setMemberChangeHistory,
      setMembers,
      setNewcomerIntakes,
      setToast,
      syncMembersAfterWrite,
    },
    state: {
      appBootstrap,
      attendanceRecords,
      memberChangeHistory,
      members,
      newcomerIntakes,
      toast,
    },
  };
}
