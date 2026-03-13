import * as React from 'react';
import { createMember, updateMember } from '../api/members.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { MEMBER_DIRECTORY_ALL_GROUPS_VALUE, MEMBER_DIRECTORY_FILTERS, MEMBER_DIRECTORY_TYPE_FILTERS } from '../constants/app.js';
import {
  compareMemberDirectoryRows,
  formatMemberCreatedDate,
  getMemberDirectoryTypeLabel,
  getMemberDirectoryTypeValue,
  isMemberWithinCreatedDateRange,
  isNewcomerGroupId,
  buildAppMemberFromRow,
  buildFallbackUpdatedMember,
} from '../domain/members/memberHelpers.js';
import {
  buildMemberEditHistoryContent,
  buildMemberHistoryEntry,
  formatHistoryDateTime,
} from '../domain/members/memberHistory.js';
import { getNextMemberDisplayNamePreview, resolveMemberDisplayNames } from '../utils/memberDisplay.js';
import { createId } from '../domain/shared/helpers.js';
import { hasSupabaseEnv } from '../lib/supabase.js';

const { useEffect, useMemo, useState } = React;

function getDefaultMemberDirectoryFilters() {
  return {
    groupIds: [],
    registeredFrom: '',
    registeredTo: '',
    status: MEMBER_DIRECTORY_FILTERS.all,
    type: MEMBER_DIRECTORY_TYPE_FILTERS.all,
  };
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

export function useMemberDirectoryController({
  appBootstrap,
  auth,
  clearConfirmTargetForMembers,
  members,
  membersById,
  memberChangeHistory,
  persistedActiveMembers,
  resolvedMembers,
  setNewcomerIntakes,
  setToast,
  syncMembersAfterWrite,
  appendMemberHistoryEntries,
}) {
  const [draftMemberDirectoryFilters, setDraftMemberDirectoryFilters] = useState(() => getDefaultMemberDirectoryFilters());
  const [appliedMemberDirectoryFilters, setAppliedMemberDirectoryFilters] = useState(() => getDefaultMemberDirectoryFilters());
  const [memberDirectorySelectedRowIds, setMemberDirectorySelectedRowIds] = useState([]);
  const [memberDirectoryBulkGroupId, setMemberDirectoryBulkGroupId] = useState('');
  const [memberDirectoryBulkGroupModalOpen, setMemberDirectoryBulkGroupModalOpen] = useState(false);
  const [memberDirectoryConfirmAction, setMemberDirectoryConfirmAction] = useState(null);
  const [memberDirectoryHistoryMemberId, setMemberDirectoryHistoryMemberId] = useState(null);
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
  const editingMember = editingMemberId ? membersById[editingMemberId] || null : null;
  const memberDirectorySummary = useMemo(
    () => ({
      activeCount: persistedActiveMembers.length,
      inactiveCount: resolvedMembers.filter((member) => !member.isActive).length,
      totalCount: resolvedMembers.length,
    }),
    [persistedActiveMembers.length, resolvedMembers],
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
  const memberDirectorySelectableRowIds = useMemo(
    () => memberDirectoryRows.filter((row) => row.isActive).map((row) => row.id),
    [memberDirectoryRows],
  );
  const memberDirectorySelectedCount = memberDirectorySelectedRowIds.length;
  const memberDirectoryAllRowsSelected =
    memberDirectorySelectableRowIds.length > 0 &&
    memberDirectorySelectableRowIds.every((rowId) => memberDirectorySelectedRowIds.includes(rowId));
  const memberDirectoryPartiallySelected = memberDirectorySelectedCount > 0 && !memberDirectoryAllRowsSelected;
  const memberDirectoryConfirmDetails = useMemo(() => {
    if (!memberDirectoryConfirmAction?.memberIds?.length) return null;

    const targetMembers = memberDirectoryConfirmAction.memberIds
      .map((memberId) => membersById[memberId])
      .filter((member) => member?.isActive);

    if (targetMembers.length === 0) return null;

    const firstLabel = targetMembers[0]?.displayName || targetMembers[0]?.name || '선택한 청년';
    return {
      confirmLabel: '재적에서 제외',
      description:
        targetMembers.length === 1
          ? `${firstLabel} 청년은 재적 제외 시점 이후 주차부터 출결관리와 키오스크에서 제외돼요.`
          : `선택한 ${targetMembers.length}명은 재적 제외 시점 이후 주차부터 출결관리와 키오스크에서 제외돼요.`,
      memberIds: targetMembers.map((member) => member.id),
      title:
        targetMembers.length === 1
          ? `${firstLabel} 청년을 재적에서 제외할까요?`
          : `${targetMembers.length}명을 재적에서 제외할까요?`,
    };
  }, [memberDirectoryConfirmAction, membersById]);
  const memberDirectoryHistoryRows = useMemo(
    () =>
      memberChangeHistory
        .filter((entry) => entry.memberId === memberDirectoryHistoryMemberId)
        .sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime())
        .map((entry) => ({
          changedAtLabel: formatHistoryDateTime(entry.changedAt),
          changedBy: entry.changedBy || auth.auditActorName,
          content: entry.content || entry.actionLabel || '-',
          id: entry.id,
        })),
    [auth.auditActorName, memberChangeHistory, memberDirectoryHistoryMemberId],
  );
  const memberDirectoryHistoryMember = memberDirectoryHistoryMemberId ? membersById[memberDirectoryHistoryMemberId] || null : null;

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
    setMemberDirectorySelectedRowIds((prev) => prev.filter((rowId) => memberDirectorySelectableRowIds.includes(rowId)));
  }, [memberDirectorySelectableRowIds]);

  useEffect(() => {
    if (memberDirectorySelectedRowIds.length === 0) {
      setMemberDirectoryBulkGroupId('');
      setMemberDirectoryBulkGroupModalOpen(false);
    }
  }, [memberDirectorySelectedRowIds.length]);

  const closeAddMemberModal = () => {
    setShowAddMemberModal(false);
    setAddMemberDraft({ name: '', groupId: '', memberType: 'visitor' });
  };

  const closeEditMemberModal = () => {
    setEditingMemberId(null);
    setEditMemberDraft({ name: '', groupId: '', memberType: 'registered' });
  };

  const ensurePermission = (permission, message) => {
    if (auth.can(permission)) return true;
    setToast(message);
    return false;
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
    if (!ensurePermission(PERMISSIONS.memberCreate, '청년을 추가할 권한이 없어요')) return;
    if (!addMemberDraft.name.trim() || !addMemberDraft.groupId) return;

    const selectedGroup = appBootstrap.groups.find((group) => group.id === addMemberDraft.groupId);
    const trimmedName = addMemberDraft.name.trim();
    const isNewcomerGroup = isNewcomerGroupId(appBootstrap.groups, addMemberDraft.groupId);
    const memberType = isNewcomerGroup ? addMemberDraft.memberType : 'registered';
    const expectedDisplayName = addMemberNamePreview?.expectedDisplayName || trimmedName;

    if (!selectedGroup) {
      setToast('소속 숲 정보를 찾지 못했어요');
      return;
    }

    try {
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

      appendMemberHistoryEntries([
        buildMemberHistoryEntry({
          actionLabel: '회원 추가',
          changedAt: savedMemberRow.updated_at || savedMemberRow.created_at || new Date().toISOString(),
          changedBy: auth.auditActorName,
          content: `회원 추가 · ${createdMemberDisplayName}`,
          memberId: savedMemberRow.id,
        }),
      ]);

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

      closeAddMemberModal();
      setToast(`${createdMemberDisplayName} 청년을 추가했어요`);
    } catch (error) {
      console.error('[memberDirectory] add member save failed', error);
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
    if (!ensurePermission(PERMISSIONS.memberEdit, '회원 정보를 수정할 권한이 없어요')) return;

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
    if (!ensurePermission(PERMISSIONS.memberEdit, '회원 정보를 수정할 권한이 없어요')) return;
    if (!editingMemberId || !editingMember || !editMemberDraft.name.trim() || !editMemberDraft.groupId) return;

    const trimmedName = editMemberDraft.name.trim();
    const nextMemberType = isNewcomerGroupId(appBootstrap.groups, editMemberDraft.groupId)
      ? editMemberDraft.memberType
      : 'registered';
    const editDescription = buildMemberEditHistoryContent(
      editingMember,
      {
        groupId: editMemberDraft.groupId,
        memberType: nextMemberType,
        name: trimmedName,
      },
      appBootstrap.groups,
    );

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

      appendMemberHistoryEntries([
        buildMemberHistoryEntry({
          actionLabel: '회원 정보 수정',
          changedAt: savedMemberRow.updated_at || new Date().toISOString(),
          changedBy: auth.auditActorName,
          content: editDescription,
          memberId: editingMemberId,
        }),
      ]);

      closeEditMemberModal();
      setToast(`${updatedDisplayName} 정보를 수정했어요`);
    } catch (error) {
      console.error('[memberDirectory] edit member save failed', error);
      setToast('회원 정보 저장 중 오류가 발생했어요');
    }
  };

  const handleToggleMemberActive = async (memberId) => {
    const member = membersById[memberId];
    if (!member) return;

    const nextIsActive = !member.isActive;
    if (!nextIsActive) {
      if (!ensurePermission(PERMISSIONS.memberStatusEdit, '재적 상태를 변경할 권한이 없어요')) return;
      setMemberDirectoryConfirmAction({ memberIds: [memberId], type: 'deactivate' });
      return;
    }

    if (!ensurePermission(PERMISSIONS.memberStatusEdit, '재적 상태를 변경할 권한이 없어요')) return;

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

      appendMemberHistoryEntries([
        buildMemberHistoryEntry({
          actionLabel: nextIsActive ? '재적 복구' : '재적 제외',
          changedAt: savedMemberRow.updated_at || new Date().toISOString(),
          changedBy: auth.auditActorName,
          content: nextIsActive ? '재적 복구' : '재적에서 제외',
          kind: 'status',
          memberId,
          nextIsActive,
        }),
      ]);

      clearConfirmTargetForMembers([memberId]);
      setToast(nextIsActive ? `${toggledDisplayName} 청년을 다시 복구했어요` : `${toggledDisplayName} 청년을 재적에서 제외했어요`);
    } catch (error) {
      console.error('[memberDirectory] member active toggle failed', error);
      setToast('회원 상태 변경 중 오류가 발생했어요');
    }
  };

  const handleMemberDirectoryRowSelectToggle = (memberId) => {
    if (!memberDirectorySelectableRowIds.includes(memberId)) return;

    setMemberDirectorySelectedRowIds((prev) =>
      prev.includes(memberId) ? prev.filter((item) => item !== memberId) : [...prev, memberId],
    );
  };

  const handleMemberDirectorySelectAllRows = () => {
    if (memberDirectorySelectableRowIds.length === 0) return;

    setMemberDirectorySelectedRowIds((prev) => {
      if (memberDirectoryAllRowsSelected) {
        return prev.filter((rowId) => !memberDirectorySelectableRowIds.includes(rowId));
      }

      return Array.from(new Set([...prev, ...memberDirectorySelectableRowIds]));
    });
  };

  const handleRequestMemberDirectoryBulkDeactivate = () => {
    if (!ensurePermission(PERMISSIONS.memberStatusEdit, '재적 상태를 변경할 권한이 없어요')) return;
    if (memberDirectorySelectedRowIds.length === 0) return;
    setMemberDirectoryConfirmAction({
      memberIds: memberDirectorySelectedRowIds,
      type: 'deactivate',
    });
  };

  const handleConfirmMemberDirectoryDeactivate = async () => {
    if (!ensurePermission(PERMISSIONS.memberStatusEdit, '재적 상태를 변경할 권한이 없어요')) return;
    if (!memberDirectoryConfirmDetails?.memberIds?.length) {
      setMemberDirectoryConfirmAction(null);
      return;
    }

    const targetMembers = memberDirectoryConfirmDetails.memberIds
      .map((memberId) => membersById[memberId])
      .filter((member) => member?.isActive);
    if (targetMembers.length === 0) {
      setMemberDirectoryConfirmAction(null);
      return;
    }

    try {
      const updatedMembers = await Promise.all(
        targetMembers.map(async (member) => {
          const savedMemberRow = await updateMember(member.id, {
            group_id: member.groupId,
            is_active: false,
            member_type: member.memberType,
            name: member.name,
          });

          const nextMember = hasSupabaseEnv
            ? buildAppMemberFromRow(savedMemberRow, appBootstrap.groups)
            : buildFallbackUpdatedMember(member, appBootstrap.groups, {
                isActive: false,
                updatedAt: savedMemberRow.updated_at,
              });

          return [member.id, nextMember];
        }),
      );
      const updatedMembersById = Object.fromEntries(updatedMembers);

      const syncedMembers = await syncMembersAfterWrite(() =>
        members.map((member) => updatedMembersById[member.id] || member),
      );
      const firstLabel =
        resolveMemberDisplayNames(syncedMembers).find((member) => member.id === targetMembers[0]?.id)?.displayName ||
        targetMembers[0]?.displayName ||
        targetMembers[0]?.name ||
        '선택한 청년';

      appendMemberHistoryEntries(
        updatedMembers.map(([memberId, nextMember]) =>
          buildMemberHistoryEntry({
            actionLabel: '재적 제외',
            changedAt: nextMember.updatedAt || new Date().toISOString(),
            changedBy: auth.auditActorName,
            content: '재적에서 제외',
            kind: 'status',
            memberId,
            nextIsActive: false,
          }),
        ),
      );

      clearConfirmTargetForMembers(memberDirectoryConfirmDetails.memberIds);
      setMemberDirectorySelectedRowIds((prev) =>
        prev.filter((rowId) => !memberDirectoryConfirmDetails.memberIds.includes(rowId)),
      );
      setMemberDirectoryConfirmAction(null);
      setToast(
        targetMembers.length === 1
          ? `${firstLabel} 청년을 재적에서 제외했어요`
          : `${targetMembers.length}명의 청년을 재적에서 제외했어요`,
      );
    } catch (error) {
      console.error('[memberDirectory] bulk deactivate failed', error);
      setToast('재적 제외 처리 중 오류가 발생했어요');
    }
  };

  const handleMemberDirectoryBulkGroupApply = async () => {
    if (!ensurePermission(PERMISSIONS.memberGroupEdit, '소속 숲을 변경할 권한이 없어요')) return;
    if (!memberDirectoryBulkGroupId || memberDirectorySelectedRowIds.length === 0) return;

    const targetGroup = appBootstrap.groups.find((group) => group.id === memberDirectoryBulkGroupId);
    if (!targetGroup) {
      setToast('소속 숲 정보를 찾지 못했어요');
      return;
    }

    const targetMembers = memberDirectorySelectedRowIds
      .map((memberId) => membersById[memberId])
      .filter((member) => member?.isActive);
    if (targetMembers.length === 0) return;

    try {
      const updatedMembers = await Promise.all(
        targetMembers.map(async (member) => {
          const nextMemberType =
            targetGroup.groupType === 'newcomer'
              ? member.memberType === 'visitor'
                ? 'visitor'
                : 'registered'
              : 'registered';
          const savedMemberRow = await updateMember(member.id, {
            group_id: targetGroup.id,
            is_active: true,
            member_type: nextMemberType,
            name: member.name,
          });
          const nextMember = hasSupabaseEnv
            ? buildAppMemberFromRow(savedMemberRow, appBootstrap.groups)
            : buildFallbackUpdatedMember(member, appBootstrap.groups, {
                groupId: targetGroup.id,
                memberType: nextMemberType,
                updatedAt: savedMemberRow.updated_at,
              });

          return [member.id, nextMember];
        }),
      );
      const updatedMembersById = Object.fromEntries(updatedMembers);

      appendMemberHistoryEntries(
        updatedMembers.map(([memberId, nextMember]) => {
          const previousMember = targetMembers.find((member) => member.id === memberId);
          const previousGroupName = previousMember?.groupName || '-';
          const nextGroupName = nextMember.groupName || targetGroup.name;
          const previousTypeLabel = previousMember ? getMemberDirectoryTypeLabel(previousMember, appBootstrap.groups) : '-';
          const nextTypeLabel = getMemberDirectoryTypeLabel(nextMember, appBootstrap.groups);
          const segments = [`숲 ${previousGroupName} → ${nextGroupName}`];

          if (previousTypeLabel !== nextTypeLabel) {
            segments.push(`유형 ${previousTypeLabel} → ${nextTypeLabel}`);
          }

          return buildMemberHistoryEntry({
            actionLabel: '소속 숲 변경',
            changedAt: nextMember.updatedAt || new Date().toISOString(),
            changedBy: auth.auditActorName,
            content: segments.join(' / '),
            memberId,
          });
        }),
      );

      await syncMembersAfterWrite(() => members.map((member) => updatedMembersById[member.id] || member));
      setMemberDirectorySelectedRowIds([]);
      setMemberDirectoryBulkGroupId('');
      setMemberDirectoryBulkGroupModalOpen(false);
      setToast(
        targetMembers.length === 1
          ? `${targetMembers[0].displayName || targetMembers[0].name} 청년의 소속 숲을 변경했어요`
          : `${targetMembers.length}명의 소속 숲을 변경했어요`,
      );
    } catch (error) {
      console.error('[memberDirectory] bulk group update failed', error);
      setToast('소속 숲 변경 중 오류가 발생했어요');
    }
  };

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

  const handleOpenMemberDirectoryHistory = (memberId) => {
    if (!ensurePermission(PERMISSIONS.auditView, '변경 이력을 볼 권한이 없어요')) return;
    setMemberDirectoryHistoryMemberId(memberId);
  };

  const resetSectionState = () => {
    setMemberDirectoryConfirmAction(null);
    setMemberDirectorySelectedRowIds([]);
    setMemberDirectoryBulkGroupId('');
    setMemberDirectoryBulkGroupModalOpen(false);
    setMemberDirectoryHistoryMemberId(null);
    closeEditMemberModal();
    closeAddMemberModal();
  };

  return {
    actions: {
      closeAddMemberModal,
      openAddMemberModal: () => {
        if (!ensurePermission(PERMISSIONS.memberCreate, '청년을 추가할 권한이 없어요')) return;
        setShowAddMemberModal(true);
      },
      resetSectionState,
    },
    addMemberProps: {
      canOpen: auth.can(PERMISSIONS.memberCreate),
      canSave: Boolean(addMemberDraft.name.trim() && addMemberDraft.groupId),
      draft: addMemberDraft,
      groupOptions: appBootstrap.addMemberGroupOptions,
      helperText: addMemberNameGuide,
      previewDisplayName: addMemberNamePreview?.expectedDisplayName || null,
      isNewcomerGroupSelected: isNewcomerGroupId(appBootstrap.groups, addMemberDraft.groupId),
      isOpen: showAddMemberModal,
      onClose: closeAddMemberModal,
      onDraftChange: handleAddMemberDraftChange,
      onOpen: () => {
        if (!ensurePermission(PERMISSIONS.memberCreate, '청년을 추가할 권한이 없어요')) return;
        setShowAddMemberModal(true);
      },
      onSave: handleAddMemberSave,
    },
    memberDirectoryProps: {
      bulkAction: {
        allRowsSelected: memberDirectoryAllRowsSelected,
        canOpenGroupChange: memberDirectorySelectedCount > 0,
        groupOptions: memberDirectoryGroupOptions,
        modal: {
          groupOptions: memberDirectoryGroupOptions,
          isOpen: memberDirectoryBulkGroupModalOpen,
          onCancel: () => {
            setMemberDirectoryBulkGroupModalOpen(false);
            setMemberDirectoryBulkGroupId('');
          },
          onConfirm: handleMemberDirectoryBulkGroupApply,
          onGroupChange: setMemberDirectoryBulkGroupId,
          selectedCount: memberDirectorySelectedCount,
          selectedGroupId: memberDirectoryBulkGroupId,
        },
        onApplyGroupChange: handleMemberDirectoryBulkGroupApply,
        onBulkGroupChange: setMemberDirectoryBulkGroupId,
        onOpenGroupChange: () => {
          if (!ensurePermission(PERMISSIONS.memberGroupEdit, '소속 숲을 변경할 권한이 없어요')) return;
          if (memberDirectorySelectedRowIds.length === 0) return;
          setMemberDirectoryBulkGroupModalOpen(true);
        },
        onRequestDeactivateSelected: handleRequestMemberDirectoryBulkDeactivate,
        onRowSelectToggle: handleMemberDirectoryRowSelectToggle,
        onSelectAllRows: handleMemberDirectorySelectAllRows,
        partiallySelected: memberDirectoryPartiallySelected,
        selectedCount: memberDirectorySelectedCount,
        selectedGroupId: memberDirectoryBulkGroupId,
        selectedRowIds: memberDirectorySelectedRowIds,
      },
      confirmation: {
        confirmLabel: memberDirectoryConfirmDetails?.confirmLabel || '재적에서 제외',
        description: memberDirectoryConfirmDetails?.description || '',
        isOpen: Boolean(memberDirectoryConfirmDetails),
        onCancel: () => setMemberDirectoryConfirmAction(null),
        onConfirm: handleConfirmMemberDirectoryDeactivate,
        title: memberDirectoryConfirmDetails?.title || '',
      },
      editMember: {
        canSave: Boolean(editMemberDraft.name.trim() && editMemberDraft.groupId),
        draft: editMemberDraft,
        groupOptions: appBootstrap.addMemberGroupOptions,
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
      history: {
        isOpen: Boolean(memberDirectoryHistoryMemberId),
        memberLabel: memberDirectoryHistoryMember?.displayName || memberDirectoryHistoryMember?.name || '',
        onClose: () => setMemberDirectoryHistoryMemberId(null),
        onOpen: handleOpenMemberDirectoryHistory,
        rows: memberDirectoryHistoryRows,
      },
      permissions: {
        canChangeGroup: auth.can(PERMISSIONS.memberGroupEdit),
        canEdit: auth.can(PERMISSIONS.memberEdit),
        canToggleStatus: auth.can(PERMISSIONS.memberStatusEdit),
        canViewAudit: auth.can(PERMISSIONS.auditView),
      },
      onToggleActive: handleToggleMemberActive,
      rows: memberDirectoryRows,
      summary: memberDirectorySummary,
    },
  };
}
