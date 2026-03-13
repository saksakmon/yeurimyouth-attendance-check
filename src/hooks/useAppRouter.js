import * as React from 'react';
import { ADMIN_SECTION_PATHS, APP_PATHS, PATH_ADMIN_SECTION_MAP } from '../constants/app.js';

const { useCallback, useEffect, useState } = React;

function normalizePathname(pathname) {
  if (!pathname) return APP_PATHS.landing;
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function isKnownAdminPath(pathname) {
  const normalized = normalizePathname(pathname);
  return normalized === APP_PATHS.admin || Boolean(PATH_ADMIN_SECTION_MAP[normalized]);
}

export function resolveRouteFromLocation(locationLike = typeof window !== 'undefined' ? window.location : null) {
  const pathname = normalizePathname(locationLike?.pathname || APP_PATHS.landing);
  const searchParams = new URLSearchParams(locationLike?.search || '');
  const next = normalizePathname(searchParams.get('next') || '');
  const nextAdminPath = isKnownAdminPath(next) ? next : null;

  if (pathname === APP_PATHS.landing) {
    return {
      kind: 'landing',
      pathname,
      searchParams,
    };
  }

  if (pathname === APP_PATHS.kiosk) {
    return {
      kind: 'kiosk',
      pathname,
      searchParams,
    };
  }

  if (pathname === APP_PATHS.admin) {
    return {
      kind: 'adminEntry',
      nextAdminPath,
      pathname,
      searchParams,
    };
  }

  if (PATH_ADMIN_SECTION_MAP[pathname]) {
    return {
      adminSection: PATH_ADMIN_SECTION_MAP[pathname],
      kind: 'adminSection',
      pathname,
      searchParams,
    };
  }

  if (pathname.startsWith('/admin')) {
    return {
      kind: 'adminUnknown',
      pathname,
      searchParams,
    };
  }

  return {
    kind: 'unknown',
    pathname,
    searchParams,
  };
}

export function buildAdminEntryPath(nextPath = null) {
  const normalizedNextPath = normalizePathname(nextPath || '');
  if (!isKnownAdminPath(normalizedNextPath) || normalizedNextPath === APP_PATHS.admin) {
    return APP_PATHS.admin;
  }

  const params = new URLSearchParams();
  params.set('next', normalizedNextPath);
  return `${APP_PATHS.admin}?${params.toString()}`;
}

export function getDefaultAdminPath(canAccessAdminSection) {
  if (canAccessAdminSection('attendance')) return ADMIN_SECTION_PATHS.attendance;
  if (canAccessAdminSection('members')) return ADMIN_SECTION_PATHS.members;
  return APP_PATHS.admin;
}

export function useAppRouter() {
  const [route, setRoute] = useState(() => resolveRouteFromLocation());

  const syncRoute = useCallback(() => {
    setRoute(resolveRouteFromLocation());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [syncRoute]);

  const navigate = useCallback((to, options = {}) => {
    if (typeof window === 'undefined') return;

    const target = String(to || APP_PATHS.landing);
    const method = options.replace ? 'replaceState' : 'pushState';

    window.history[method]({}, '', target);
    setRoute(resolveRouteFromLocation(window.location));
  }, []);

  return {
    navigate,
    replace: (to) => navigate(to, { replace: true }),
    route,
  };
}
