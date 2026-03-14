import { ROLES, normalizeRole } from './permissions.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

const LOCAL_ADMIN_SESSION_STORAGE_KEY = 'yeurim-admin-local-session-v1';
const AUTH_SESSION_TIMEOUT_MS = 1800;
const AUTH_USER_TIMEOUT_MS = 2400;
const DEFAULT_LOCAL_ADMIN_ACCOUNTS = [
  {
    email: 'superadmin@example.com',
    id: 'local-super-admin',
    name: '총관리자',
    password: 'super1234',
    role: ROLES.superAdmin,
  },
  {
    email: 'admin@example.com',
    id: 'local-admin',
    name: '운영 관리자',
    password: 'admin1234',
    role: ROLES.admin,
  },
  {
    email: 'leader@example.com',
    id: 'local-leader',
    name: '출결 리더',
    password: 'leader1234',
    role: ROLES.leader,
  },
];

function safeLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function mapSupabaseAuthError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (message.includes('invalid login credentials') || code === 'invalid_credentials') {
    return '계정이 없거나 비밀번호가 맞지 않아요.';
  }

  if (message.includes('email not confirmed') || code === 'email_not_confirmed') {
    return '이메일 인증이 완료되지 않았어요. Supabase Auth에서 이메일 인증 여부를 확인해 주세요.';
  }

  if (message.includes('user not found')) {
    return 'Supabase Auth에 등록된 계정을 찾지 못했어요.';
  }

  return error?.message || '로그인 중 오류가 발생했어요.';
}

function mapSupabaseSessionError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (error?.name === 'AuthSessionTimeoutError') {
    return '세션 확인 응답이 지연되고 있어요.';
  }

  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Supabase와 통신하지 못했어요.';
  }

  if (message.includes('invalid jwt') || message.includes('jwt')) {
    return '저장된 세션이 유효하지 않아요.';
  }

  return error?.message || '세션 확인 중 오류가 발생했어요.';
}

function createTimeoutError(label, timeoutMs) {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.name = 'AuthSessionTimeoutError';
  error.stage = label;
  return error;
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId = null;

  return Promise.race([
    promise.finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(createTimeoutError(label, timeoutMs));
      }, timeoutMs);
    }),
  ]);
}

function createDiagnosticStore(mode) {
  let diagnostic = {
    message: '',
    mode,
    stage: 'idle',
    status: 'idle',
  };

  return {
    get() {
      return diagnostic;
    },
    set(nextDiagnostic) {
      diagnostic = {
        ...diagnostic,
        ...nextDiagnostic,
        updatedAt: new Date().toISOString(),
      };
    },
  };
}

function getLocalAdminAccounts() {
  return DEFAULT_LOCAL_ADMIN_ACCOUNTS.map((account) => ({
    ...account,
    role: normalizeRole(account.role) || ROLES.admin,
  }));
}

function resolveUserName(user) {
  const metadataName =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.app_metadata?.name ||
    user?.app_metadata?.full_name;

  if (metadataName) return String(metadataName);
  if (user?.name) return String(user.name);
  if (user?.email) return String(user.email).split('@')[0];
  return '관리자';
}

export function resolveUserRole(user) {
  const candidates = [
    user?.app_metadata?.admin_role,
    user?.app_metadata?.role,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeRole(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function buildSessionFromUser(user, source = 'supabase') {
  if (!user?.id) return null;

  return {
    isAuthenticated: true,
    source,
    user: {
      email: user.email || '',
      id: user.id,
      name: resolveUserName(user),
      role: resolveUserRole(user),
    },
  };
}

async function getVerifiedSupabaseUser(diagnosticStore) {
  if (!supabase) return null;

  diagnosticStore?.set({
    message: '세션 조회 중',
    stage: 'getSession',
    status: 'loading',
  });

  const {
    data: { session },
    error: sessionError,
  } = await withTimeout(supabase.auth.getSession(), AUTH_SESSION_TIMEOUT_MS, 'getSession');

  if (sessionError) {
    diagnosticStore?.set({
      message: mapSupabaseSessionError(sessionError),
      stage: 'getSession',
      status: 'error',
    });
    throw new Error(sessionError.message);
  }

  if (!session?.user) {
    diagnosticStore?.set({
      message: '저장된 세션이 없어요.',
      stage: 'getSession',
      status: 'success',
    });
    return null;
  }

  diagnosticStore?.set({
    message: '세션 조회 완료',
    stage: 'getSession',
    status: 'success',
  });

  try {
    diagnosticStore?.set({
      message: '사용자 검증 중',
      stage: 'getUser',
      status: 'loading',
    });

    const {
      data: { user },
      error,
    } = await withTimeout(supabase.auth.getUser(), AUTH_USER_TIMEOUT_MS, 'getUser');

    if (error) {
      console.warn('[auth] getUser verification failed, falling back to session user', error.message);
      diagnosticStore?.set({
        message: `사용자 검증 실패, session user로 진행해요. (${mapSupabaseSessionError(error)})`,
        stage: 'getUser',
        status: 'fallback',
      });
      return session.user;
    }

    diagnosticStore?.set({
      message: '사용자 검증 완료',
      stage: 'getUser',
      status: 'success',
    });
    return user || session.user;
  } catch (error) {
    console.warn('[auth] getUser verification threw, falling back to session user', error);
    diagnosticStore?.set({
      message: `사용자 검증 지연/실패, session user로 진행해요. (${mapSupabaseSessionError(error)})`,
      stage: 'getUser',
      status: 'fallback',
    });
    return session.user;
  }
}

function getLocalDevSession() {
  const storage = safeLocalStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(LOCAL_ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return buildSessionFromUser(parsed, 'local');
  } catch (error) {
    console.warn('[auth] failed to read local admin session', error);
    return null;
  }
}

function setLocalDevSession(user) {
  const storage = safeLocalStorage();
  if (!storage) return;

  try {
    storage.setItem(LOCAL_ADMIN_SESSION_STORAGE_KEY, JSON.stringify(user));
  } catch (error) {
    console.warn('[auth] failed to persist local admin session', error);
  }
}

function clearLocalDevSession() {
  const storage = safeLocalStorage();
  if (!storage) return;

  try {
    storage.removeItem(LOCAL_ADMIN_SESSION_STORAGE_KEY);
  } catch (error) {
    console.warn('[auth] failed to clear local admin session', error);
  }
}

function createLocalDevAdapter() {
  const localAdminAccounts = getLocalAdminAccounts();
  const diagnosticStore = createDiagnosticStore('local');

  return {
    availableAccounts: localAdminAccounts.map(({ email, name, password, role }) => ({
      email,
      name,
      password,
      role,
    })),
    devCredentialsHint: localAdminAccounts[0]
      ? {
          email: localAdminAccounts[0].email,
          password: localAdminAccounts[0].password,
        }
      : null,
    getDiagnostic: () => diagnosticStore.get(),
    mode: 'local',
    async getCurrentSession() {
      diagnosticStore.set({
        message: '로컬 세션 조회 완료',
        stage: 'getSession',
        status: 'success',
      });
      return getLocalDevSession();
    },
    onAuthStateChange(callback) {
      if (typeof window === 'undefined') {
        return () => {};
      }

      const handler = () => {
        callback(getLocalDevSession());
      };

      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
    async signInWithPassword({ email, password }) {
      const normalizedEmail = String(email || '')
        .trim()
        .toLowerCase();
      const matchedAccount = localAdminAccounts.find(
        (account) => account.email.toLowerCase() === normalizedEmail && account.password === String(password || ''),
      );

      if (!matchedAccount) {
        throw new Error('이메일 또는 비밀번호를 확인해 주세요.');
      }

      setLocalDevSession(matchedAccount);
      return buildSessionFromUser(matchedAccount, 'local');
    },
    async signOut() {
      clearLocalDevSession();
    },
  };
}

function createSupabaseAdapter() {
  const diagnosticStore = createDiagnosticStore('supabase');
  const getCurrentSession = async () => {
    const user = await getVerifiedSupabaseUser(diagnosticStore);
    return buildSessionFromUser(user, 'supabase');
  };

  return {
    availableAccounts: [],
    devCredentialsHint: null,
    getDiagnostic: () => diagnosticStore.get(),
    mode: 'supabase',
    getCurrentSession,
    onAuthStateChange(callback) {
      if (!supabase) return () => {};

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async () => {
        callback(await getCurrentSession());
      });

      return () => subscription.unsubscribe();
    },
    async signInWithPassword({ email, password }) {
      if (!supabase) {
        throw new Error('Supabase 인증 설정을 찾지 못했어요.');
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(mapSupabaseAuthError(error));
      }

      return getCurrentSession();
    },
    async signOut() {
      if (!supabase) return;

      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

export function createSessionAdapter() {
  // TODO(auth): next step should resolve admin roles from a protected server table + RLS,
  // not from client-side metadata or local overrides.
  return hasSupabaseEnv && supabase ? createSupabaseAdapter() : createLocalDevAdapter();
}
