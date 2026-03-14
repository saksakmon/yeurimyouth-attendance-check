import { createClient } from '@supabase/supabase-js';

export function getAdminAccounts(env = process.env) {
  return [
    {
      email: env.ADMIN_SUPER_EMAIL || 'superadmin@example.com',
      name: env.ADMIN_SUPER_NAME || '총관리자',
      password: env.ADMIN_SUPER_PASSWORD || 'super1234',
      role: 'super_admin',
    },
    {
      email: env.ADMIN_ADMIN_EMAIL || 'admin@example.com',
      name: env.ADMIN_ADMIN_NAME || '운영 관리자',
      password: env.ADMIN_ADMIN_PASSWORD || 'admin1234',
      role: 'admin',
    },
    {
      email: env.ADMIN_LEADER_EMAIL || 'leader@example.com',
      name: env.ADMIN_LEADER_NAME || '출결 리더',
      password: env.ADMIN_LEADER_PASSWORD || 'leader1234',
      role: 'leader',
    },
  ];
}

export function createServiceRoleClient({ serviceRoleKey, supabaseUrl }) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function listAllUsers(supabase) {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(`[adminAccounts] listUsers failed: ${error.message}`);
    }

    const batch = data?.users || [];
    users.push(...batch);

    if (batch.length < 200) {
      return users;
    }

    page += 1;
  }
}

export async function findUserByEmail(supabase, email) {
  const targetEmail = String(email || '').trim().toLowerCase();
  const users = await listAllUsers(supabase);
  return users.find((user) => String(user.email || '').trim().toLowerCase() === targetEmail) || null;
}

export async function ensureAdminAccount(supabase, account) {
  const existingUser = await findUserByEmail(supabase, account.email);
  const payload = {
    app_metadata: {
      admin_role: account.role,
    },
    email: account.email,
    email_confirm: true,
    password: account.password,
    user_metadata: {
      name: account.name,
    },
  };

  if (!existingUser) {
    const { data, error } = await supabase.auth.admin.createUser(payload);

    if (error) {
      throw new Error(`[adminAccounts] createUser failed for ${account.email}: ${error.message}`);
    }

    return data.user;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, payload);

  if (error) {
    throw new Error(`[adminAccounts] updateUserById failed for ${account.email}: ${error.message}`);
  }

  return data.user;
}

export async function ensureAdminAccounts(supabase, accounts) {
  const users = [];

  for (const account of accounts) {
    users.push(await ensureAdminAccount(supabase, account));
  }

  return users;
}
