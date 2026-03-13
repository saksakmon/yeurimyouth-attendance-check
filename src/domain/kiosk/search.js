const CHOSUNG_QUERY_PATTERN = /^[ㄱ-ㅎ]+$/;
const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export function getChosung(text) {
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

export function filterMembers(members, query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];

  return members.filter((member) => {
    const haystack = `${member.name}${member.displayName || ''}${member.groupName || ''}${getChosung(member.name)}`;
    return haystack.includes(trimmed);
  });
}

export function getResultState(query, filteredMembers) {
  if (!String(query || '').trim()) return 'idle';
  if (filteredMembers.length === 0) return 'empty';
  return 'results';
}

export function getNameHighlightRange(member, query) {
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
