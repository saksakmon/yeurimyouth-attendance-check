import * as React from 'react';

const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React;

const ATTENDANCE_OPTIONS = [
  { value: 'absent', label: '결석' },
  { value: 'youth', label: '청년부(4부)' },
  { value: 'adult', label: '장년부(1~3부)' },
];
const MEMBER_TYPE_OPTIONS = [
  { value: 'visitor', label: '새가족(방문)' },
  { value: 'registered', label: '새가족(등록)' },
];

function usePresence(isOpen, duration = 180) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frameId = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(frameId);
    }

    setIsVisible(false);
    const timeoutId = setTimeout(() => setShouldRender(false), duration);
    return () => clearTimeout(timeoutId);
  }, [duration, isOpen]);

  return { isVisible, shouldRender };
}

function useToastPresence(message, duration = 180) {
  const [renderedMessage, setRenderedMessage] = useState(message);
  const presence = usePresence(Boolean(message), duration);

  useEffect(() => {
    if (message) setRenderedMessage(message);
  }, [message]);

  return { ...presence, renderedMessage };
}

function SidebarItem({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`admin-lnb-item ${active ? 'admin-lnb-item-active' : ''}`}
    >
      <span className="admin-lnb-item-indicator" />
      <span>{children}</span>
    </button>
  );
}

function AdminButton({
  children,
  className,
  danger = false,
  icon = false,
  inline = false,
  large = false,
  variant = 'secondary',
  ...props
}) {
  const classes = [
    'admin-button',
    `admin-button-${variant}`,
    danger ? 'admin-button-danger' : '',
    inline ? 'admin-button-inline' : '',
    large ? 'admin-button-lg' : '',
    icon ? 'admin-button-icon' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  );
}

function FilterChip({ children }) {
  return <span className="admin-chip">{children}</span>;
}

function FilterSummaryText({ children }) {
  return <span className="truncate text-[14px] font-medium text-black/78">{children}</span>;
}

function formatDateTextInput(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

const CALENDAR_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function parseDateTextValue(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 8);

  if (digits.length !== 8) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatDateTextValueFromDate(date) {
  return formatDateTextInput(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`,
  );
}

function getCalendarMonthBase(value) {
  const parsed = parseDateTextValue(value);
  const base = parsed || new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

function getCalendarMonthLabel(date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isSameCalendarDate(a, b) {
  if (!a || !b) return false;

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarDays(viewDate) {
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return {
      date,
      isCurrentMonth: date.getMonth() === viewDate.getMonth(),
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
    };
  });
}

function OptionCheckIcon({ visible }) {
  return <span className={`admin-option-check ${visible ? 'admin-option-check-visible' : ''}`}>✓</span>;
}

function IndeterminateCheckbox({ checked, disabled = false, indeterminate, onChange }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return <input ref={inputRef} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="admin-checkbox" />;
}

function MultiSelectField({
  chips,
  className,
  label,
  onOptionToggle,
  onToggleOpen,
  open,
  options,
  panelClassName,
  placeholder,
  selectedValues,
  triggerClassName,
  wrapperRef,
}) {
  return (
    <div ref={wrapperRef} className={`relative ${className || ''}`}>
      {label ? <div className="admin-field-label">{label}</div> : null}
      <button
        type="button"
        onClick={onToggleOpen}
        className={`admin-control admin-control-button ${triggerClassName || ''} ${open ? 'admin-control-open' : ''}`}
      >
        <div className="admin-control-value">
          <div className="admin-chip-scroll">
            {chips.length > 0 ? chips : <span className="admin-control-placeholder">{placeholder}</span>}
          </div>
        </div>
        <span className={`admin-caret ${open ? 'admin-caret-open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className={`admin-dropdown-panel ${panelClassName || ''}`}>
          {options.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onOptionToggle(option.value)}
                className={`admin-dropdown-option ${checked ? 'admin-dropdown-option-selected' : ''}`}
              >
                <span>{option.label}</span>
                <OptionCheckIcon visible={checked} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SingleSelectField({
  className,
  label,
  onOptionSelect,
  onToggleOpen,
  open,
  options,
  panelClassName,
  panelStyle,
  placeholder,
  selectedLabel,
  selectedValue,
  triggerClassName,
  wrapperRef,
}) {
  const resolvedLabel = selectedLabel || placeholder || '';
  const isPlaceholder = !selectedValue && Boolean(placeholder);

  return (
    <div ref={wrapperRef} className={`relative ${className || ''}`}>
      {label ? <div className="admin-field-label">{label}</div> : null}
      <button
        type="button"
        onClick={onToggleOpen}
        className={`admin-control admin-control-button ${triggerClassName || ''} ${open ? 'admin-control-open' : ''}`}
      >
        <div className="admin-control-value">
          <span className={`truncate ${isPlaceholder ? 'admin-control-placeholder' : ''}`}>{resolvedLabel}</span>
        </div>
        <span className={`admin-caret ${open ? 'admin-caret-open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className={`admin-dropdown-panel ${panelClassName || ''}`} style={panelStyle}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onOptionSelect(option.value)}
              className={`admin-dropdown-option ${selectedValue === option.value ? 'admin-dropdown-option-selected' : ''}`}
            >
              <span>{option.label}</span>
              <OptionCheckIcon visible={selectedValue === option.value} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DatePickerField({ label, onChange, onClose, onOpen, open, placeholder, value, wrapperRef }) {
  const [viewDate, setViewDate] = useState(() => getCalendarMonthBase(value));
  const selectedDate = useMemo(() => parseDateTextValue(value), [value]);
  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (open) {
      setViewDate(getCalendarMonthBase(value));
    }
  }, [open, value]);

  return (
    <div ref={wrapperRef} className="relative">
      {label ? <div className="admin-field-label">{label}</div> : null}

      <div className={`admin-control admin-date-field ${open ? 'admin-control-open' : ''}`}>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(formatDateTextInput(event.target.value))}
          onClick={onOpen}
          onFocus={onOpen}
          className="admin-input admin-date-input w-full"
          placeholder={placeholder}
        />
        <button type="button" className="admin-date-trigger" onClick={onOpen} aria-label={`${placeholder} 달력 열기`}>
          <span className="admin-date-trigger-icon" />
        </button>
      </div>

      {open && (
        <div className="admin-dropdown-panel admin-calendar-panel">
          <div className="admin-calendar-header">
            <button
              type="button"
              className="admin-calendar-nav"
              onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              aria-label="이전 달"
            >
              ‹
            </button>
            <div className="admin-calendar-month">{getCalendarMonthLabel(viewDate)}</div>
            <button
              type="button"
              className="admin-calendar-nav"
              onClick={() => setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              aria-label="다음 달"
            >
              ›
            </button>
          </div>

          <div className="admin-calendar-weekdays">
            {CALENDAR_WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="admin-calendar-grid">
            {calendarDays.map((day) => (
              <button
                key={day.key}
                type="button"
                className={`admin-calendar-day ${day.isCurrentMonth ? '' : 'admin-calendar-day-muted'} ${
                  isSameCalendarDate(day.date, selectedDate) ? 'admin-calendar-day-selected' : ''
                } ${isSameCalendarDate(day.date, today) ? 'admin-calendar-day-today' : ''}`}
                onClick={() => {
                  onChange(formatDateTextValueFromDate(day.date));
                  onClose();
                }}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>

          <div className="admin-calendar-footer">
            <button
              type="button"
              className="admin-calendar-footer-button"
              onClick={() => {
                onChange('');
                onClose();
              }}
            >
              지우기
            </button>
            <button
              type="button"
              className="admin-calendar-footer-button admin-calendar-footer-button-strong"
              onClick={() => {
                onChange(formatDateTextValueFromDate(new Date()));
                onClose();
              }}
            >
              오늘
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableSelectField({ onOptionSelect, onToggleOpen, open, options, selectedValue, wrapperRef }) {
  const rootRef = useRef(null);
  const [panelStyle, setPanelStyle] = useState(null);
  const [panelPlacement, setPanelPlacement] = useState('down');
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label || '결석';

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setPanelStyle(null);
      return undefined;
    }

    const estimatedPanelHeight = Math.min(options.length * 44 + 12, 220);

    const updatePanelPosition = () => {
      if (!rootRef.current) return;

      const rect = rootRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const shouldOpenUp = spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow;
      const nextPlacement = shouldOpenUp ? 'up' : 'down';
      const top = shouldOpenUp
        ? Math.max(8, rect.top - estimatedPanelHeight - 8)
        : Math.min(window.innerHeight - estimatedPanelHeight - 8, rect.bottom + 8);

      setPanelPlacement(nextPlacement);
      setPanelStyle({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        minWidth: rect.width,
        top,
        width: rect.width,
      });
    };

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, options.length]);

  const handleRef = (node) => {
    rootRef.current = node;
    if (wrapperRef) wrapperRef(node);
  };

  return (
    <SingleSelectField
      className="min-w-[136px]"
      onOptionSelect={onOptionSelect}
      onToggleOpen={onToggleOpen}
      open={open}
      options={options}
      panelClassName={`admin-dropdown-panel-floating ${panelPlacement === 'up' ? 'admin-dropdown-panel-upward' : 'admin-dropdown-panel-downward'}`}
      panelStyle={panelStyle}
      selectedLabel={selectedLabel}
      selectedValue={selectedValue}
      triggerClassName="admin-table-select-trigger"
      wrapperRef={handleRef}
    />
  );
}

function AttendanceTypeLabel({ type }) {
  return ATTENDANCE_OPTIONS.find((item) => item.value === type)?.label || '결석';
}

const MEMBER_DIRECTORY_FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '재적' },
  { value: 'inactive', label: '재적 제외' },
];
const MEMBER_DIRECTORY_GROUP_ALL_VALUE = 'ALL';
const MEMBER_DIRECTORY_TYPE_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'regular', label: '등반' },
  { value: 'newcomerRegistered', label: '새가족(등록)' },
  { value: 'newcomerVisitor', label: '새가족(방문)' },
];

function MemberStatusPill({ active }) {
  return <span className={`admin-status-pill ${active ? 'admin-status-pill-active' : 'admin-status-pill-inactive'}`}>{active ? '재적' : '재적 제외'}</span>;
}

function MemberDirectorySection({ accentColor, bindFieldRef, memberDirectory, openField, setOpenField }) {
  const selectedStatusLabel =
    MEMBER_DIRECTORY_FILTER_OPTIONS.find((option) => option.value === memberDirectory.filters.draft.status)?.label || '전체';
  const selectedTypeLabel =
    MEMBER_DIRECTORY_TYPE_OPTIONS.find((option) => option.value === memberDirectory.filters.draft.type)?.label || '전체';
  const selectedGroupIds = memberDirectory.filters.draft.groupIds || [];
  const isAllGroupsSelected =
    selectedGroupIds.length === 0 || selectedGroupIds.length === memberDirectory.filters.groupOptions.length;
  const selectedGroupValues = isAllGroupsSelected
    ? [MEMBER_DIRECTORY_GROUP_ALL_VALUE, ...selectedGroupIds]
    : selectedGroupIds;
  const selectedGroupSummary =
    selectedGroupIds.length === 0
      ? '소속 숲 · 전체'
      : selectedGroupIds.length === memberDirectory.filters.groupOptions.length
        ? '소속 숲 · 전체'
        : selectedGroupIds.length === 1
          ? `소속 숲 · ${
              memberDirectory.filters.groupOptions.find((option) => option.value === selectedGroupIds[0])?.label || selectedGroupIds[0]
            }`
          : `소속 숲 · ${selectedGroupIds.length}개 선택`;
  const memberDirectoryGroupFilterOptions = [
    { value: MEMBER_DIRECTORY_GROUP_ALL_VALUE, label: '전체' },
    ...memberDirectory.filters.groupOptions,
  ];
  const selectedBulkGroupLabel =
    memberDirectory.bulkAction.groupOptions.find((option) => option.value === memberDirectory.bulkAction.selectedGroupId)?.label || '';

  return (
    <div className="min-h-0 flex-1 overflow-auto px-5 py-5 lg:px-8 lg:py-6">
      <section className="admin-info-banner" style={{ '--tw-ring-color': 'rgba(22, 119, 255, 0.08)' }}>
        <span className="admin-info-banner-icon" aria-hidden="true">
          i
        </span>
        <p className="admin-info-banner-text">
          재적에서 제외한 청년은 출결관리 표와 키오스크 검색 결과에서 제외되고, 인원관리에서 다시 복구할 수 있어요.
        </p>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="admin-surface admin-card-hover p-4 lg:p-5">
          <div className="admin-overline">전체 회원</div>
          <div className="mt-4 text-[32px] font-semibold leading-none">{memberDirectory.summary.totalCount}명</div>
          <div className="mt-1.5 text-sm text-black/45">활성 + 비활성 포함</div>
        </div>

        <div className="admin-surface admin-card-hover p-4 lg:p-5">
          <div className="admin-overline">재적 인원</div>
          <div className="mt-4 text-[32px] font-semibold leading-none" style={{ color: accentColor }}>
            {memberDirectory.summary.activeCount}명
          </div>
          <div className="mt-1.5 text-sm text-black/45">출결관리와 키오스크 노출 대상</div>
        </div>

        <div className="admin-surface admin-card-hover p-4 lg:p-5">
          <div className="admin-overline">재적 제외 인원</div>
          <div className="mt-4 text-[32px] font-semibold leading-none">{memberDirectory.summary.inactiveCount}명</div>
          <div className="mt-1.5 text-sm text-black/45">이력은 유지되고 출결관리에서는 제외돼요</div>
        </div>
      </section>

      <section className="admin-surface mt-4 p-4 lg:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <div className="admin-field-label">상태</div>
            <SingleSelectField
              className="mt-2"
              onOptionSelect={(value) => {
                memberDirectory.filters.onDraftChange('status', value);
                setOpenField(null);
              }}
              onToggleOpen={() => setOpenField(openField === 'member-directory-status' ? null : 'member-directory-status')}
              open={openField === 'member-directory-status'}
              options={MEMBER_DIRECTORY_FILTER_OPTIONS}
              placeholder="전체"
              selectedLabel={selectedStatusLabel}
              selectedValue={memberDirectory.filters.draft.status}
              wrapperRef={bindFieldRef('member-directory-status')}
            />
          </div>

          <div>
            <div className="admin-field-label">등록일</div>
            <div className="admin-date-range mt-2">
              <DatePickerField
                label=""
                onChange={(value) => memberDirectory.filters.onDraftChange('registeredFrom', value)}
                onClose={() => setOpenField(null)}
                onOpen={() => setOpenField('member-directory-date-from')}
                open={openField === 'member-directory-date-from'}
                placeholder="시작일"
                value={memberDirectory.filters.draft.registeredFrom}
                wrapperRef={bindFieldRef('member-directory-date-from')}
              />
              <DatePickerField
                label=""
                onChange={(value) => memberDirectory.filters.onDraftChange('registeredTo', value)}
                onClose={() => setOpenField(null)}
                onOpen={() => setOpenField('member-directory-date-to')}
                open={openField === 'member-directory-date-to'}
                placeholder="종료일"
                value={memberDirectory.filters.draft.registeredTo}
                wrapperRef={bindFieldRef('member-directory-date-to')}
              />
            </div>
          </div>

          <div>
            <div className="admin-field-label">소속 숲</div>
            <MultiSelectField
              className="mt-2"
              chips={[<FilterSummaryText key="member-directory-group-summary">{selectedGroupSummary}</FilterSummaryText>]}
              label=""
              onOptionToggle={memberDirectory.filters.onDraftGroupToggle}
              onToggleOpen={() => setOpenField(openField === 'member-directory-group' ? null : 'member-directory-group')}
              open={openField === 'member-directory-group'}
              options={memberDirectoryGroupFilterOptions}
              placeholder="전체"
              selectedValues={selectedGroupValues}
              wrapperRef={bindFieldRef('member-directory-group')}
            />
          </div>

          <div>
            <div className="admin-field-label">유형</div>
            <SingleSelectField
              className="mt-2"
              onOptionSelect={(value) => {
                memberDirectory.filters.onDraftChange('type', value);
                setOpenField(null);
              }}
              onToggleOpen={() => setOpenField(openField === 'member-directory-type' ? null : 'member-directory-type')}
              open={openField === 'member-directory-type'}
              options={MEMBER_DIRECTORY_TYPE_OPTIONS}
              placeholder="전체"
              selectedLabel={selectedTypeLabel}
              selectedValue={memberDirectory.filters.draft.type}
              wrapperRef={bindFieldRef('member-directory-type')}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="admin-button admin-button-primary min-w-[84px] disabled:cursor-not-allowed"
            style={memberDirectory.filters.isDirty ? { backgroundColor: accentColor } : undefined}
            disabled={!memberDirectory.filters.isDirty}
            onClick={memberDirectory.filters.onApply}
          >
            검색
          </button>
          <button
            type="button"
            className="admin-button admin-button-secondary min-w-[84px]"
            onClick={memberDirectory.filters.onReset}
          >
            초기화
          </button>
        </div>
      </section>

      <section className="admin-surface mt-4 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-black/6 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-black/65">
              {memberDirectory.bulkAction.selectedCount > 0
                ? `${memberDirectory.bulkAction.selectedCount}명 선택됨`
                : `총 ${memberDirectory.rows.length}명`}
            </div>

            {memberDirectory.bulkAction.selectedCount > 0 && (
              <>
                <SingleSelectField
                  className="min-w-[180px]"
                  onOptionSelect={(value) => {
                    memberDirectory.bulkAction.onBulkGroupChange(value);
                    setOpenField(null);
                  }}
                  onToggleOpen={() =>
                    setOpenField(openField === 'member-directory-bulk-group' ? null : 'member-directory-bulk-group')
                  }
                  open={openField === 'member-directory-bulk-group'}
                  options={memberDirectory.bulkAction.groupOptions}
                  placeholder="숲 변경"
                  selectedLabel={selectedBulkGroupLabel}
                  selectedValue={memberDirectory.bulkAction.selectedGroupId}
                  wrapperRef={bindFieldRef('member-directory-bulk-group')}
                />

                <AdminButton
                  variant="secondary"
                  disabled={!memberDirectory.bulkAction.canApplyGroupChange}
                  onClick={memberDirectory.bulkAction.onApplyGroupChange}
                >
                  숲 변경
                </AdminButton>

                <AdminButton
                  variant="secondary"
                  danger
                  onClick={memberDirectory.bulkAction.onRequestDeactivateSelected}
                >
                  재적에서 제외
                </AdminButton>
              </>
            )}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead className="bg-black/[0.024] text-left">
              <tr>
                <th className="px-4 py-3">
                  <IndeterminateCheckbox
                    checked={memberDirectory.bulkAction.allRowsSelected}
                    disabled={memberDirectory.rows.filter((row) => row.isActive).length === 0}
                    indeterminate={memberDirectory.bulkAction.partiallySelected}
                    onChange={memberDirectory.bulkAction.onSelectAllRows}
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-black/45">표시 이름</th>
                <th className="px-4 py-3 font-semibold text-black/45">이름</th>
                <th className="px-4 py-3 font-semibold text-black/45">유형</th>
                <th className="px-4 py-3 font-semibold text-black/45">소속 숲</th>
                <th className="px-4 py-3 font-semibold text-black/45">상태</th>
                <th className="px-4 py-3 font-semibold text-black/45">등록일</th>
                <th className="px-4 py-3 font-semibold text-black/45">관리</th>
              </tr>
            </thead>
            <tbody>
              {memberDirectory.rows.length > 0 ? (
                memberDirectory.rows.map((row) => (
                  <tr key={row.id} className="admin-table-row">
                    <td className="px-4 py-3">
                      <IndeterminateCheckbox
                        checked={memberDirectory.bulkAction.selectedRowIds.includes(row.id)}
                        disabled={!row.isActive}
                        indeterminate={false}
                        onChange={() => memberDirectory.bulkAction.onRowSelectToggle(row.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold text-black/82">{row.displayName}</td>
                    <td className="px-4 py-3 text-black/58">{row.rawName}</td>
                    <td className="px-4 py-3 text-black/58">{row.memberTypeLabel}</td>
                    <td className="px-4 py-3 text-black/58">{row.groupName}</td>
                    <td className="px-4 py-3">
                      <MemberStatusPill active={row.isActive} />
                    </td>
                    <td className="px-4 py-3 text-black/58">{row.createdAtLabel}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <AdminButton variant="secondary" inline onClick={() => memberDirectory.editMember.onOpen(row.id)}>
                          수정
                        </AdminButton>
                        <AdminButton
                          variant={row.isActive ? 'secondary' : 'tertiary'}
                          danger={row.isActive}
                          inline
                          onClick={() => memberDirectory.onToggleActive(row.id)}
                        >
                          {row.isActive ? '재적에서 제외' : '복구'}
                        </AdminButton>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="admin-empty-state">
                    조건에 맞는 청년이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EditMemberModal({ accentColor, bindFieldRef, editMember, isVisible, openField, setOpenField }) {
  const selectedGroupLabel =
    editMember.groupOptions.find((option) => option.value === editMember.draft.groupId)?.label || '';
  const selectedMemberTypeLabel =
    MEMBER_TYPE_OPTIONS.find((option) => option.value === editMember.draft.memberType)?.label || '';

  return (
    <div className={`admin-overlay ${isVisible ? 'admin-overlay-visible' : ''}`}>
      <div className={`admin-modal-panel ${isVisible ? 'admin-modal-panel-visible' : ''}`}>
        <div className="text-[24px] font-semibold tracking-tight text-black">회원 정보 수정</div>
        <div className="mt-2 text-sm text-black/45">이름, 유형, 소속 숲을 수정할 수 있어요.</div>

        {editMember.memberLabel ? (
          <div className="mt-4 rounded-[12px] bg-black/[0.03] px-4 py-3 text-sm text-black/55">
            현재 표시 이름 {editMember.memberLabel}
          </div>
        ) : null}

        <div className="mt-7 space-y-4">
          <div>
            <label className="admin-field-label">이름</label>
            <input
              value={editMember.draft.name}
              onChange={(event) => editMember.onDraftChange('name', event.target.value)}
              className="admin-control admin-input mt-2 w-full"
              placeholder="이름 입력"
            />
          </div>

          <div>
            <label className="admin-field-label">숲 선택</label>
            <SingleSelectField
              className="mt-2"
              onOptionSelect={(value) => {
                editMember.onDraftChange('groupId', value);
                setOpenField(null);
              }}
              onToggleOpen={() => setOpenField(openField === 'edit-member-group' ? null : 'edit-member-group')}
              open={openField === 'edit-member-group'}
              options={editMember.groupOptions}
              placeholder="선택해 주세요"
              selectedLabel={selectedGroupLabel}
              selectedValue={editMember.draft.groupId}
              wrapperRef={bindFieldRef('edit-member-group')}
            />
          </div>

          {editMember.isNewcomerGroupSelected && (
            <div>
              <label className="admin-field-label">유형</label>
              <SingleSelectField
                className="mt-2"
                onOptionSelect={(value) => {
                  editMember.onDraftChange('memberType', value);
                  setOpenField(null);
                }}
                onToggleOpen={() => setOpenField(openField === 'edit-member-type' ? null : 'edit-member-type')}
                open={openField === 'edit-member-type'}
                options={MEMBER_TYPE_OPTIONS}
                selectedLabel={selectedMemberTypeLabel}
                selectedValue={editMember.draft.memberType}
                wrapperRef={bindFieldRef('edit-member-type')}
              />
            </div>
          )}
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <button type="button" className="admin-button admin-button-secondary" onClick={editMember.onClose}>
            닫기
          </button>
          <button
            type="button"
            className="admin-button admin-button-primary disabled:cursor-not-allowed"
            style={{ backgroundColor: editMember.canSave ? accentColor : undefined }}
            disabled={!editMember.canSave}
            onClick={editMember.onSave}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberDirectoryConfirmModal({ confirmation, isVisible }) {
  return (
    <div className={`admin-overlay ${isVisible ? 'admin-overlay-visible' : ''}`}>
      <div className={`admin-modal-panel ${isVisible ? 'admin-modal-panel-visible' : ''}`}>
        <div className="text-[24px] font-semibold tracking-tight text-black">{confirmation.title}</div>
        <div className="mt-3 text-[16px] leading-[1.6] text-black/60">{confirmation.description}</div>

        <div className="mt-7 grid grid-cols-2 gap-3">
          <AdminButton variant="secondary" onClick={confirmation.onCancel}>
            취소
          </AdminButton>
          <AdminButton variant="primary" danger onClick={confirmation.onConfirm}>
            {confirmation.confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardScreen({
  activeSection,
  accentColor,
  addMember,
  bulkAction,
  filters,
  memberDirectory,
  navigation,
  summary,
  threeWeekAbsence,
  table,
  toast,
}) {
  const [openField, setOpenField] = useState(null);
  const [showThreeWeekModal, setShowThreeWeekModal] = useState(false);
  const fieldRefs = useRef({});
  const toastState = useToastPresence(toast);
  const bulkModal = usePresence(Boolean(bulkAction.pendingType));
  const addMemberModal = usePresence(addMember.isOpen);
  const editMemberModal = usePresence(memberDirectory.editMember.isOpen);
  const memberDirectoryConfirmModal = usePresence(memberDirectory.confirmation.isOpen);
  const threeWeekModal = usePresence(showThreeWeekModal);

  const bindFieldRef = (key) => (node) => {
    if (node) {
      fieldRefs.current[key] = node;
      return;
    }

    delete fieldRefs.current[key];
  };

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target;
      const activeRoot = openField ? fieldRefs.current[openField] : null;

      if (openField && activeRoot && !activeRoot.contains(target)) {
        setOpenField(null);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openField]);

  useEffect(() => {
    if (!addMember.isOpen && String(openField || '').startsWith('add-member-')) {
      setOpenField(null);
    }
  }, [addMember.isOpen, openField]);

  useEffect(() => {
    if (!memberDirectory.editMember.isOpen && String(openField || '').startsWith('edit-member-')) {
      setOpenField(null);
    }
  }, [memberDirectory.editMember.isOpen, openField]);

  useEffect(() => {
    if (memberDirectory.bulkAction.selectedCount === 0 && openField === 'member-directory-bulk-group') {
      setOpenField(null);
    }
  }, [memberDirectory.bulkAction.selectedCount, openField]);

  useEffect(() => {
    setOpenField(null);
  }, [activeSection]);

  const selectedWeekChips = useMemo(() => {
    if (filters.draftWeekKeys.includes('ALL')) {
      return [<FilterChip key="all">전체</FilterChip>];
    }

    return filters.draftWeekKeys
      .map((weekKey) => filters.weekOptions.find((option) => option.value === weekKey))
      .filter(Boolean)
      .map((option) => <FilterChip key={option.value}>{option.label}</FilterChip>);
  }, [filters.draftWeekKeys, filters.weekOptions]);

  const selectedNameChips = useMemo(
    () =>
      filters.draftNameIds
        .map((memberId) => filters.nameOptions.find((option) => option.value === memberId))
        .filter(Boolean)
        .map((option) => <FilterChip key={option.value}>{option.label}</FilterChip>),
    [filters.draftNameIds, filters.nameOptions],
  );

  const selectedCount = table.selectedRowIds.length;
  const allRowsSelected = table.rows.length > 0 && table.rows.every((row) => table.selectedRowIds.includes(row.id));
  const partiallySelected = selectedCount > 0 && !allRowsSelected;
  const selectedGroupLabel = filters.groupOptions.find((option) => option.value === filters.draftGroupId)?.label || '전체';
  const addMemberGroupLabel =
    addMember.groupOptions.find((option) => option.value === addMember.draft.groupId)?.label || '';
  const addMemberTypeLabel =
    MEMBER_TYPE_OPTIONS.find((option) => option.value === addMember.draft.memberType)?.label || '';

  return (
    <div className="admin-shell">
      <div className="grid min-h-[100dvh] grid-cols-1 lg:h-[100dvh] lg:min-h-0 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="admin-sidebar">
          <div className="mb-7 px-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/30">Youth Admin</div>
            <div className="mt-3 text-[19px] font-semibold tracking-tight text-black/88">예우림 청년부</div>
          </div>

          <div className="flex-1 space-y-5">
            <div>
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/30">회원관리</div>
              <div className="mt-2 space-y-1">
                <SidebarItem active={activeSection === 'attendance'} onClick={() => navigation.onSectionChange('attendance')}>
                  출결관리
                </SidebarItem>
                <SidebarItem active={activeSection === 'members'} onClick={() => navigation.onSectionChange('members')}>
                  인적 및 인원관리
                </SidebarItem>
              </div>
            </div>

            <div>
              <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/30">행사관리</div>
              <div className="mt-2 space-y-1">
                <SidebarItem onClick={navigation.onComingSoon}>행사관리</SidebarItem>
                <SidebarItem onClick={navigation.onComingSoon}>예산설정</SidebarItem>
              </div>
            </div>
          </div>

          <div className="admin-sidebar-footer">
            <button type="button" className="admin-button admin-button-secondary w-full" onClick={navigation.onBackToKiosk}>
              키오스크 보기
            </button>
          </div>
        </aside>

        <main className="flex min-h-[100dvh] flex-col overflow-hidden lg:min-h-0">
          <div className="border-b border-black/6 bg-[#fafbfc] px-5 py-5 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[26px] font-semibold tracking-tight text-black">
                  {activeSection === 'members' ? '인적 및 인원관리' : '출결관리'}
                </div>
                <div className="mt-1 text-sm text-black/45">
                  {activeSection === 'members'
                    ? '회원 정보를 수정하고 비활성 상태를 관리할 수 있어요.'
                    : '주차별 출결 현황을 확인하고 수정할 수 있어요.'}
                </div>
              </div>

              <button
                type="button"
                className="admin-button admin-button-primary admin-button-lg"
                style={{ backgroundColor: accentColor }}
                onClick={addMember.onOpen}
              >
                청년 추가
              </button>
            </div>
          </div>

          {activeSection === 'members' ? (
            <MemberDirectorySection
              accentColor={accentColor}
              bindFieldRef={bindFieldRef}
              memberDirectory={memberDirectory}
              openField={openField}
              setOpenField={setOpenField}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto px-5 py-5 lg:px-8 lg:py-6">
              <section className="admin-surface p-4 lg:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <MultiSelectField
                    className="min-w-[240px] flex-[1.25_1_260px]"
                    chips={selectedWeekChips}
                    label="주차 선택"
                    onOptionToggle={filters.onDraftWeekToggle}
                    onToggleOpen={() => setOpenField(openField === 'week' ? null : 'week')}
                    open={openField === 'week'}
                    options={[{ value: 'ALL', label: '전체' }, ...filters.weekOptions]}
                    placeholder="선택해 주세요"
                    selectedValues={filters.draftWeekKeys}
                    wrapperRef={bindFieldRef('week')}
                  />

                  <SingleSelectField
                    className="min-w-[200px] flex-[0.8_1_200px]"
                    label="숲 필터"
                    onOptionSelect={(value) => {
                      filters.onDraftGroupChange(value);
                      setOpenField(null);
                    }}
                    onToggleOpen={() => setOpenField(openField === 'group' ? null : 'group')}
                    open={openField === 'group'}
                    options={filters.groupOptions}
                    selectedLabel={selectedGroupLabel}
                    selectedValue={filters.draftGroupId}
                    wrapperRef={bindFieldRef('group')}
                  />

                  <MultiSelectField
                    className="min-w-[240px] flex-[1.15_1_260px]"
                    chips={selectedNameChips}
                    label="이름 필터"
                    onOptionToggle={filters.onDraftNameToggle}
                    onToggleOpen={() => setOpenField(openField === 'name' ? null : 'name')}
                    open={openField === 'name'}
                    options={filters.nameOptions}
                    placeholder="선택해 주세요"
                    selectedValues={filters.draftNameIds}
                    wrapperRef={bindFieldRef('name')}
                  />

                  <div className="flex min-w-[178px] flex-[0_1_auto] flex-wrap items-end gap-2">
                    <button
                      type="button"
                      className="admin-button admin-button-primary min-w-[84px] disabled:cursor-not-allowed"
                      style={{ backgroundColor: filters.isDirty ? accentColor : undefined }}
                      disabled={!filters.isDirty}
                      onClick={filters.onApply}
                    >
                      검색
                    </button>
                    <button type="button" className="admin-button admin-button-secondary min-w-[84px]" onClick={filters.onReset}>
                      초기화
                    </button>
                  </div>
                </div>
              </section>

              {filters.appliedResolvedWeekKeys.length > 1 && (
                <section className="mt-4 flex flex-wrap gap-2">
                  {filters.appliedResolvedWeekKeys.map((weekKey) => {
                    const option = filters.weekOptions.find((item) => item.value === weekKey);
                    const active = filters.activeWeekKey === weekKey;
                    return (
                      <button
                        key={weekKey}
                        type="button"
                        onClick={() => filters.onActiveWeekChange(weekKey)}
                        className={`admin-tab ${active ? 'admin-tab-active' : ''}`}
                        style={active ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
                      >
                        {option?.label || weekKey}
                      </button>
                    );
                  })}
                </section>
              )}

              <section className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="admin-surface admin-card-hover p-4 lg:p-5">
                  <div className="admin-overline">출석 현황</div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[32px] font-semibold leading-none" style={{ color: accentColor }}>
                        {summary.attendanceCount}
                      </div>
                      <div className="mt-1.5 text-sm text-black/45">출석</div>
                    </div>
                    <div>
                      <div className="text-[32px] font-semibold leading-none">{summary.totalCount}</div>
                      <div className="mt-1.5 text-sm text-black/45">재적</div>
                    </div>
                    <div>
                      <div className="text-[32px] font-semibold leading-none">{summary.attendanceRate}%</div>
                      <div className="mt-1.5 text-sm text-black/45">출석률</div>
                    </div>
                  </div>
                </div>

                <div className="admin-surface admin-card-hover p-4 lg:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="admin-overline">3주 이상 결석자</div>
                    <button
                      type="button"
                      className="admin-button admin-button-tertiary admin-button-inline"
                      onClick={() => setShowThreeWeekModal(true)}
                    >
                      명단보기
                    </button>
                  </div>
                  <div className="mt-4 text-[32px] font-semibold leading-none">{summary.threeWeekAbsenceCount}명</div>
                  <div className="mt-1.5 text-sm text-black/45">등록 후 3주가 지난 청년 중 최근 3주 기준</div>
                </div>
              </section>

              <section className="admin-surface mt-4 overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-black/6 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-black/65">
                      {selectedCount > 0 ? `${selectedCount}명 선택됨` : `총 ${table.rows.length}명`}
                    </div>
                    <div ref={bindFieldRef('bulk')} className="relative">
                      <button
                        type="button"
                        className="admin-button admin-button-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={selectedCount === 0}
                        onClick={() => setOpenField(openField === 'bulk' ? null : 'bulk')}
                      >
                        출결 일괄 설정
                      </button>

                      {openField === 'bulk' && selectedCount > 0 && (
                        <div className="admin-dropdown-panel w-48">
                          {ATTENDANCE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                table.onRequestBulkAction(option.value);
                                setOpenField(null);
                              }}
                              className="admin-dropdown-option"
                            >
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <button type="button" className="admin-button admin-button-secondary" onClick={table.onDownload}>
                    엑셀 다운로드
                  </button>
                </div>

                <div className="overflow-auto">
                  <table className="w-full min-w-[1080px] border-collapse text-sm">
                    <thead className="bg-black/[0.024] text-left">
                      <tr>
                        <th className="px-4 py-3">
                          <IndeterminateCheckbox
                            checked={allRowsSelected}
                            indeterminate={partiallySelected}
                            onChange={table.onSelectAllRows}
                          />
                        </th>
                        <th className="px-4 py-3 font-semibold text-black/45">이름</th>
                        <th className="px-4 py-3 font-semibold text-black/45">유형</th>
                        <th className="px-4 py-3 font-semibold text-black/45">소속 숲</th>
                        <th className="px-4 py-3 font-semibold text-black/45">출결유무</th>
                        <th className="px-4 py-3 font-semibold text-black/45">출석시각</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row) => (
                        <tr key={row.id} className="admin-table-row">
                          <td className="px-4 py-3">
                            <IndeterminateCheckbox
                              checked={table.selectedRowIds.includes(row.id)}
                              indeterminate={false}
                              onChange={() => table.onRowSelectToggle(row.id)}
                            />
                          </td>
                          <td className="px-4 py-3 font-semibold text-black/82">{row.name}</td>
                          <td className="px-4 py-3 text-black/58">{row.memberTypeLabel}</td>
                          <td className="px-4 py-3 text-black/58">{row.groupName || '-'}</td>
                          <td className="px-4 py-3">
                            <TableSelectField
                              onOptionSelect={(value) => {
                                table.onAttendanceTypeChange(row.id, value);
                                setOpenField(null);
                              }}
                              onToggleOpen={() => setOpenField(openField === `attendance-${row.id}` ? null : `attendance-${row.id}`)}
                              open={openField === `attendance-${row.id}`}
                              options={ATTENDANCE_OPTIONS}
                              selectedValue={row.attendanceType}
                              wrapperRef={bindFieldRef(`attendance-${row.id}`)}
                            />
                          </td>
                          <td className="px-4 py-3 text-black/58">{row.attendedAt || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {bulkModal.shouldRender && (
        <div className={`admin-overlay ${bulkModal.isVisible ? 'admin-overlay-visible' : ''}`}>
          <div className={`admin-modal-panel ${bulkModal.isVisible ? 'admin-modal-panel-visible' : ''}`}>
            <div className="text-[24px] font-semibold tracking-tight text-black">출결 일괄 설정</div>
            <div className="mt-3 text-[16px] leading-[1.6] text-black/60">
              선택한 {selectedCount}명의 출결을 <AttendanceTypeLabel type={bulkAction.pendingType} />로 변경할까요?
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <button type="button" className="admin-button admin-button-secondary" onClick={bulkAction.onClose}>
                취소
              </button>
              <button
                type="button"
                className="admin-button admin-button-primary"
                style={{ backgroundColor: accentColor }}
                onClick={bulkAction.onConfirm}
              >
                변경하기
              </button>
            </div>
          </div>
        </div>
      )}

      {threeWeekModal.shouldRender && (
        <div className={`admin-overlay ${threeWeekModal.isVisible ? 'admin-overlay-visible' : ''}`}>
          <div className={`admin-modal-panel admin-modal-panel-wide ${threeWeekModal.isVisible ? 'admin-modal-panel-visible' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[24px] font-semibold tracking-tight text-black">3주 이상 결석자 명단</div>
                <div className="mt-2 text-sm text-black/45">등록 후 3주가 지난 청년 중 최근 3주 연속 결석한 인원입니다</div>
              </div>
              <button
                type="button"
                className="admin-button admin-button-tertiary admin-button-icon"
                onClick={() => setShowThreeWeekModal(false)}
                aria-label="결석자 명단 모달 닫기"
              >
                ×
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-[12px] border border-black/6">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-black/[0.024] text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-black/45">이름</th>
                    <th className="px-4 py-3 font-semibold text-black/45">유형</th>
                    <th className="px-4 py-3 font-semibold text-black/45">소속 숲</th>
                    <th className="px-4 py-3 font-semibold text-black/45">결석 정보</th>
                  </tr>
                </thead>
                <tbody>
                  {threeWeekAbsence.rows.length > 0 ? (
                    threeWeekAbsence.rows.map((row) => (
                      <tr key={row.id} className="admin-table-row">
                        <td className="px-4 py-3 font-semibold text-black/82">{row.name}</td>
                        <td className="px-4 py-3 text-black/58">{row.memberTypeLabel}</td>
                        <td className="px-4 py-3 text-black/58">{row.groupName}</td>
                        <td className="px-4 py-3 text-black/58">
                          <div className="admin-table-note">{row.absenceInfo}</div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="admin-empty-state">
                        최근 3주 이상 결석한 인원이 없어요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {addMemberModal.shouldRender && (
        <div className={`admin-overlay ${addMemberModal.isVisible ? 'admin-overlay-visible' : ''}`}>
          <div className={`admin-modal-panel ${addMemberModal.isVisible ? 'admin-modal-panel-visible' : ''}`}>
            <div className="text-[24px] font-semibold tracking-tight text-black">청년 추가</div>
            <div className="mt-2 text-sm text-black/45">명단에 새 청년을 등록하고 이후 출결을 관리할 수 있어요.</div>

            <div className="mt-7 space-y-4">
              <div>
                <label className="admin-field-label">이름</label>
                <input
                  value={addMember.draft.name}
                  onChange={(event) => addMember.onDraftChange('name', event.target.value)}
                  className="admin-control admin-input mt-2 w-full"
                  placeholder="이름 입력"
                />
                {addMember.helperText || addMember.previewDisplayName ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm leading-[1.45] text-black/42">
                    {addMember.helperText ? <span>{addMember.helperText}</span> : null}
                    {addMember.previewDisplayName ? (
                      <span className="font-medium text-black/62">예상 {addMember.previewDisplayName}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div>
                <label className="admin-field-label">숲 선택</label>
                <SingleSelectField
                  className="mt-2"
                  onOptionSelect={(value) => {
                    addMember.onDraftChange('groupId', value);
                    setOpenField(null);
                  }}
                  onToggleOpen={() => setOpenField(openField === 'add-member-group' ? null : 'add-member-group')}
                  open={openField === 'add-member-group'}
                  options={addMember.groupOptions}
                  placeholder="선택해 주세요"
                  selectedLabel={addMemberGroupLabel}
                  selectedValue={addMember.draft.groupId}
                  wrapperRef={bindFieldRef('add-member-group')}
                />
              </div>

              {addMember.isNewcomerGroupSelected && (
                <div>
                  <label className="admin-field-label">유형</label>
                  <SingleSelectField
                    className="mt-2"
                    onOptionSelect={(value) => {
                      addMember.onDraftChange('memberType', value);
                      setOpenField(null);
                    }}
                    onToggleOpen={() => setOpenField(openField === 'add-member-type' ? null : 'add-member-type')}
                    open={openField === 'add-member-type'}
                    options={MEMBER_TYPE_OPTIONS}
                    selectedLabel={addMemberTypeLabel}
                    selectedValue={addMember.draft.memberType}
                    wrapperRef={bindFieldRef('add-member-type')}
                  />
                </div>
              )}
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3">
              <button type="button" className="admin-button admin-button-secondary" onClick={addMember.onClose}>
                닫기
              </button>
              <button
                type="button"
                className="admin-button admin-button-primary disabled:cursor-not-allowed"
                style={{ backgroundColor: addMember.canSave ? accentColor : undefined }}
                disabled={!addMember.canSave}
                onClick={addMember.onSave}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {editMemberModal.shouldRender && memberDirectory.editMember.isOpen && (
        <EditMemberModal
          accentColor={accentColor}
          bindFieldRef={bindFieldRef}
          editMember={memberDirectory.editMember}
          isVisible={editMemberModal.isVisible}
          openField={openField}
          setOpenField={setOpenField}
        />
      )}

      {memberDirectoryConfirmModal.shouldRender && memberDirectory.confirmation.isOpen && (
        <MemberDirectoryConfirmModal
          confirmation={memberDirectory.confirmation}
          isVisible={memberDirectoryConfirmModal.isVisible}
        />
      )}

      {toastState.shouldRender && toastState.renderedMessage && (
        <div className={`admin-toast ${toastState.isVisible ? 'admin-toast-visible' : ''}`}>
          {toastState.renderedMessage}
        </div>
      )}
    </div>
  );
}
