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

const ANONYMOUS_SESSION = {
  isAuthenticated: false,
  source: 'anonymous',
  user: null,
};

export function useAppSession() {
  const adapter = useMemo(() => createSessionAdapter(), []);
  const [session, setSession] = useState(ANONYMOUS_SESSION);
  const [status, setStatus] = useState('loading');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const nextSession = (await adapter.getCurrentSession()) || ANONYMOUS_SESSION;
      setSession(nextSession);
      setStatus(nextSession.isAuthenticated ? 'authenticated' : 'anonymous');
      return nextSession;
    } catch (error) {
      console.warn('[auth] failed to refresh session', error);
      setSession(ANONYMOUS_SESSION);
      setStatus('anonymous');
      return ANONYMOUS_SESSION;
    }
  }, [adapter]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      const nextSession = await adapter.getCurrentSession().catch((error) => {
        console.warn('[auth] initial session load failed', error);
        return null;
      });

      if (!active) return;

      const resolvedSession = nextSession || ANONYMOUS_SESSION;
      setSession(resolvedSession);
      setStatus(resolvedSession.isAuthenticated ? 'authenticated' : 'anonymous');
    }

    initialize();
    const unsubscribe = adapter.onAuthStateChange(async (nextSession) => {
      if (!active) return;

      if (nextSession?.then) {
        const awaitedSession = await nextSession;
        if (!active) return;
        const resolvedSession = awaitedSession || ANONYMOUS_SESSION;
        setSession(resolvedSession);
        setStatus(resolvedSession.isAuthenticated ? 'authenticated' : 'anonymous');
        return;
      }

      const resolvedSession = nextSession || ANONYMOUS_SESSION;
      setSession(resolvedSession);
      setStatus(resolvedSession.isAuthenticated ? 'authenticated' : 'anonymous');
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [adapter]);

  const signIn = useCallback(
    async ({ email, password }) => {
      setIsSigningIn(true);

      try {
        const nextSession = (await adapter.signInWithPassword({ email, password })) || ANONYMOUS_SESSION;
        setSession(nextSession);
        setStatus(nextSession.isAuthenticated ? 'authenticated' : 'anonymous');
        return nextSession;
      } finally {
        setIsSigningIn(false);
      }
    },
    [adapter],
  );

  const signOut = useCallback(async () => {
    setIsSigningOut(true);

    try {
      await adapter.signOut();
      setSession(ANONYMOUS_SESSION);
      setStatus('anonymous');
    } finally {
      setIsSigningOut(false);
    }
  }, [adapter]);

  return useMemo(
    () => ({
      auditActorName: getAuditActorName(session),
      can: (permission) => hasPermission(session, permission),
      canAccessAdminSection: (section) => canAccessAdminSection(session, section),
      canAccessScreen: (screen) => canAccessScreen(session, screen),
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
      signIn,
      signOut,
      status,
    }),
    [adapter.devCredentialsHint, adapter.mode, isSigningIn, isSigningOut, refreshSession, session, signIn, signOut, status],
  );
}
