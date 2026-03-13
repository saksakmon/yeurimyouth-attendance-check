import { ROLES, normalizeRole } from './permissions.js';
import { hasSupabaseEnv, supabase } from '../lib/supabase.js';

const LOCAL_ADMIN_SESSION_STORAGE_KEY = 'yeurim-admin-local-session-v1';

const DEV_ADMIN_DEFAULTS = {
  email: import.meta.env.VITE_DEV_ADMIN_EMAIL || 'admin@example.com',
  name: import.meta.env.VITE_DEV_ADMIN_NAME || '운영 관리자',
  password: import.meta.env.VITE_DEV_ADMIN_PASSWORD || 'admin1234',
  role: normalizeRole(import.meta.env.VITE_DEV_ADMIN_ROLE) || ROLES.superAdmin,
};

function safeLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function parseRoleOverrides(rawValue) {
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([email, role]) => [String(email || '').trim().toLowerCase(), normalizeRole(role)])
        .filter(([, role]) => Boolean(role)),
    );
  } catch (error) {
    console.warn('[auth] failed to parse VITE_ADMIN_ROLE_OVERRIDES', error);
    return {};
  }
}

const ROLE_OVERRIDES = parseRoleOverrides(import.meta.env.VITE_ADMIN_ROLE_OVERRIDES);

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
  const email = String(user?.email || '')
    .trim()
    .toLowerCase();

  const candidates = [
    ROLE_OVERRIDES[email],
    user?.app_metadata?.admin_role,
    user?.app_metadata?.role,
    user?.user_metadata?.admin_role,
    user?.user_metadata?.role,
    user?.role,
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

async function getVerifiedSupabaseUser() {
  if (!supabase) return null;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.user) return null;

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.warn('[auth] getUser verification failed, falling back to session user', error.message);
      return session.user;
    }

    return user || session.user;
  } catch (error) {
    console.warn('[auth] getUser verification threw, falling back to session user', error);
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
  return {
    devCredentialsHint: {
      email: DEV_ADMIN_DEFAULTS.email,
      password: DEV_ADMIN_DEFAULTS.password,
    },
    mode: 'local',
    async getCurrentSession() {
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

      if (
        normalizedEmail !== DEV_ADMIN_DEFAULTS.email.toLowerCase() ||
        String(password || '') !== DEV_ADMIN_DEFAULTS.password
      ) {
        throw new Error('이메일 또는 비밀번호를 확인해 주세요.');
      }

      const user = {
        email: DEV_ADMIN_DEFAULTS.email,
        id: 'local-admin-user',
        name: DEV_ADMIN_DEFAULTS.name,
        role: DEV_ADMIN_DEFAULTS.role,
      };

      setLocalDevSession(user);
      return buildSessionFromUser(user, 'local');
    },
    async signOut() {
      clearLocalDevSession();
    },
  };
}

function createSupabaseAdapter() {
  const getCurrentSession = async () => {
    const user = await getVerifiedSupabaseUser();
    return buildSessionFromUser(user, 'supabase');
  };

  return {
    devCredentialsHint: null,
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
        throw new Error(error.message);
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
