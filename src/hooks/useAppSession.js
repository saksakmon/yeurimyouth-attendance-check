import * as React from 'react';
import {
  canAccessAdminSection,
  canAccessScreen,
  getAuditActorName,
  getRoleLabel,
  hasPermission,
} from '../auth/permissions.js';
import { createSessionAdapter } from '../auth/sessionAdapter.js';

const { useCallback, useEffect, useMemo, useState } = React;
const SESSION_BOOT_TIMEOUT_MS = 4200;

const ANONYMOUS_SESSION = {
  isAuthenticated: false,
  source: 'anonymous',
  user: null,
};

function createSessionBootTimeout() {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const error = new Error('세션 확인 시간이 초과되었어요.');
      error.name = 'AuthBootstrapTimeoutError';
      reject(error);
    }, SESSION_BOOT_TIMEOUT_MS);
  });
}

export function useAppSession() {
  const adapter = useMemo(() => createSessionAdapter(), []);
  const [session, setSession] = useState(ANONYMOUS_SESSION);
  const [status, setStatus] = useState('loading');
  const [sessionError, setSessionError] = useState('');
  const [sessionDiagnostic, setSessionDiagnostic] = useState(() => adapter.getDiagnostic?.() || null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const syncDiagnostic = useCallback(() => {
    if (!adapter.getDiagnostic) return null;
    const nextDiagnostic = adapter.getDiagnostic();
    setSessionDiagnostic(nextDiagnostic);
    return nextDiagnostic;
  }, [adapter]);

  const refreshSession = useCallback(async () => {
    try {
      const nextSession = (await Promise.race([adapter.getCurrentSession(), createSessionBootTimeout()])) || ANONYMOUS_SESSION;
      setSession(nextSession);
      setStatus(nextSession.isAuthenticated ? 'authenticated' : 'anonymous');
      setSessionError('');
      syncDiagnostic();
      return nextSession;
    } catch (error) {
      console.warn('[auth] failed to refresh session', error);
      setSession(ANONYMOUS_SESSION);
      setStatus('error');
      setSessionError('세션 확인에 실패했어요. 다시 로그인해 주세요.');
      syncDiagnostic();
      return ANONYMOUS_SESSION;
    }
  }, [adapter, syncDiagnostic]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const nextSession = await Promise.race([adapter.getCurrentSession(), createSessionBootTimeout()]).catch((error) => {
        console.warn('[auth] initial session load failed', error);
        return null;
      });

      if (!active) return;

      const resolvedSession = nextSession || ANONYMOUS_SESSION;
      setSession(resolvedSession);
      setStatus(nextSession ? (resolvedSession.isAuthenticated ? 'authenticated' : 'anonymous') : 'error');
      setSessionError(nextSession ? '' : '세션 확인에 실패했어요. 다시 로그인해 주세요.');
      syncDiagnostic();
    }

    initialize();
    const unsubscribe = adapter.onAuthStateChange(async (nextSession) => {
      if (!active) return;

      try {
        if (nextSession?.then) {
          const awaitedSession = await Promise.race([nextSession, createSessionBootTimeout()]);
          if (!active) return;
          const resolvedSession = awaitedSession || ANONYMOUS_SESSION;
          setSession(resolvedSession);
          setStatus(resolvedSession.isAuthenticated ? 'authenticated' : 'anonymous');
          setSessionError('');
          syncDiagnostic();
          return;
        }

        const resolvedSession = nextSession || ANONYMOUS_SESSION;
        setSession(resolvedSession);
        setStatus(resolvedSession.isAuthenticated ? 'authenticated' : 'anonymous');
        setSessionError('');
        syncDiagnostic();
      } catch (error) {
        console.warn('[auth] auth state change handling failed', error);
        if (!active) return;
        setSession(ANONYMOUS_SESSION);
        setStatus('error');
        setSessionError('세션 확인에 실패했어요. 다시 로그인해 주세요.');
        syncDiagnostic();
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [adapter, syncDiagnostic]);

  const signIn = useCallback(
    async ({ email, password }) => {
      setIsSigningIn(true);
      setSessionError('');

      try {
        const nextSession = (await adapter.signInWithPassword({ email, password })) || ANONYMOUS_SESSION;
        setSession(nextSession);
        setStatus(nextSession.isAuthenticated ? 'authenticated' : 'anonymous');
        syncDiagnostic();
        return nextSession;
      } finally {
        setIsSigningIn(false);
      }
    },
    [adapter, syncDiagnostic],
  );

  const signOut = useCallback(async () => {
    setIsSigningOut(true);

    try {
      await adapter.signOut();
      setSession(ANONYMOUS_SESSION);
      setStatus('anonymous');
      setSessionError('');
      syncDiagnostic();
    } finally {
      setIsSigningOut(false);
    }
  }, [adapter, syncDiagnostic]);

  return useMemo(
    () => ({
      authDiagnostic: sessionDiagnostic,
      auditActorName: getAuditActorName(session),
      can: (permission) => hasPermission(session, permission),
      canAccessAdminSection: (section) => canAccessAdminSection(session, section),
      canAccessScreen: (screen) => canAccessScreen(session, screen),
      availableAccounts: adapter.availableAccounts || [],
      devCredentialsHint: adapter.devCredentialsHint,
      currentUser: session?.user || null,
      isAuthenticated: Boolean(session?.isAuthenticated),
      isSigningIn,
      isSigningOut,
      isLoading: status === 'loading',
      mode: adapter.mode,
      refreshSession,
      roleLabel: getRoleLabel(session?.user?.role),
      session,
      sessionError,
      signIn,
      signOut,
      status,
    }),
    [
      adapter.availableAccounts,
      adapter.devCredentialsHint,
      adapter.mode,
      isSigningIn,
      isSigningOut,
      refreshSession,
      session,
      sessionDiagnostic,
      sessionError,
      signIn,
      signOut,
      status,
    ],
  );
}
