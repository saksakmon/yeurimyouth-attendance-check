import * as React from 'react';

export default function AttendanceKioskScreen({
  accentColor,
  attendance,
  attendanceCount,
  attendanceMeta,
  attendanceRate,
  canRegisterNewMember,
  confirmTarget,
  filtered,
  newMemberName,
  newMemberStatus,
  totalMemberCount,
  onBackspace,
  onCloseNewMemberModal,
  onConfirmAttendance,
  onKeyTap,
  onNewMemberNameChange,
  onNewMemberStatusChange,
  onOpenAdmin,
  onOpenNewMemberModal,
  onRegisterNewMember,
  onReset,
  onSelectConfirmTarget,
  query,
  renderName,
  resultState,
  showNewMemberModal,
  toast,
}) {
  return (
    <div className="w-full bg-neutral-100 text-neutral-900 lg:h-[100dvh] lg:overflow-hidden">
      <div className="grid min-h-[100dvh] grid-cols-1 lg:h-full lg:min-h-0 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="bg-[#1b1b1d] px-8 py-10 text-white lg:h-full lg:px-16 lg:py-12">
          <div className="flex h-full flex-col justify-between gap-12">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-lg font-medium text-white/45 lg:text-xl">{attendanceMeta.attendanceLabel}</div>
                <button
                  type="button"
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
                  onClick={onOpenAdmin}
                >
                  관리자 웹
                </button>
              </div>
              <div className="mt-10 text-4xl font-semibold leading-[1.2] tracking-tight lg:mt-16 lg:text-6xl">
                <div>예우림교회</div>
                <div>드림청년부 출석현황</div>
              </div>
            </div>

            <div className="grid grid-cols-2 items-start gap-8 pb-0 lg:gap-10 lg:pb-16">
              <div>
                <div className="text-xl text-white/90 lg:text-2xl">출석</div>
                <div className="mt-6 text-[64px] font-semibold leading-none tracking-tight lg:text-[112px]">
                  <span style={{ color: accentColor }}>{attendanceCount}</span>
                  <span className="ml-2 text-[28px] lg:text-[48px]">명</span>
                </div>
                <div className="mt-4 text-lg text-white/45 lg:text-2xl">재적 {totalMemberCount}명</div>
              </div>
              <div className="border-l border-white/15 pl-8 lg:pl-12">
                <div className="text-xl text-white/90 lg:text-2xl">출석률</div>
                <div className="mt-6 text-[64px] font-semibold leading-none tracking-tight lg:text-[112px]">
                  {attendanceRate}
                  <span className="ml-2 text-[28px] lg:text-[48px]">%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative grid min-h-[100dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#f4f4f5] lg:h-full lg:min-h-0">
          <div className="border-b border-black/8 px-6 pb-6 pt-8 lg:px-10 lg:pt-10">
            <div className="text-sm font-medium text-black/35 lg:text-[18px]">{attendanceMeta.attendanceLabel}</div>
            <div className="mt-4 flex h-16 items-center text-4xl leading-none lg:h-20 lg:text-7xl">
              <span>{query}</span>
              <span className="kiosk-caret" aria-hidden="true" />
            </div>
          </div>

          <div className="min-h-0 overflow-hidden">
            {resultState === 'idle' && (
              <div className="flex h-full items-center justify-center px-8 text-center text-xl leading-[1.5] text-black/25 lg:text-[24px]">
                이름이나 초성을 입력해 주세요
              </div>
            )}

            {resultState === 'empty' && (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <div className="text-2xl font-medium text-black/70 lg:text-[28px]">검색 결과가 없어요</div>
                <div className="mt-3 text-lg text-black/35 lg:text-[22px]">
                  찾으시는 이름이 없다면 새가족 등록 안내를 확인해 주세요
                </div>
              </div>
            )}

            {resultState === 'results' && (
              <div className="h-full overflow-y-auto">
                {filtered.map((member) => {
                  const attendedAt = attendance[member.id];
                  return (
                    <div
                      key={member.id}
                      className="flex min-h-[96px] items-center justify-between border-b border-black/6 bg-white/30 px-6 lg:h-[108px] lg:px-10"
                    >
                      <div className="min-w-0 pr-6">
                        <div className="text-2xl font-semibold tracking-tight lg:text-[28px]">{renderName(member)}</div>
                      </div>

                      {attendedAt ? (
                        <div className="rounded-2xl bg-black/5 px-4 py-3 text-lg font-medium text-black/45 lg:px-5 lg:text-[22px]">
                          출석완료 · {attendedAt}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rounded-2xl px-6 py-3 text-xl font-semibold text-white shadow-sm active:scale-[0.98] lg:px-8 lg:py-4 lg:text-[24px]"
                          style={{ backgroundColor: accentColor }}
                          onClick={() => onSelectConfirmTarget(member)}
                        >
                          출석
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-7 border-t border-black/8 bg-[#f4f4f5]">
            <div className="col-span-7 grid grid-cols-7">
              {['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onKeyTap(key)}
                  className="h-20 border-b border-r border-black/8 text-3xl font-semibold active:bg-black/5 lg:h-[106px] lg:text-[48px]"
                >
                  {key}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenNewMemberModal}
              className="col-span-5 flex h-20 items-center justify-center gap-2 border-b border-r border-black/8 px-4 text-center text-sm text-black/45 active:bg-black/5 lg:h-[106px] lg:gap-3 lg:text-[18px]"
            >
              <span>찾으시는 이름이 없나요?</span>
              <span className="underline underline-offset-4" style={{ color: accentColor }}>
                새가족 등록 안내
              </span>
            </button>
            <button
              type="button"
              onClick={onBackspace}
              className="h-20 border-b border-r border-black/8 text-4xl active:bg-black/5 lg:h-[106px] lg:text-[48px]"
              aria-label="한 글자 삭제"
            >
              ←
            </button>
            <button
              type="button"
              onClick={onReset}
              className="h-20 border-b border-r border-black/8 text-4xl active:bg-black/5 lg:h-[106px] lg:text-[48px]"
              aria-label="검색어 초기화"
            >
              ↻
            </button>
          </div>

          {confirmTarget && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 p-6 lg:p-8">
              <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl lg:p-8">
                <div className="text-[30px] font-semibold tracking-tight lg:text-[34px]">출석할까요?</div>
                <div className="mt-4 text-xl leading-[1.5] text-black/70 lg:text-[24px]">
                  {confirmTarget.displayName || confirmTarget.name}
                  {confirmTarget.groupName ? ` · ${confirmTarget.groupName}` : ''}
                  {' '}으로 출석할까요?
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    className="h-16 rounded-2xl bg-black/6 text-xl font-medium lg:text-[22px]"
                    onClick={() => onSelectConfirmTarget(null)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="h-16 rounded-2xl text-xl font-semibold text-white lg:text-[22px]"
                    style={{ backgroundColor: accentColor }}
                    onClick={onConfirmAttendance}
                  >
                    출석할게요
                  </button>
                </div>
              </div>
            </div>
          )}

          {showNewMemberModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/32 p-6 lg:p-8">
              <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl lg:p-8">
                <div className="text-[30px] font-semibold tracking-tight lg:text-[34px]">새가족 등록 안내</div>
                <div className="mt-2 text-lg text-black/45 lg:text-[21px]">현장 접수 시 상태를 선택한 뒤 바로 출석까지 처리합니다.</div>

                <div className="mt-8">
                  <label className="text-[18px] text-black/45">이름</label>
                  <input
                    value={newMemberName}
                    onChange={(event) => onNewMemberNameChange(event.target.value)}
                    className="mt-2 h-14 w-full rounded-2xl border border-black/10 px-4 text-[20px] outline-none"
                    placeholder="이름 입력"
                  />
                </div>

                <div className="mt-8">
                  <div className="text-[18px] text-black/45">상태 선택</div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {[
                      { label: '등록', value: 'registered' },
                      { label: '방문', value: 'visit' },
                    ].map((status) => (
                      <button
                        key={status.value}
                        type="button"
                        onClick={() => onNewMemberStatusChange(status.value)}
                        className={`h-16 rounded-2xl border text-[22px] font-medium ${
                          newMemberStatus === status.value
                            ? 'text-[#1677FF]'
                            : 'border-black/10 bg-white text-black/70'
                        }`}
                        style={
                          newMemberStatus === status.value
                            ? {
                                borderColor: accentColor,
                                backgroundColor: `${accentColor}1A`,
                              }
                            : undefined
                        }
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-8 rounded-2xl bg-black/[0.03] p-5 text-[18px] leading-[1.6] text-black/55">
                  키오스크에서는 방문, 등록 두 상태만 우선 받고, 관리자 화면에서는 이후 training, assigned 단계까지 이어서 관리할 수 있게 확장할 예정입니다.
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    className="h-16 rounded-2xl bg-black/6 text-[22px] font-medium"
                    onClick={onCloseNewMemberModal}
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    className="h-16 rounded-2xl text-[22px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
                    style={{ backgroundColor: canRegisterNewMember ? accentColor : undefined }}
                    disabled={!canRegisterNewMember}
                    onClick={onRegisterNewMember}
                  >
                    등록 및 출석처리
                  </button>
                </div>
              </div>
            </div>
          )}

          {toast && (
            <div className="absolute right-6 top-6 rounded-2xl bg-black px-5 py-4 text-lg text-white shadow-xl lg:right-8 lg:top-8 lg:text-[20px]">
              {toast}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
