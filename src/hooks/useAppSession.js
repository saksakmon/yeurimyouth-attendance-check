import * as React from 'react';
import {
  MOCK_SESSION,
  canAccessAdminSection,
  canAccessScreen,
  getAuditActorName,
  hasPermission,
} from '../auth/permissions.js';

const { useMemo, useState } = React;

export function useAppSession() {
  const [session] = useState(MOCK_SESSION);

  return useMemo(
    () => ({
      auditActorName: getAuditActorName(session),
      can: (permission) => hasPermission(session, permission),
      canAccessAdminSection: (section) => canAccessAdminSection(session, section),
      canAccessScreen: (screen) => canAccessScreen(session, screen),
      currentUser: session?.user || null,
      session,
    }),
    [session],
  );
}
