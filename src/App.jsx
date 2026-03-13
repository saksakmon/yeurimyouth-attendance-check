import * as React from 'react';
import AdminDashboardScreen from './components/AdminDashboardScreen.jsx';
import AdminLoginScreen from './components/AdminLoginScreen.jsx';
import AttendanceKioskScreen from './components/AttendanceKioskScreen.jsx';
import PreAttendanceConfirmScreen from './components/PreAttendanceConfirmScreen.jsx';
import { ADMIN_SECTIONS, APP_SCREENS, ACCENT_COLOR } from './constants/app.js';
import { PERMISSIONS } from './auth/permissions.js';
import { getNameHighlightRange } from './domain/kiosk/search.js';
import { findNewcomerGroup } from './domain/members/memberHelpers.js';
import { useAdminAttendanceController } from './hooks/useAdminAttendanceController.js';
import { useAppBootstrapState } from './hooks/useAppBootstrapState.js';
import { useAppSession } from './hooks/useAppSession.js';
import { useKioskController } from './hooks/useKioskController.js';
import { useMemberDirectoryController } from './hooks/useMemberDirectoryController.js';
import { useResolvedMemberState } from './hooks/useResolvedMemberState.js';

const { useMemo, useState } = React;

export default function App() {
  const auth = useAppSession();
  const { actions: appActions, state: appState } = useAppBootstrapState();
  const [screen, setScreen] = useState(APP_SCREENS.preAttendanceConfirm);
  const [adminSection, setAdminSection] = useState(ADMIN_SECTIONS.attendance);

  const memberState = useResolvedMemberState({
    memberChangeHistory: appState.memberChangeHistory,
    members: appState.members,
  });
  const newcomerGroup = useMemo(() => findNewcomerGroup(appState.appBootstrap.groups), [appState.appBootstrap.groups]);
  const adminAccess = useMemo(
    () => ({
      canAccessMembers: auth.canAccessAdminSection(ADMIN_SECTIONS.members),
      canAccessSettings: auth.can(PERMISSIONS.settingsAccess),
      canCreateMembers: auth.can(PERMISSIONS.memberCreate),
      canViewAudit: auth.can(PERMISSIONS.auditView),
    }),
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
    if (!auth.isAuthenticated) {
      setScreen(APP_SCREENS.adminLogin);
      return;
    }

    if (!auth.canAccessScreen(APP_SCREENS.adminDashboard)) {
      appActions.setToast('관리자 권한이 없는 계정이에요');
      setScreen(APP_SCREENS.adminLogin);
      return;
    }

    setScreen(APP_SCREENS.adminDashboard);
  };

  const handleBackToKiosk = () => {
    if (!auth.canAccessScreen(APP_SCREENS.attendanceKiosk)) {
      appActions.setToast('키오스크 화면에 접근할 권한이 없어요');
      return;
    }

    setScreen(APP_SCREENS.attendanceKiosk);
  };

  const handleAdminSectionChange = (nextSection) => {
    if (!auth.canAccessAdminSection(nextSection)) {
      appActions.setToast('해당 메뉴에 접근할 권한이 없어요');
      return;
    }

    setAdminSection(nextSection);
    adminAttendance.actions.resetSectionState();
    memberDirectory.actions.resetSectionState();
  };

  const handleAdminSignOut = async () => {
    try {
      await auth.signOut();
      setAdminSection(ADMIN_SECTIONS.attendance);
      setScreen(APP_SCREENS.attendanceKiosk);
      adminAttendance.actions.resetSectionState();
      memberDirectory.actions.resetSectionState();
      appActions.setToast('로그아웃했어요');
    } catch (error) {
      console.error('[auth] sign out failed', error);
      appActions.setToast('로그아웃 중 오류가 발생했어요');
    }
  };

  React.useEffect(() => {
    if (screen === APP_SCREENS.adminDashboard && !auth.canAccessScreen(APP_SCREENS.adminDashboard)) {
      setScreen(APP_SCREENS.adminLogin);
    }
  }, [auth, screen]);

  React.useEffect(() => {
    if (screen !== APP_SCREENS.adminLogin) return;
    if (!auth.isAuthenticated) return;
    if (!auth.canAccessScreen(APP_SCREENS.adminDashboard)) return;

    setScreen(APP_SCREENS.adminDashboard);
  }, [auth, screen]);

  React.useEffect(() => {
    if (auth.canAccessAdminSection(adminSection)) return;
    setAdminSection(ADMIN_SECTIONS.attendance);
  }, [adminSection, auth]);

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

  if (screen === APP_SCREENS.preAttendanceConfirm) {
    return (
      <PreAttendanceConfirmScreen
        accentColor={ACCENT_COLOR}
        attendanceMeta={appState.appBootstrap.currentAttendanceMeta}
        onStart={() => setScreen(APP_SCREENS.attendanceKiosk)}
      />
    );
  }

  if (screen === APP_SCREENS.adminDashboard) {
    return (
      <AdminDashboardScreen
        activeSection={adminSection}
        accentColor={ACCENT_COLOR}
        access={adminAccess}
        addMember={memberDirectory.addMemberProps}
        bulkAction={adminAttendance.tableSelection.bulkAction}
        filters={adminAttendance.filtersProps}
        memberDirectory={memberDirectory.memberDirectoryProps}
        navigation={{
          activeSection: adminSection,
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

  if (screen === APP_SCREENS.adminLogin) {
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
