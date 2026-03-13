import * as React from 'react';
import { APP_SCREENS } from '../constants/app.js';

const { useEffect, useMemo, useState } = React;

export default function AdminLoginScreen({ accentColor, auth, onBackToKiosk }) {
  const [email, setEmail] = useState(() => auth.devCredentialsHint?.email || '');
  const [password, setPassword] = useState(() => auth.devCredentialsHint?.password || '');
  const [error, setError] = useState('');

  const hasAdminAccess = auth.canAccessScreen(APP_SCREENS.adminDashboard);
  const isUnauthorizedAccount = auth.isAuthenticated && !hasAdminAccess;
  const canSubmit = Boolean(email.trim() && password.trim()) && !auth.isSigningIn;
  const sessionLabel = useMemo(() => {
    if (!auth.currentUser) return '';

    const identity = auth.currentUser.name || auth.currentUser.email;
    if (!auth.currentUser.email || identity === auth.currentUser.email) {
      return identity;
    }

    return `${identity} · ${auth.currentUser.email}`;
  }, [auth.currentUser]);

  useEffect(() => {
    if (auth.mode !== 'local') return;
    if (email) return;

    setEmail(auth.devCredentialsHint?.email || '');
    setPassword(auth.devCredentialsHint?.password || '');
  }, [auth.devCredentialsHint?.email, auth.devCredentialsHint?.password, auth.mode, email]);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setError('');
    }
  }, [auth.isAuthenticated]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      await auth.signIn({ email: email.trim(), password });
    } catch (signInError) {
      setError(signInError?.message || '로그인 중 오류가 발생했어요.');
    }
  };

  const handleUnauthorizedSignOut = async () => {
    setError('');

    try {
      await auth.signOut();
    } catch (signOutError) {
      setError(signOutError?.message || '로그아웃 중 오류가 발생했어요.');
    }
  };

  return (
    <div className="admin-shell min-h-[100dvh] px-4 py-8 lg:px-6">
      <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-[1120px] items-center justify-center">
        <div className="grid w-full max-w-[1040px] gap-6 lg:grid-cols-[minmax(0,1.1fr)_460px]">
          <section className="hidden rounded-[28px] border border-white/70 bg-[linear-gradient(135deg,rgba(22,119,255,0.12),rgba(255,255,255,0.94))] p-8 shadow-[0_18px_40px_rgba(15,23,42,0.06)] lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-black/34">Youth Admin</div>
              <h1 className="mt-4 text-[32px] font-semibold tracking-tight text-black/88">관리자 인증</h1>
              <p className="mt-3 max-w-[30ch] text-[15px] leading-[1.7] text-black/58">
                관리자 계정으로 로그인해야 출결관리, 인원관리, 재적 상태 변경 같은 운영 기능에 접근할 수 있어요.
              </p>
            </div>

            <div className="rounded-[20px] border border-white/70 bg-white/84 p-5">
              <div className="text-[13px] font-semibold text-black/72">이번 단계에서 준비된 보안 경계</div>
              <ul className="mt-3 space-y-2 text-[13px] leading-[1.55] text-black/54">
                <li>관리자 영역은 로그인 후 역할/권한 기준으로 진입을 제한해요.</li>
                <li>키오스크는 공개 화면으로 유지하고, 관리자와 세션을 분리해요.</li>
                <li>변경 이력의 수정자는 실제 로그인 계정 기준으로 기록돼요.</li>
              </ul>
            </div>
          </section>

          <section className="admin-surface overflow-hidden px-6 py-7 shadow-[0_16px_34px_rgba(15,23,42,0.05)] sm:px-7">
            <div className="text-[24px] font-semibold tracking-tight text-black">
              {isUnauthorizedAccount ? '관리자 권한 확인' : '관리자 로그인'}
            </div>
            <div className="mt-2 text-sm leading-[1.6] text-black/46">
              {isUnauthorizedAccount
                ? '로그인된 계정의 관리자 권한을 확인하지 못했어요.'
                : '이메일과 비밀번호로 관리자 세션을 시작할 수 있어요.'}
            </div>

            {auth.isLoading ? (
              <div className="mt-8 rounded-[16px] border border-black/6 bg-black/[0.02] px-4 py-5 text-sm text-black/58">
                세션을 확인하고 있어요...
              </div>
            ) : isUnauthorizedAccount ? (
              <>
                <div className="mt-6 rounded-[18px] border border-[#FDE7E7] bg-[#FFF7F7] px-4 py-4">
                  <div className="text-[13px] font-semibold text-[#B42318]">관리자 권한이 없는 계정이에요.</div>
                  <div className="mt-2 text-sm leading-[1.6] text-[#7A271A]">
                    {sessionLabel || '현재 로그인된 계정'}은 로그인에는 성공했지만, 관리자 화면에 접근할 수 있는 역할이 아직 연결되지 않았어요.
                  </div>
                  <div className="mt-3 text-[13px] text-[#7A271A]">현재 역할: {auth.roleLabel}</div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" className="admin-button admin-button-secondary" onClick={onBackToKiosk}>
                    키오스크로 돌아가기
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button-primary"
                    style={{ backgroundColor: accentColor }}
                    disabled={auth.isSigningOut}
                    onClick={handleUnauthorizedSignOut}
                  >
                    {auth.isSigningOut ? '로그아웃 중...' : '다른 계정으로 로그인'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {auth.mode === 'local' ? (
                  <div className="mt-6 rounded-[16px] border border-[rgba(22,119,255,0.12)] bg-[rgba(22,119,255,0.06)] px-4 py-4 text-sm text-black/62">
                    <div className="font-semibold text-black/74">로컬 개발 모드</div>
                    <div className="mt-1.5 leading-[1.6]">
                      현재는 Supabase Auth 대신 로컬 개발 계정으로 인증해요.
                      <br />
                      {auth.devCredentialsHint?.email} / {auth.devCredentialsHint?.password}
                    </div>
                  </div>
                ) : null}

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="admin-field-label">이메일</label>
                    <input
                      type="email"
                      autoComplete="email"
                      className="admin-control admin-input mt-2 w-full"
                      placeholder="admin@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="admin-field-label">비밀번호</label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      className="admin-control admin-input mt-2 w-full"
                      placeholder="비밀번호 입력"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>

                  {error ? (
                    <div className="rounded-[14px] border border-[#FDE7E7] bg-[#FFF7F7] px-4 py-3 text-sm text-[#B42318]">
                      {error}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                    <button type="button" className="admin-button admin-button-secondary" onClick={onBackToKiosk}>
                      키오스크로 돌아가기
                    </button>
                    <button
                      type="submit"
                      className="admin-button admin-button-primary disabled:cursor-not-allowed"
                      style={canSubmit ? { backgroundColor: accentColor } : undefined}
                      disabled={!canSubmit}
                    >
                      {auth.isSigningIn ? '로그인 중...' : '로그인'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
