const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function getRegistrationTimestamp(member) {
  const parsed = Date.parse(String(member?.createdAt || ''));
  return Number.isNaN(parsed) ? null : parsed;
}

function compareMembersByRegistration(a, b) {
  const aTimestamp = getRegistrationTimestamp(a);
  const bTimestamp = getRegistrationTimestamp(b);

  if (aTimestamp !== null && bTimestamp !== null && aTimestamp !== bTimestamp) {
    return aTimestamp - bTimestamp;
  }

  if (aTimestamp !== null && bTimestamp === null) return -1;
  if (aTimestamp === null && bTimestamp !== null) return 1;

  const createdAtCompare = String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''));
  if (createdAtCompare !== 0) return createdAtCompare;

  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

export function getAlphabetSuffix(index) {
  let current = index;
  let suffix = '';

  while (current >= 0) {
    suffix = `${ALPHABET[current % ALPHABET.length]}${suffix}`;
    current = Math.floor(current / ALPHABET.length) - 1;
  }

  return suffix;
}

export function resolveMemberDisplayNames(members) {
  const groupedMembers = new Map();

  members.forEach((member) => {
    const name = String(member?.name || '');
    const group = groupedMembers.get(name) || [];
    group.push(member);
    groupedMembers.set(name, group);
  });

  const suffixById = new Map();

  groupedMembers.forEach((group) => {
    if (group.length < 2) return;

    [...group]
      .sort(compareMembersByRegistration)
      .forEach((member, index) => {
        suffixById.set(member.id, getAlphabetSuffix(index));
      });
  });

  return members.map((member) => {
    const nameSuffix = suffixById.get(member.id) || null;

    return {
      ...member,
      displayName: nameSuffix ? `${member.name}${nameSuffix}` : member.name,
      nameSuffix,
    };
  });
}

export function getNextMemberDisplayNamePreview(members, rawName) {
  const trimmedName = String(rawName || '').trim();
  if (!trimmedName) return null;

  const sameNameMembers = members.filter((member) => member.name === trimmedName);
  if (sameNameMembers.length === 0) return null;

  const expectedSuffix = getAlphabetSuffix(sameNameMembers.length);

  return {
    existingCount: sameNameMembers.length,
    expectedDisplayName: `${trimmedName}${expectedSuffix}`,
    expectedSuffix,
  };
}
