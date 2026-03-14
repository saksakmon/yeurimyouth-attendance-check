import { createClient } from '@supabase/supabase-js';
import {
  createServiceRoleClient,
  ensureAdminAccounts,
  getAdminAccounts,
} from './lib/adminAccounts.mjs';

const HELP_TEXT = `
Usage:
  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-rls.mjs

Required env:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY

Optional admin account env:
  ADMIN_SUPER_EMAIL / ADMIN_SUPER_PASSWORD
  ADMIN_ADMIN_EMAIL / ADMIN_ADMIN_PASSWORD
  ADMIN_LEADER_EMAIL / ADMIN_LEADER_PASSWORD

This script:
  1. Ensures known super_admin/admin/leader auth users exist
  2. Uses service_role to create disposable fixtures
  3. Signs in as each role plus anon and checks RLS allow/deny behavior
  4. Cleans up fixtures best-effort
`;

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function createBrowserClient(supabaseUrl, supabaseKey) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function isoDateOffset(daysFromNow) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function createHistoryId(prefix, label) {
  return `${prefix}-${label}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildTestMemberPayload({ groupId, isActive = true, memberType = 'registered', name }) {
  return {
    created_at: new Date().toISOString(),
    group_id: groupId,
    is_active: isActive,
    member_type: memberType,
    name,
    updated_at: new Date().toISOString(),
  };
}

function extractIds(rows) {
  return (rows || []).map((row) => row.id).filter(Boolean);
}

class ChecklistRunner {
  constructor() {
    this.failures = [];
    this.passes = [];
  }

  pass(label, details = '') {
    this.passes.push({ details, label });
    console.info(`PASS ${label}${details ? ` :: ${details}` : ''}`);
  }

  fail(label, details = '') {
    this.failures.push({ details, label });
    console.error(`FAIL ${label}${details ? ` :: ${details}` : ''}`);
  }

  summary() {
    console.info('');
    console.info(`RLS verification summary: ${this.passes.length} passed, ${this.failures.length} failed`);

    if (this.failures.length > 0) {
      console.info('');
      console.info('Failed checks');
      this.failures.forEach((entry) => {
        console.info(`- ${entry.label}${entry.details ? ` :: ${entry.details}` : ''}`);
      });
    }
  }
}

async function ensurePreflightReferences(service, tracker, prefix) {
  const regularGroupResult = await service
    .from('groups')
    .select('id, name, group_type')
    .eq('group_type', 'regular')
    .limit(1);

  if (regularGroupResult.error) {
    throw new Error(`[verify-rls] failed to load regular group: ${regularGroupResult.error.message}`);
  }

  const newcomerGroupResult = await service
    .from('groups')
    .select('id, name, group_type')
    .eq('group_type', 'newcomer')
    .limit(1);

  if (newcomerGroupResult.error) {
    throw new Error(`[verify-rls] failed to load newcomer group: ${newcomerGroupResult.error.message}`);
  }

  const currentWeekResult = await service
    .from('attendance_weeks')
    .select('id, week_key, sunday_date, label, is_current')
    .eq('is_current', true)
    .limit(1);

  if (currentWeekResult.error) {
    throw new Error(`[verify-rls] failed to load current attendance week: ${currentWeekResult.error.message}`);
  }

  const pastWeekResult = await service
    .from('attendance_weeks')
    .select('id, week_key, sunday_date, label, is_current')
    .eq('is_current', false)
    .order('sunday_date', { ascending: false })
    .limit(1);

  if (pastWeekResult.error) {
    throw new Error(`[verify-rls] failed to load past attendance week: ${pastWeekResult.error.message}`);
  }

  const regularGroup = regularGroupResult.data?.[0] || null;
  const newcomerGroup = newcomerGroupResult.data?.[0] || null;
  const currentWeek = currentWeekResult.data?.[0] || null;
  let pastWeek = pastWeekResult.data?.[0] || null;

  if (!regularGroup) {
    throw new Error('[verify-rls] missing regular group. Seed at least one groups row with group_type=regular.');
  }

  if (!newcomerGroup) {
    throw new Error('[verify-rls] missing newcomer group. Seed at least one groups row with group_type=newcomer.');
  }

  if (!currentWeek) {
    throw new Error('[verify-rls] missing current attendance week. Seed one attendance_weeks row with is_current=true.');
  }

  if (!pastWeek) {
    const insertedPastWeek = await service
      .from('attendance_weeks')
      .insert({
        created_at: new Date().toISOString(),
        is_current: false,
        label: 'RLS Check Past Week',
        sunday_date: isoDateOffset(-7),
        week_key: `rls-check-${prefix}-past`,
      })
      .select('id, week_key, sunday_date, label, is_current')
      .single();

    if (insertedPastWeek.error) {
      throw new Error(
        `[verify-rls] missing past attendance week and failed to insert one: ${insertedPastWeek.error.message}`,
      );
    }

    pastWeek = insertedPastWeek.data;
    tracker.attendanceWeeks.push(pastWeek.id);
  }

  return {
    currentWeek,
    newcomerGroup,
    pastWeek,
    regularGroup,
  };
}

async function createFixtureMembers(service, tracker, refs, prefix) {
  const payload = [
    buildTestMemberPayload({
      groupId: refs.regularGroup.id,
      isActive: true,
      name: `RLS Active ${prefix}`,
    }),
    buildTestMemberPayload({
      groupId: refs.regularGroup.id,
      isActive: false,
      name: `RLS Inactive ${prefix}`,
    }),
    buildTestMemberPayload({
      groupId: refs.newcomerGroup.id,
      isActive: true,
      memberType: 'visitor',
      name: `RLS Newcomer ${prefix}`,
    }),
    buildTestMemberPayload({
      groupId: refs.regularGroup.id,
      isActive: true,
      name: `RLS Super Write ${prefix}`,
    }),
    buildTestMemberPayload({
      groupId: refs.regularGroup.id,
      isActive: true,
      name: `RLS Admin Write ${prefix}`,
    }),
    buildTestMemberPayload({
      groupId: refs.regularGroup.id,
      isActive: true,
      name: `RLS Leader Write ${prefix}`,
    }),
    buildTestMemberPayload({
      groupId: refs.regularGroup.id,
      isActive: true,
      name: `RLS Anon Write ${prefix}`,
    }),
  ];

  const inserted = await service
    .from('members')
    .insert(payload)
    .select('id, name, group_id, is_active, member_type, created_at, updated_at');

  if (inserted.error) {
    throw new Error(`[verify-rls] failed to create fixture members: ${inserted.error.message}`);
  }

  tracker.members.push(...extractIds(inserted.data));

  const [
    activeMember,
    inactiveMember,
    newcomerMember,
    superWriteMember,
    adminWriteMember,
    leaderWriteMember,
    anonWriteMember,
  ] = inserted.data || [];

  return {
    activeMember,
    adminWriteMember,
    anonWriteMember,
    inactiveMember,
    leaderWriteMember,
    newcomerMember,
    superWriteMember,
  };
}

async function createFixtureAttendance(service, tracker, refs, members, prefix) {
  const inserted = await service
    .from('attendance_records')
    .insert([
      {
        attendance_type: 'youth',
        attendance_week_id: refs.currentWeek.id,
        attended_at: new Date().toISOString(),
        member_id: members.activeMember.id,
        note: null,
        source: 'admin',
      },
      {
        attendance_type: 'youth',
        attendance_week_id: refs.currentWeek.id,
        attended_at: new Date().toISOString(),
        member_id: members.inactiveMember.id,
        note: null,
        source: 'admin',
      },
      {
        attendance_type: 'adult',
        attendance_week_id: refs.pastWeek.id,
        attended_at: new Date().toISOString(),
        member_id: members.activeMember.id,
        note: null,
        source: 'admin',
      },
    ])
    .select('id, member_id, attendance_week_id, attendance_type, source');

  if (inserted.error) {
    throw new Error(`[verify-rls] failed to create fixture attendance records: ${inserted.error.message}`);
  }

  tracker.attendanceRecords.push(...extractIds(inserted.data));

  const [currentActiveRecord, currentInactiveRecord, pastActiveRecord] = inserted.data || [];
  return {
    currentActiveRecord,
    currentInactiveRecord,
    pastActiveRecord,
  };
}

async function createFixtureHistory(service, tracker, members, prefix) {
  const inserted = await service
    .from('member_change_history')
    .insert({
      action_label: 'RLS Fixture',
      changed_at: new Date().toISOString(),
      changed_by: 'RLS Verifier',
      content: 'Fixture history row',
      id: createHistoryId(prefix, 'fixture'),
      kind: 'edit',
      member_id: members.activeMember.id,
      next_is_active: true,
    })
    .select('id, member_id')
    .single();

  if (inserted.error) {
    throw new Error(`[verify-rls] failed to create fixture member history: ${inserted.error.message}`);
  }

  tracker.memberChangeHistory.push(inserted.data.id);
  return inserted.data;
}

async function signInRoleClient({ account, supabaseAnonKey, supabaseUrl }) {
  const client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });

  if (error) {
    throw new Error(`[verify-rls] sign-in failed for ${account.role}: ${error.message}`);
  }

  return client;
}

function describeError(error) {
  return error?.message || error?.code || 'unknown error';
}

function rowsContainAll(rows, ids) {
  const actualIds = new Set(extractIds(rows));
  return ids.every((id) => actualIds.has(id));
}

function rowsContainNone(rows, ids) {
  const actualIds = new Set(extractIds(rows));
  return ids.every((id) => !actualIds.has(id));
}

async function expectAllowedSelect(runner, label, queryPromise, expectedIds) {
  const { data, error } = await queryPromise;

  if (error) {
    runner.fail(label, describeError(error));
    return;
  }

  if (!rowsContainAll(data, expectedIds)) {
    runner.fail(label, `expected ids ${expectedIds.join(', ')} to be visible`);
    return;
  }

  runner.pass(label);
}

async function expectBlockedOrHiddenSelect(runner, label, queryPromise, blockedIds) {
  const { data, error } = await queryPromise;

  if (error) {
    runner.pass(label, `blocked with ${describeError(error)}`);
    return;
  }

  if (rowsContainNone(data, blockedIds)) {
    runner.pass(label, 'rows hidden by policy');
    return;
  }

  runner.fail(label, `unexpectedly returned blocked ids ${blockedIds.join(', ')}`);
}

async function expectAllowedWrite(runner, label, promiseFactory, tracker, trackerKey) {
  const { data, error } = await promiseFactory();

  if (error) {
    runner.fail(label, describeError(error));
    return null;
  }

  const ids = extractIds(Array.isArray(data) ? data : [data]);
  if (ids.length > 0) {
    tracker[trackerKey].push(...ids);
  }

  runner.pass(label);
  return data;
}

async function expectBlockedWrite(runner, label, promiseFactory, tracker, trackerKey) {
  const { data, error } = await promiseFactory();

  if (error) {
    runner.pass(label, `blocked with ${describeError(error)}`);
    return;
  }

  const ids = extractIds(Array.isArray(data) ? data : [data]);
  if (ids.length > 0) {
    tracker[trackerKey].push(...ids);
    runner.fail(label, 'write succeeded but should have been blocked');
    return;
  }

  runner.pass(label, 'write returned no rows');
}

async function cleanupFixtures(service, tracker) {
  const cleanupPlan = [
    ['member_change_history', tracker.memberChangeHistory],
    ['attendance_records', tracker.attendanceRecords],
    ['members', tracker.members],
    ['attendance_weeks', tracker.attendanceWeeks],
  ];

  for (const [table, ids] of cleanupPlan) {
    if (!ids.length) continue;

    const { error } = await service.from(table).delete().in('id', ids);
    if (error) {
      console.warn(`[verify-rls] cleanup warning for ${table}: ${error.message}`);
    }
  }
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.info(HELP_TEXT.trim());
    return;
  }

  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    console.error(`[verify-rls] missing env: ${missingEnv.join(', ')}`);
    console.error('');
    console.error(HELP_TEXT.trim());
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accounts = getAdminAccounts(process.env);
  const service = createServiceRoleClient({ serviceRoleKey, supabaseUrl });
  const anon = createBrowserClient(supabaseUrl, supabaseAnonKey);
  const prefix = `rls-${Date.now().toString(36)}`;
  const runner = new ChecklistRunner();
  const tracker = {
    attendanceRecords: [],
    attendanceWeeks: [],
    memberChangeHistory: [],
    members: [],
  };

  let roleClients = null;

  try {
    console.info('[verify-rls] ensuring test admin accounts...');
    await ensureAdminAccounts(service, accounts);

    console.info('[verify-rls] loading references and creating fixtures...');
    const refs = await ensurePreflightReferences(service, tracker, prefix);
    const members = await createFixtureMembers(service, tracker, refs, prefix);
    const attendance = await createFixtureAttendance(service, tracker, refs, members, prefix);
    const fixtureHistory = await createFixtureHistory(service, tracker, members, prefix);

    console.info('[verify-rls] signing in role clients...');
    roleClients = {
      super_admin: await signInRoleClient({
        account: accounts.find((entry) => entry.role === 'super_admin'),
        supabaseAnonKey,
        supabaseUrl,
      }),
      admin: await signInRoleClient({
        account: accounts.find((entry) => entry.role === 'admin'),
        supabaseAnonKey,
        supabaseUrl,
      }),
      leader: await signInRoleClient({
        account: accounts.find((entry) => entry.role === 'leader'),
        supabaseAnonKey,
        supabaseUrl,
      }),
      anon,
    };

    const fixtureGroupIds = [refs.regularGroup.id, refs.newcomerGroup.id];
    const fixtureWeekIds = [refs.currentWeek.id, refs.pastWeek.id];
    const adminVisibleMemberIds = [members.activeMember.id, members.inactiveMember.id, members.newcomerMember.id];
    const limitedMemberIds = [members.activeMember.id, members.newcomerMember.id];
    const currentVisibleRecordIds = [attendance.currentActiveRecord.id];
    const adminVisibleRecordIds = [
      attendance.currentActiveRecord.id,
      attendance.currentInactiveRecord.id,
      attendance.pastActiveRecord.id,
    ];

    await expectAllowedSelect(
      runner,
      'super_admin can read groups',
      roleClients.super_admin.from('groups').select('id').in('id', fixtureGroupIds),
      fixtureGroupIds,
    );
    await expectAllowedSelect(
      runner,
      'admin can read groups',
      roleClients.admin.from('groups').select('id').in('id', fixtureGroupIds),
      fixtureGroupIds,
    );
    await expectAllowedSelect(
      runner,
      'leader can read groups',
      roleClients.leader.from('groups').select('id').in('id', fixtureGroupIds),
      fixtureGroupIds,
    );
    await expectAllowedSelect(
      runner,
      'anon can read groups',
      roleClients.anon.from('groups').select('id').in('id', fixtureGroupIds),
      fixtureGroupIds,
    );

    await expectAllowedSelect(
      runner,
      'super_admin can read attendance_weeks',
      roleClients.super_admin.from('attendance_weeks').select('id').in('id', fixtureWeekIds),
      fixtureWeekIds,
    );
    await expectAllowedSelect(
      runner,
      'admin can read attendance_weeks',
      roleClients.admin.from('attendance_weeks').select('id').in('id', fixtureWeekIds),
      fixtureWeekIds,
    );
    await expectAllowedSelect(
      runner,
      'leader can read attendance_weeks',
      roleClients.leader.from('attendance_weeks').select('id').in('id', fixtureWeekIds),
      fixtureWeekIds,
    );
    await expectAllowedSelect(
      runner,
      'anon can read current attendance_week',
      roleClients.anon.from('attendance_weeks').select('id').eq('id', refs.currentWeek.id),
      [refs.currentWeek.id],
    );
    await expectBlockedOrHiddenSelect(
      runner,
      'anon cannot read past attendance_week',
      roleClients.anon.from('attendance_weeks').select('id').eq('id', refs.pastWeek.id),
      [refs.pastWeek.id],
    );

    await expectAllowedSelect(
      runner,
      'super_admin can read active and inactive members',
      roleClients.super_admin.from('members').select('id').in('id', adminVisibleMemberIds),
      adminVisibleMemberIds,
    );
    await expectAllowedSelect(
      runner,
      'admin can read active and inactive members',
      roleClients.admin.from('members').select('id').in('id', adminVisibleMemberIds),
      adminVisibleMemberIds,
    );
    await expectAllowedSelect(
      runner,
      'leader can read active members used for attendance',
      roleClients.leader.from('members').select('id').in('id', limitedMemberIds),
      limitedMemberIds,
    );
    await expectBlockedOrHiddenSelect(
      runner,
      'leader cannot read inactive members',
      roleClients.leader.from('members').select('id').eq('id', members.inactiveMember.id),
      [members.inactiveMember.id],
    );
    await expectAllowedSelect(
      runner,
      'anon can read active members for kiosk',
      roleClients.anon.from('members').select('id').in('id', limitedMemberIds),
      limitedMemberIds,
    );
    await expectBlockedOrHiddenSelect(
      runner,
      'anon cannot read inactive members',
      roleClients.anon.from('members').select('id').eq('id', members.inactiveMember.id),
      [members.inactiveMember.id],
    );

    await expectAllowedWrite(
      runner,
      'super_admin can insert members',
      () =>
        roleClients.super_admin
          .from('members')
          .insert(
            buildTestMemberPayload({
              groupId: refs.regularGroup.id,
              name: `RLS Super Insert ${prefix}`,
            }),
          )
          .select('id')
          .single(),
      tracker,
      'members',
    );
    await expectAllowedWrite(
      runner,
      'admin can insert members',
      () =>
        roleClients.admin
          .from('members')
          .insert(
            buildTestMemberPayload({
              groupId: refs.regularGroup.id,
              name: `RLS Admin Insert ${prefix}`,
            }),
          )
          .select('id')
          .single(),
      tracker,
      'members',
    );
    await expectBlockedWrite(
      runner,
      'leader cannot insert members',
      () =>
        roleClients.leader
          .from('members')
          .insert(
            buildTestMemberPayload({
              groupId: refs.regularGroup.id,
              name: `RLS Leader Blocked ${prefix}`,
            }),
          )
          .select('id')
          .single(),
      tracker,
      'members',
    );
    await expectAllowedWrite(
      runner,
      'anon can insert newcomer members only',
      () =>
        roleClients.anon
          .from('members')
          .insert(
            buildTestMemberPayload({
              groupId: refs.newcomerGroup.id,
              memberType: 'visitor',
              name: `RLS Anon Newcomer ${prefix}`,
            }),
          )
          .select('id')
          .single(),
      tracker,
      'members',
    );
    await expectBlockedWrite(
      runner,
      'anon cannot insert regular-group members',
      () =>
        roleClients.anon
          .from('members')
          .insert(
            buildTestMemberPayload({
              groupId: refs.regularGroup.id,
              name: `RLS Anon Blocked ${prefix}`,
            }),
          )
          .select('id')
          .single(),
      tracker,
      'members',
    );

    await expectAllowedWrite(
      runner,
      'super_admin can update members',
      () =>
        roleClients.super_admin
          .from('members')
          .update({
            name: `RLS Super Updated ${prefix}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', members.activeMember.id)
          .select('id')
          .single(),
      tracker,
      'members',
    );
    await expectAllowedWrite(
      runner,
      'admin can update members',
      () =>
        roleClients.admin
          .from('members')
          .update({
            name: `RLS Admin Updated ${prefix}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', members.activeMember.id)
          .select('id')
          .single(),
      tracker,
      'members',
    );
    await expectBlockedWrite(
      runner,
      'leader cannot update members',
      () =>
        roleClients.leader
          .from('members')
          .update({
            name: `RLS Leader Updated ${prefix}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', members.activeMember.id)
          .select('id')
          .single(),
      tracker,
      'members',
    );
    await expectBlockedWrite(
      runner,
      'anon cannot update members',
      () =>
        roleClients.anon
          .from('members')
          .update({
            name: `RLS Anon Updated ${prefix}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', members.activeMember.id)
          .select('id')
          .single(),
      tracker,
      'members',
    );

    await expectAllowedSelect(
      runner,
      'super_admin can read attendance_records',
      roleClients.super_admin.from('attendance_records').select('id').in('id', adminVisibleRecordIds),
      adminVisibleRecordIds,
    );
    await expectAllowedSelect(
      runner,
      'admin can read attendance_records',
      roleClients.admin.from('attendance_records').select('id').in('id', adminVisibleRecordIds),
      adminVisibleRecordIds,
    );
    await expectAllowedSelect(
      runner,
      'leader can read attendance_records',
      roleClients.leader.from('attendance_records').select('id').in('id', adminVisibleRecordIds),
      adminVisibleRecordIds,
    );
    await expectAllowedSelect(
      runner,
      'anon can read current attendance for active members',
      roleClients.anon.from('attendance_records').select('id').in('id', currentVisibleRecordIds),
      currentVisibleRecordIds,
    );
    await expectBlockedOrHiddenSelect(
      runner,
      'anon cannot read past attendance_records',
      roleClients.anon.from('attendance_records').select('id').eq('id', attendance.pastActiveRecord.id),
      [attendance.pastActiveRecord.id],
    );
    await expectBlockedOrHiddenSelect(
      runner,
      'anon cannot read current attendance for inactive members',
      roleClients.anon.from('attendance_records').select('id').eq('id', attendance.currentInactiveRecord.id),
      [attendance.currentInactiveRecord.id],
    );

    await expectAllowedWrite(
      runner,
      'super_admin can insert attendance_records',
      () =>
        roleClients.super_admin
          .from('attendance_records')
          .insert({
            attendance_type: 'adult',
            attendance_week_id: refs.pastWeek.id,
            attended_at: new Date().toISOString(),
            member_id: members.superWriteMember.id,
            note: null,
            source: 'admin',
          })
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectAllowedWrite(
      runner,
      'admin can insert attendance_records',
      () =>
        roleClients.admin
          .from('attendance_records')
          .insert({
            attendance_type: 'adult',
            attendance_week_id: refs.pastWeek.id,
            attended_at: new Date().toISOString(),
            member_id: members.adminWriteMember.id,
            note: null,
            source: 'admin',
          })
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectAllowedWrite(
      runner,
      'leader can insert attendance_records',
      () =>
        roleClients.leader
          .from('attendance_records')
          .insert({
            attendance_type: 'adult',
            attendance_week_id: refs.pastWeek.id,
            attended_at: new Date().toISOString(),
            member_id: members.leaderWriteMember.id,
            note: null,
            source: 'admin',
          })
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectAllowedWrite(
      runner,
      'anon can insert kiosk attendance only for current active members',
      () =>
        roleClients.anon
          .from('attendance_records')
          .insert({
            attendance_type: 'youth',
            attendance_week_id: refs.currentWeek.id,
            attended_at: new Date().toISOString(),
            member_id: members.anonWriteMember.id,
            note: null,
            source: 'kiosk',
          })
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectBlockedWrite(
      runner,
      'anon cannot insert past-week attendance_records',
      () =>
        roleClients.anon
          .from('attendance_records')
          .insert({
            attendance_type: 'youth',
            attendance_week_id: refs.pastWeek.id,
            attended_at: new Date().toISOString(),
            member_id: members.anonWriteMember.id,
            note: null,
            source: 'kiosk',
          })
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectBlockedWrite(
      runner,
      'anon cannot insert admin-sourced attendance_records',
      () =>
        roleClients.anon
          .from('attendance_records')
          .insert({
            attendance_type: 'youth',
            attendance_week_id: refs.currentWeek.id,
            attended_at: new Date().toISOString(),
            member_id: members.anonWriteMember.id,
            note: null,
            source: 'admin',
          })
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );

    await expectAllowedWrite(
      runner,
      'super_admin can update attendance_records',
      () =>
        roleClients.super_admin
          .from('attendance_records')
          .update({
            attendance_type: 'adult',
            updated_at: new Date().toISOString(),
          })
          .eq('id', attendance.currentActiveRecord.id)
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectAllowedWrite(
      runner,
      'admin can update attendance_records',
      () =>
        roleClients.admin
          .from('attendance_records')
          .update({
            attendance_type: 'youth',
            updated_at: new Date().toISOString(),
          })
          .eq('id', attendance.currentActiveRecord.id)
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectAllowedWrite(
      runner,
      'leader can update attendance_records',
      () =>
        roleClients.leader
          .from('attendance_records')
          .update({
            attendance_type: 'adult',
            updated_at: new Date().toISOString(),
          })
          .eq('id', attendance.currentActiveRecord.id)
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectAllowedWrite(
      runner,
      'anon can update kiosk attendance within current active scope',
      () =>
        roleClients.anon
          .from('attendance_records')
          .update({
            attendance_type: 'youth',
            note: null,
            source: 'kiosk',
            updated_at: new Date().toISOString(),
          })
          .eq('id', attendance.currentActiveRecord.id)
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );
    await expectBlockedWrite(
      runner,
      'anon cannot update attendance_records outside kiosk rules',
      () =>
        roleClients.anon
          .from('attendance_records')
          .update({
            attendance_type: 'adult',
            source: 'admin',
            updated_at: new Date().toISOString(),
          })
          .eq('id', attendance.currentActiveRecord.id)
          .select('id')
          .single(),
      tracker,
      'attendanceRecords',
    );

    await expectAllowedSelect(
      runner,
      'super_admin can read member_change_history',
      roleClients.super_admin.from('member_change_history').select('id').eq('id', fixtureHistory.id),
      [fixtureHistory.id],
    );
    await expectAllowedSelect(
      runner,
      'admin can read member_change_history',
      roleClients.admin.from('member_change_history').select('id').eq('id', fixtureHistory.id),
      [fixtureHistory.id],
    );
    await expectBlockedOrHiddenSelect(
      runner,
      'leader cannot read member_change_history',
      roleClients.leader.from('member_change_history').select('id').eq('id', fixtureHistory.id),
      [fixtureHistory.id],
    );
    await expectBlockedOrHiddenSelect(
      runner,
      'anon cannot read member_change_history',
      roleClients.anon.from('member_change_history').select('id').eq('id', fixtureHistory.id),
      [fixtureHistory.id],
    );

    await expectAllowedWrite(
      runner,
      'super_admin can insert member_change_history',
      () =>
        roleClients.super_admin
          .from('member_change_history')
          .insert({
            action_label: 'RLS Super History',
            changed_at: new Date().toISOString(),
            changed_by: 'super_admin',
            content: 'super_admin history insert',
            id: createHistoryId(prefix, 'super'),
            kind: 'edit',
            member_id: members.activeMember.id,
            next_is_active: true,
          })
          .select('id')
          .single(),
      tracker,
      'memberChangeHistory',
    );
    await expectAllowedWrite(
      runner,
      'admin can insert member_change_history',
      () =>
        roleClients.admin
          .from('member_change_history')
          .insert({
            action_label: 'RLS Admin History',
            changed_at: new Date().toISOString(),
            changed_by: 'admin',
            content: 'admin history insert',
            id: createHistoryId(prefix, 'admin'),
            kind: 'edit',
            member_id: members.activeMember.id,
            next_is_active: true,
          })
          .select('id')
          .single(),
      tracker,
      'memberChangeHistory',
    );
    await expectBlockedWrite(
      runner,
      'leader cannot insert member_change_history',
      () =>
        roleClients.leader
          .from('member_change_history')
          .insert({
            action_label: 'RLS Leader History',
            changed_at: new Date().toISOString(),
            changed_by: 'leader',
            content: 'leader history insert',
            id: createHistoryId(prefix, 'leader'),
            kind: 'edit',
            member_id: members.activeMember.id,
            next_is_active: true,
          })
          .select('id')
          .single(),
      tracker,
      'memberChangeHistory',
    );
    await expectBlockedWrite(
      runner,
      'anon cannot insert member_change_history',
      () =>
        roleClients.anon
          .from('member_change_history')
          .insert({
            action_label: 'RLS Anon History',
            changed_at: new Date().toISOString(),
            changed_by: 'anon',
            content: 'anon history insert',
            id: createHistoryId(prefix, 'anon'),
            kind: 'edit',
            member_id: members.activeMember.id,
            next_is_active: true,
          })
          .select('id')
          .single(),
      tracker,
      'memberChangeHistory',
    );
  } finally {
    await cleanupFixtures(service, tracker);

    if (roleClients) {
      await Promise.allSettled(
        Object.values(roleClients).map((client) => client?.auth?.signOut?.() || Promise.resolve()),
      );
    }
  }

  runner.summary();

  if (runner.failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
