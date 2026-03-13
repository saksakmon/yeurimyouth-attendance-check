import * as React from 'react';
import { resolveMemberDisplayNames } from '../utils/memberDisplay.js';
import { isMemberActiveAtMoment } from '../domain/members/memberHistory.js';

const { useMemo } = React;

export function useResolvedMemberState({ memberChangeHistory, members }) {
  const resolvedMembers = useMemo(() => resolveMemberDisplayNames(members), [members]);
  const membersById = useMemo(
    () => Object.fromEntries(resolvedMembers.map((member) => [member.id, member])),
    [resolvedMembers],
  );
  const persistedActiveMembers = useMemo(() => resolvedMembers.filter((member) => member.isActive), [resolvedMembers]);
  const currentActiveMembers = useMemo(
    () => resolvedMembers.filter((member) => isMemberActiveAtMoment(member, new Date(), memberChangeHistory)),
    [memberChangeHistory, resolvedMembers],
  );

  return {
    currentActiveMembers,
    membersById,
    persistedActiveMembers,
    resolvedMembers,
  };
}
