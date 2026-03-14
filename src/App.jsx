import * as React from 'react';
import AdminDashboardScreen from './components/AdminDashboardScreen.jsx';
import AdminLoginScreen from './components/AdminLoginScreen.jsx';
import AttendanceKioskScreen from './components/AttendanceKioskScreen.jsx';
import PreAttendanceConfirmScreen from './components/PreAttendanceConfirmScreen.jsx';
import { ADMIN_SECTIONS, ADMIN_SECTION_PATHS, APP_PATHS, APP_SCREENS, ACCENT_COLOR } from './constants/app.js';
import { PERMISSIONS } from './auth/permissions.js';
import { getNameHighlightRange } from './domain/kiosk/search.js';
import { findNewcomerGroup } from './domain/members/memberHelpers.js';
import { useAdminAttendanceController } from './hooks/useAdminAttendanceController.js';
import { useAppBootstrapState } from './hooks/useAppBootstrapState.js';
import { buildAdminEntryPath, getDefaultAdminPath, useAppRouter } from './hooks/useAppRouter.js';
import { useAppSession } from './hooks/useAppSession.js';
import { useKioskController } from './hooks/useKioskController.js';
import { useMemberDirectoryController } from './hooks/useMemberDirectoryController.js';
import { useResolvedMemberState } from './hooks/useResolvedMemberState.js';

const { useEffect, useMemo, useRef } = React;

export default function App() {
  const auth = useAppSession();
  const router = useAppRouter();
  const { actions: appActions, state: appState } = useAppBootstrapState(auth);

  const memberState = useResolvedMemberState({
    memberChangeHistory: appState.memberChangeHistory,
    members: appState.members,
  });
  const newcomerGroup = useMemo(() => findNewcomerGroup(appState.appBootstrap.groups), [appState.appBootstrap.groups]);
  const activeAdminSection = router.route.kind === 'adminSection' ? router.route.adminSection : ADMIN_SECTIONS.attendance;
  const previousAdminSectionRef = useRef(activeAdminSection);
  const adminAccess = useMemo(
    () => ({
      canAccessMembers: auth.canAccessAdminSection(ADMIN_SECTIONS.members),
      canAccessSettings: auth.can(PERMISSIONS.settingsAccess),
      canCreateMembers: auth.can(PERMISSIONS.memberCreate),
      canViewAudit: auth.can(PERMISSIONS.auditView),
    }),
    [auth],
  );
  const defaultAdminPath = useMemo(
    () => getDefaultAdminPath(auth.canAccessAdminSection),
    [auth],
  );

  const kiosk = useKioskController({
    appBootstrap: appState.appBootstrap,
    attendanceRecords: appState.attendanceRecords,
    applyAttendanceRecordState: appActions.applyAttendanceRecordState,
    currentActiveMembers: memberState.currentActiveMembers,
    groups: appState.appBootstrap.groups,
    members: appState.members,
    newcomerGroup,
    persistAttendanceTypeChange: appActions.persistAttendanceTypeChange,
    setNewcomerIntakes: appActions.setNewcomerIntakes,
    setToast: appActions.setToast,
    syncMembersAfterWrite: appActions.syncMembersAfterWrite,
  });

  const adminAttendance = useAdminAttendanceController({
    appBootstrap: appState.appBootstrap,
    attendanceRecords: appState.attendanceRecords,
    auth,
    memberChangeHistory: appState.memberChangeHistory,
    persistAttendanceTypeChange: appActions.persistAttendanceTypeChange,
    replaceAttendanceRecords: appActions.replaceAttendanceRecords,
    resolvedMembers: memberState.resolvedMembers,
    setToast: appActions.setToast,
  });

  const memberDirectory = useMemberDirectoryController({
    appBootstrap: appState.appBootstrap,
    appendMemberHistoryEntries: appActions.appendMemberHistoryEntries,
    auth,
    clearConfirmTargetForMembers: kiosk.actions.clearConfirmTargetForMembers,
    memberChangeHistory: appState.memberChangeHistory,
    members: appState.members,
    membersById: memberState.membersById,
    persistedActiveMembers: memberState.persistedActiveMembers,
    resolvedMembers: memberState.resolvedMembers,
    setNewcomerIntakes: appActions.setNewcomerIntakes,
    setToast: appActions.setToast,
    syncMembersAfterWrite: appActions.syncMembersAfterWrite,
  });

  const handleOpenAdmin = () => {
    router.navigate(APP_PATHS.admin);
  };

  const handleBackToKiosk = () => {
    if (!auth.canAccessScreen(APP_SCREENS.attendanceKiosk)) {
      appActions.setToast('키오스크 화면에 접근할 권한이 없어요');
      return;
    }

    router.navigate(APP_PATHS.kiosk);
  };

  const handleAdminSectionChange = (nextSection) => {
    if (!auth.canAccessAdminSection(nextSection)) {
      appActions.setToast('해당 메뉴에 접근할 권한이 없어요');
      return;
    }

    router.navigate(ADMIN_SECTION_PATHS[nextSection]);
  };

  const handleAdminSignOut = async () => {
    try {
      await auth.signOut();
      adminAttendance.actions.resetSectionState();
      memberDirectory.actions.resetSectionState();
      router.navigate(APP_PATHS.kiosk);
      appActions.setToast('로그아웃했어요');
    } catch (error) {
      console.error('[auth] sign out failed', error);
      appActions.setToast('로그아웃 중 오류가 발생했어요');
    }
  };

  useEffect(() => {
    const nextAdminSection = router.route.kind === 'adminSection' ? router.route.adminSection : null;
    const previousSection = previousAdminSectionRef.current;

    if (nextAdminSection && nextAdminSection !== previousSection) {
      adminAttendance.actions.resetSectionState();
      memberDirectory.actions.resetSectionState();
    }

    previousAdminSectionRef.current = nextAdminSection;
  }, [adminAttendance.actions, memberDirectory.actions, router.route.adminSection, router.route.kind]);

  useEffect(() => {
    if (router.route.kind === 'unknown') {
      router.replace(APP_PATHS.landing);
      return;
    }

    if (router.route.kind === 'adminUnknown') {
      router.replace(APP_PATHS.admin);
      return;
    }

    if (router.route.kind === 'adminSection' && !auth.isAuthenticated) {
      router.replace(buildAdminEntryPath(router.route.pathname));
      return;
    }

    if (router.route.kind === 'adminSection' && auth.isAuthenticated && !auth.canAccessScreen(APP_SCREENS.adminDashboard)) {
      appActions.setToast('관리자 권한이 없는 계정이에요');
      router.replace(APP_PATHS.admin);
      return;
    }

    if (
      router.route.kind === 'adminSection' &&
      auth.isAuthenticated &&
      auth.canAccessScreen(APP_SCREENS.adminDashboard) &&
      !auth.canAccessAdminSection(router.route.adminSection)
    ) {
      appActions.setToast('해당 메뉴에 접근할 권한이 없어요');
      router.replace(defaultAdminPath);
      return;
    }

    if (router.route.kind === 'adminEntry' && auth.isAuthenticated && auth.canAccessScreen(APP_SCREENS.adminDashboard)) {
      const intendedPath =
        router.route.nextAdminPath && Object.values(ADMIN_SECTION_PATHS).includes(router.route.nextAdminPath)
          ? router.route.nextAdminPath
          : defaultAdminPath;
      router.replace(intendedPath);
    }
  }, [
    appActions.setToast,
    auth,
    defaultAdminPath,
    router,
  ]);

  const renderName = (member) => {
    const highlightRange = getNameHighlightRange(member, kiosk.state.query);
    const start = highlightRange?.start ?? -1;
    const end = start + (highlightRange?.length ?? 0);

    return (
      <>
        {member.name.split('').map((letter, index) => (
          <span
            key={`${member.id}-${letter}-${index}`}
            style={index >= start && index < end ? { color: ACCENT_COLOR } : undefined}
          >
            {letter}
          </span>
        ))}
        {member.nameSuffix ? <span>{member.nameSuffix}</span> : null}
        {member.groupName ? <span className="ml-3 text-black/25 font-medium">{member.groupName}</span> : null}
      </>
    );
  };

  if (router.route.kind === 'landing') {
    return (
      <PreAttendanceConfirmScreen
        accentColor={ACCENT_COLOR}
        attendanceMeta={appState.appBootstrap.currentAttendanceMeta}
        onStart={() => router.navigate(APP_PATHS.kiosk)}
      />
    );
  }

  if (
    router.route.kind === 'adminSection' &&
    auth.isAuthenticated &&
    auth.canAccessScreen(APP_SCREENS.adminDashboard) &&
    auth.canAccessAdminSection(router.route.adminSection)
  ) {
    return (
      <AdminDashboardScreen
        activeSection={activeAdminSection}
        accentColor={ACCENT_COLOR}
        access={adminAccess}
        addMember={memberDirectory.addMemberProps}
        bulkAction={adminAttendance.tableSelection.bulkAction}
        filters={adminAttendance.filtersProps}
        memberDirectory={memberDirectory.memberDirectoryProps}
        navigation={{
          activeSection: activeAdminSection,
          canAccessMembers: adminAccess.canAccessMembers,
          canAccessSettings: adminAccess.canAccessSettings,
          currentUser: auth.currentUser,
          isSigningOut: auth.isSigningOut,
          onBackToKiosk: handleBackToKiosk,
          onComingSoon: () => appActions.setToast('잘 써준다면 더 만들어볼게^^'),
          onSectionChange: handleAdminSectionChange,
          onSignOut: handleAdminSignOut,
          roleLabel: auth.roleLabel,
        }}
        summary={adminAttendance.adminSummary}
        table={adminAttendance.tableProps}
        threeWeekAbsence={adminAttendance.threeWeekAbsence}
        toast={appState.toast}
      />
    );
  }

  if (router.route.kind === 'adminEntry' || router.route.kind === 'adminSection' || router.route.kind === 'adminUnknown') {
    return <AdminLoginScreen accentColor={ACCENT_COLOR} auth={auth} onBackToKiosk={handleBackToKiosk} />;
  }

  return (
    <AttendanceKioskScreen
      accentColor={ACCENT_COLOR}
      attendance={kiosk.state.attendanceMap}
      attendanceCount={kiosk.state.attendanceCount}
      attendanceMeta={appState.appBootstrap.currentAttendanceMeta}
      attendanceRate={kiosk.state.attendanceRate}
      canRegisterNewMember={kiosk.state.canRegisterNewMember}
      confirmTarget={kiosk.state.confirmTarget}
      filtered={kiosk.state.filtered}
      newMemberName={kiosk.state.newMemberName}
      newMemberStatus={kiosk.state.newMemberStatus}
      onBackspace={kiosk.actions.tapBackspace}
      onCloseNewMemberModal={kiosk.actions.closeNewMemberModal}
      onConfirmAttendance={kiosk.actions.confirmAttendance}
      onKeyTap={kiosk.actions.tapKey}
      onNewMemberNameChange={kiosk.actions.setNewMemberName}
      onNewMemberStatusChange={kiosk.actions.setNewMemberStatus}
      onOpenAdmin={handleOpenAdmin}
      onOpenNewMemberModal={kiosk.actions.openNewMemberModal}
      onRegisterNewMember={kiosk.actions.registerNewMember}
      onReset={kiosk.actions.tapReset}
      onSelectConfirmTarget={kiosk.actions.selectConfirmTarget}
      query={kiosk.state.query}
      renderName={renderName}
      resultState={kiosk.state.resultState}
      showNewMemberModal={kiosk.state.showNewMemberModal}
      toast={appState.toast}
      totalMemberCount={kiosk.state.totalMemberCount}
    />
  );
}
