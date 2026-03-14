import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function decodeBase64Url(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padded, 'base64').toString('utf8');
  }

  return null;
}

function getSupabaseKeyRole(apiKey) {
  const [, payload] = String(apiKey || '').split('.');
  if (!payload) return null;

  try {
    return JSON.parse(decodeBase64Url(payload) || '{}')?.role || null;
  } catch (error) {
    console.warn('[supabase] failed to inspect browser key role', error);
    return null;
  }
}

const supabaseBrowserKeyRole = getSupabaseKeyRole(supabaseAnonKey);
const isBrowserKeySafe = supabaseBrowserKeyRole !== 'service_role';

if (supabaseUrl && supabaseAnonKey && !isBrowserKeySafe) {
  console.error('[supabase] refusing to initialize the browser client with a service_role key');
}

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey && isBrowserKeySafe);

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        storageKey: 'yeurim-admin-auth',
      },
    })
  : null;
