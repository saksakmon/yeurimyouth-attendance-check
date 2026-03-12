const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function normalizeDate(date) {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateWithWeekday(date) {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}(${KOREAN_WEEKDAYS[date.getDay()]})`;
}

function formatMonthDayWeek(date, weekNumber) {
  return `${date.getMonth() + 1}/${date.getDate()}(${weekNumber}주차)`;
}

function getTargetSunday(baseDate) {
  const sunday = normalizeDate(baseDate);
  const diff = sunday.getDay() === 0 ? 0 : 7 - sunday.getDay();
  sunday.setDate(sunday.getDate() + diff);
  return sunday;
}

function getIsoWeekInfo(date) {
  const target = normalizeDate(date);
  const weekday = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - weekday + 3);

  const isoYear = target.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4, 12);
  const firstWeekday = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstWeekday + 3);

  const weekNumber = 1 + Math.round((target - firstThursday) / 604800000);
  return { isoYear, weekNumber };
}

function buildAttendanceMeta(today, serviceSunday) {
  const { isoYear, weekNumber } = getIsoWeekInfo(serviceSunday);

  return {
    todayDate: formatDateISO(today),
    todayLabel: formatDateWithWeekday(today),
    serviceDate: formatDateISO(serviceSunday),
    serviceDateLabel: formatDateWithWeekday(serviceSunday),
    weekNumber,
    weekLabel: `${weekNumber}주차`,
    weekKey: `${isoYear}-W${pad(weekNumber)}`,
    attendanceLabel: `${formatDateWithWeekday(serviceSunday)} · ${weekNumber}주차`,
    adminLabel: formatMonthDayWeek(serviceSunday, weekNumber),
  };
}

export function getAttendanceMetaForDate(baseDate = new Date()) {
  const today = normalizeDate(baseDate);
  const serviceSunday = getTargetSunday(today);
  return buildAttendanceMeta(today, serviceSunday);
}

export function getAttendanceMetaByWeekOffset(weekOffset = 0, baseDate = new Date()) {
  const today = normalizeDate(baseDate);
  const serviceSunday = getTargetSunday(today);
  serviceSunday.setDate(serviceSunday.getDate() + weekOffset * 7);
  return buildAttendanceMeta(today, serviceSunday);
}

export function getCurrentAttendanceMeta(baseDate = new Date()) {
  return getAttendanceMetaForDate(baseDate);
}
