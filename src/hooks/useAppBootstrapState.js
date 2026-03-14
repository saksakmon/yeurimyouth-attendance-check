import * as React from 'react';
import { saveAttendanceRecord } from '../api/attendanceRecords.js';
import { getAppBootstrapData, getFallbackAppBootstrapData } from '../api/bootstrap.js';
import { getMemberChangeHistory, saveMemberChangeHistoryEntries } from '../api/memberChangeHistory.js';
import { getMembers } from '../api/members.js';
import { ROLES, normalizeRole } from '../auth/permissions.js';
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
const SERVER_HISTORY_ROLES = new Set([ROLES.superAdmin, ROLES.admin]);

function getLocalMemberHistorySeed() {
  return hasSupabaseEnv ? [] : loadMemberChangeHistory();
}

export function useAppBootstrapState(auth) {
  const [appBootstrap, setAppBootstrap] = useState(() => FALLBACK_BOOTSTRAP);
  const [members, setMembers] = useState(() => FALLBACK_BOOTSTRAP.members);
  const [attendanceRecords, setAttendanceRecords] = useState(() => FALLBACK_BOOTSTRAP.attendanceRecords);
  const [newcomerIntakes, setNewcomerIntakes] = useState(() => FALLBACK_BOOTSTRAP.newcomerIntakes);
  const [memberChangeHistory, setMemberChangeHistory] = useState(() => getLocalMemberHistorySeed());
  const [toast, setToast] = useState('');
  const resolvedRole = normalizeRole(auth?.currentUser?.role);
  const canPersistServerHistory = SERVER_HISTORY_ROLES.has(resolvedRole);

  useEffect(() => {
    if (hasSupabaseEnv && auth?.status === 'loading') {
      return undefined;
    }

    let active = true;

    async function loadBootstrap() {
      if (!hasSupabaseEnv) {
        setAppBootstrap(FALLBACK_BOOTSTRAP);
        setMembers(FALLBACK_BOOTSTRAP.members);
        setAttendanceRecords(FALLBACK_BOOTSTRAP.attendanceRecords);
        setNewcomerIntakes(FALLBACK_BOOTSTRAP.newcomerIntakes);
        setMemberChangeHistory(loadMemberChangeHistory());
        return;
      }

      try {
        const data = await getAppBootstrapData();
        if (!active) return;

        setAppBootstrap(data);
        setMembers(data.members);
        setAttendanceRecords(data.attendanceRecords);
        setNewcomerIntakes(data.newcomerIntakes);

        if (canPersistServerHistory) {
          try {
            const historyRows = await getMemberChangeHistory();
            if (!active) return;
            setMemberChangeHistory(historyRows);
          } catch (historyError) {
            console.warn('[appState] member history bootstrap failed, continuing without history', historyError);
            if (!active) return;
            setMemberChangeHistory([]);
          }
          return;
        }

        setMemberChangeHistory([]);
      } catch (error) {
        console.warn('Failed to load bootstrap data, using fallback mock source:', error);
        if (!active) return;
        setAppBootstrap(FALLBACK_BOOTSTRAP);
        setMembers(FALLBACK_BOOTSTRAP.members);
        setAttendanceRecords(FALLBACK_BOOTSTRAP.attendanceRecords);
        setNewcomerIntakes(FALLBACK_BOOTSTRAP.newcomerIntakes);
        setMemberChangeHistory(getLocalMemberHistorySeed());
      }
    }

    loadBootstrap();
    return () => {
      active = false;
    };
  }, [auth?.status, auth?.isAuthenticated, auth?.currentUser?.id, resolvedRole, canPersistServerHistory]);

  useEffect(() => {
    if (hasSupabaseEnv || typeof window === 'undefined') return;

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

  const appendMemberHistoryEntries = useCallback(
    async (entries) => {
      if (!entries?.length) return [];

      if (hasSupabaseEnv) {
        if (!canPersistServerHistory) {
          throw new Error('[member_change_history] current session cannot persist member history');
        }

        const savedEntries = await saveMemberChangeHistoryEntries(entries);
        setMemberChangeHistory((prev) => [...savedEntries, ...prev]);
        return savedEntries;
      }

      setMemberChangeHistory((prev) => [...entries, ...prev]);
      return entries;
    },
    [canPersistServerHistory],
  );

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
