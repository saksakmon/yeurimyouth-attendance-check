import * as React from 'react';

export default function PreAttendanceConfirmScreen({ accentColor, attendanceMeta, onStart }) {
  return (
    <div className="w-full bg-neutral-100 text-neutral-900 lg:h-[100dvh] lg:overflow-hidden">
      <div className="grid min-h-[100dvh] grid-cols-1 lg:h-full lg:min-h-0 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="bg-[#1b1b1d] px-8 py-10 text-white lg:h-full lg:px-16 lg:py-12">
          <div className="flex h-full flex-col justify-center gap-12">
            <div>
              <div className="text-lg font-medium text-white/45 lg:text-xl">출석 시작 전 관리자 확인</div>
              <div className="mt-10 text-4xl font-semibold leading-[1.2] tracking-tight lg:mt-16 lg:text-6xl">
                <div>예우림교회</div>
                <div>드림청년부 출석 키오스크</div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-[100dvh] items-center justify-center bg-[#f4f4f5] px-6 py-10 lg:min-h-0 lg:px-10">
          <div className="w-full max-w-xl rounded-[32px] bg-white p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] lg:p-10">
            <div className="text-[32px] font-semibold tracking-tight text-black lg:text-[42px]">
              <div>
                {attendanceMeta.serviceDateLabel} · {attendanceMeta.weekLabel}로
              </div>
              <div className="mt-2">출석을 진행할까요?</div>
            </div>

            <div className="mt-8 rounded-2xl border border-black/8 bg-white px-5 py-4 text-[17px] leading-[1.55] text-black/55">
              이전 주차 현황 수정은 관리자 페이지에서 진행해 주세요.
            </div>

            <button
              type="button"
              className="mt-8 h-16 w-full rounded-2xl text-[22px] font-semibold text-white shadow-sm active:scale-[0.99]"
              style={{ backgroundColor: accentColor }}
              onClick={onStart}
            >
              출석 시작하기
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
