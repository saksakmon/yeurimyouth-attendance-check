import { createClient } from '@supabase/supabase-js';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`[bootstrap-admin-auth] missing env: ${missingEnv.join(', ')}`);
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-admin-auth.mjs',
  );
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEFAULT_ACCOUNTS = [
  {
    email: process.env.ADMIN_SUPER_EMAIL || 'superadmin@example.com',
    name: process.env.ADMIN_SUPER_NAME || '총관리자',
    password: process.env.ADMIN_SUPER_PASSWORD || 'super1234',
    role: 'super_admin',
  },
  {
    email: process.env.ADMIN_ADMIN_EMAIL || 'admin@example.com',
    name: process.env.ADMIN_ADMIN_NAME || '운영 관리자',
    password: process.env.ADMIN_ADMIN_PASSWORD || 'admin1234',
    role: 'admin',
  },
  {
    email: process.env.ADMIN_LEADER_EMAIL || 'leader@example.com',
    name: process.env.ADMIN_LEADER_NAME || '출결 리더',
    password: process.env.ADMIN_LEADER_PASSWORD || 'leader1234',
    role: 'leader',
  },
];

async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw new Error(`[bootstrap-admin-auth] listUsers failed: ${error.message}`);
  }

  return data.users.find((user) => String(user.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
}

async function ensureAdminAccount(account) {
  const existingUser = await findUserByEmail(account.email);
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
      throw new Error(`[bootstrap-admin-auth] createUser failed for ${account.email}: ${error.message}`);
    }

    console.info(`[bootstrap-admin-auth] created ${account.role} account: ${account.email}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, payload);

  if (error) {
    throw new Error(`[bootstrap-admin-auth] updateUserById failed for ${account.email}: ${error.message}`);
  }

  console.info(`[bootstrap-admin-auth] updated ${account.role} account: ${account.email}`);
  return data.user;
}

async function main() {
  console.info('[bootstrap-admin-auth] bootstrapping admin accounts...');

  for (const account of DEFAULT_ACCOUNTS) {
    await ensureAdminAccount(account);
  }

  console.info('');
  console.info('[bootstrap-admin-auth] ready accounts');
  DEFAULT_ACCOUNTS.forEach((account) => {
    console.info(`- ${account.role}: ${account.email} / ${account.password}`);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
