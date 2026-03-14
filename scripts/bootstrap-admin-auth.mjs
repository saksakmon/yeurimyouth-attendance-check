import {
  createServiceRoleClient,
  ensureAdminAccount,
  getAdminAccounts,
} from './lib/adminAccounts.mjs';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`[bootstrap-admin-auth] missing env: ${missingEnv.join(', ')}`);
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/bootstrap-admin-auth.mjs',
  );
  process.exit(1);
}

const supabase = createServiceRoleClient({
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
});
const DEFAULT_ACCOUNTS = getAdminAccounts(process.env);

async function main() {
  console.info('[bootstrap-admin-auth] bootstrapping admin accounts...');

  for (const account of DEFAULT_ACCOUNTS) {
    await ensureAdminAccount(supabase, account);
    console.info(`[bootstrap-admin-auth] ensured ${account.role} account: ${account.email}`);
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
