# Supabase RLS Runbook

## 1. Apply the migration to the real Supabase project

Preferred path: Supabase CLI linked to the target project.

1. Install the Supabase CLI.
2. Authenticate the CLI.
3. Link this repo to the target project.
4. Push the local migrations.

```bash
supabase login
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push --include-all
```

If your remote database asks for a password during `supabase link`, use the database password for that project.

Current migration file:

- [20260314050000_apply_admin_rls.sql](/Users/sakmon/Desktop/yeurimyouth-attendance-check/supabase/migrations/20260314050000_apply_admin_rls.sql)

If CLI access is not ready yet, apply the same SQL in the Supabase SQL Editor once, then use the verification script below.

## 2. Bootstrap the role accounts

The verification script assumes these auth users exist and have `app_metadata.admin_role` set:

- `super_admin`
- `admin`
- `leader`

You can create/update them with:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/bootstrap-admin-auth.mjs
```

Optional env overrides:

- `ADMIN_SUPER_EMAIL`, `ADMIN_SUPER_PASSWORD`
- `ADMIN_ADMIN_EMAIL`, `ADMIN_ADMIN_PASSWORD`
- `ADMIN_LEADER_EMAIL`, `ADMIN_LEADER_PASSWORD`

## 3. Run the live RLS verification

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/verify-rls.mjs
```

Package shortcut:

```bash
SUPABASE_URL=... \
SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run verify:rls
```

What it does:

- ensures the role accounts exist
- uses `service_role` only from Node to create disposable fixtures
- signs in as `super_admin`, `admin`, `leader`
- runs anonymous checks with the anon key
- validates allow/deny behavior against the live RLS policies
- deletes the fixtures best-effort at the end

Preflight requirements in the target DB:

- at least one `groups` row with `group_type = 'regular'`
- at least one `groups` row with `group_type = 'newcomer'`
- at least one `attendance_weeks` row with `is_current = true`
- ideally at least one non-current `attendance_weeks` row

## 4. Expected access checklist

### `super_admin`

| Table | Select | Insert | Update |
| --- | --- | --- | --- |
| `groups` | allow | n/a | n/a |
| `attendance_weeks` | allow | n/a | n/a |
| `members` | allow active/inactive | allow | allow |
| `attendance_records` | allow | allow | allow |
| `member_change_history` | allow | allow | deny/not used |

### `admin`

| Table | Select | Insert | Update |
| --- | --- | --- | --- |
| `groups` | allow | n/a | n/a |
| `attendance_weeks` | allow | n/a | n/a |
| `members` | allow active/inactive | allow | allow |
| `attendance_records` | allow | allow | allow |
| `member_change_history` | allow | allow | deny/not used |

### `leader`

| Table | Select | Insert | Update |
| --- | --- | --- | --- |
| `groups` | allow | n/a | n/a |
| `attendance_weeks` | allow | n/a | n/a |
| `members` | allow active only | deny | deny |
| `attendance_records` | allow | allow | allow |
| `member_change_history` | deny/hidden | deny | deny |

### `anon`

| Table | Select | Insert | Update |
| --- | --- | --- | --- |
| `groups` | allow | n/a | n/a |
| `attendance_weeks` | allow current only | n/a | n/a |
| `members` | allow active only | allow newcomer only | deny |
| `attendance_records` | allow current + active-member rows only | allow kiosk/current/active/`youth` only | allow only within same kiosk scope |
| `member_change_history` | deny/hidden | deny | deny |

## 5. Manual spot-check checklist

Use this when you want a human QA pass alongside the script.

### `members`

- `super_admin`: active 회원과 inactive 회원이 모두 보여야 함
- `admin`: active 회원과 inactive 회원이 모두 보여야 함
- `leader`: active 회원만 보여야 함
- `anon`: active 회원만 보여야 함
- `leader`: 회원 추가/수정/재적변경이 막혀야 함
- `anon`: 일반 숲 회원 추가는 막히고, 새가족숲 신규 등록만 허용돼야 함

### `attendance_records`

- `super_admin/admin/leader`: 현재/과거 주차 출결 조회 가능해야 함
- `super_admin/admin/leader`: 출결 입력/수정 가능해야 함
- `anon`: 현재 주차이면서 active 회원인 출결만 보여야 함
- `anon`: `source='kiosk'`, `attendance_type='youth'`, `note is null`, 현재 주차, active 회원일 때만 입력/수정돼야 함
- `anon`: 과거 주차 출결 입력/수정은 막혀야 함

### `member_change_history`

- `super_admin/admin`: 조회 가능해야 함
- `super_admin/admin`: 기록 가능해야 함
- `leader/anon`: 조회와 기록이 모두 막혀야 함

### `groups`

- `super_admin/admin/leader`: 조회 가능해야 함
- `anon`: 키오스크에서 필요한 그룹 목록 조회 가능해야 함

### `attendance_weeks`

- `super_admin/admin/leader`: 전체 주차 조회 가능해야 함
- `anon`: `is_current = true` 주차만 조회 가능해야 함

## 6. Rollout notes

- 브라우저에는 반드시 `anon` key만 사용합니다.
- `service_role`은 Node script, server job, admin bootstrap 용도로만 씁니다.
- 이 검증 스크립트는 실제 RLS를 타는 live check라서, 테스트는 운영 저부하 시간에 돌리는 편이 안전합니다.
- `member_change_history`는 이번 구조상 서버 저장으로 바뀌었으므로, 검증 전에 마이그레이션 적용이 먼저 되어 있어야 합니다.
