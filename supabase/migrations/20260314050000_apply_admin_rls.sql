create or replace function public.normalize_admin_role(role_value text)
returns text
language sql
immutable
as $function$
  select
    case lower(coalesce(role_value, ''))
      when 'super_admin' then 'super_admin'
      when 'superadmin' then 'super_admin'
      when 'admin' then 'admin'
      when 'leader' then 'leader'
      when 'attendance_leader' then 'leader'
      when 'attendanceleader' then 'leader'
      else null
    end;
$function$;

create or replace function public.current_admin_role()
returns text
language sql
stable
as $function$
  select coalesce(
    public.normalize_admin_role(auth.jwt() -> 'app_metadata' ->> 'admin_role'),
    public.normalize_admin_role(auth.jwt() -> 'app_metadata' ->> 'role')
  );
$function$;

comment on function public.current_admin_role()
is 'Resolves the admin role from stable JWT claims. Update this function if role storage moves to a server-managed table later.';

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $function$
  select public.current_admin_role() = 'super_admin';
$function$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $function$
  select public.current_admin_role() in ('super_admin', 'admin');
$function$;

create or replace function public.is_leader()
returns boolean
language sql
stable
as $function$
  select public.current_admin_role() = 'leader';
$function$;

create or replace function public.can_manage_members()
returns boolean
language sql
stable
as $function$
  select public.current_admin_role() in ('super_admin', 'admin');
$function$;

create or replace function public.can_manage_attendance()
returns boolean
language sql
stable
as $function$
  select public.current_admin_role() in ('super_admin', 'admin', 'leader');
$function$;

create or replace function public.can_view_member_history()
returns boolean
language sql
stable
as $function$
  select public.current_admin_role() in ('super_admin', 'admin');
$function$;

create table if not exists public.member_change_history (
  id text primary key,
  member_id text not null,
  action_label text not null,
  content text not null,
  kind text not null default 'edit',
  changed_by text not null,
  changed_at timestamptz not null default now(),
  next_is_active boolean,
  actor_user_id uuid default auth.uid(),
  source_role text default public.current_admin_role(),
  created_at timestamptz not null default now()
);

comment on table public.member_change_history
is 'Server-backed member audit trail. Uses JWT app_metadata.admin_role helpers so client and RLS can share the same role meaning.';

create index if not exists member_change_history_member_id_changed_at_idx
  on public.member_change_history (member_id, changed_at desc);

alter table public.groups enable row level security;
alter table public.attendance_weeks enable row level security;
alter table public.members enable row level security;
alter table public.attendance_records enable row level security;
alter table public.member_change_history enable row level security;

revoke all on public.member_change_history from anon;
grant select, insert on public.member_change_history to authenticated;
grant all on public.member_change_history to service_role;

drop policy if exists groups_read_admin_roles on public.groups;
drop policy if exists groups_read_kiosk on public.groups;

create policy groups_read_admin_roles
on public.groups
for select
to authenticated
using (public.can_manage_attendance());

create policy groups_read_kiosk
on public.groups
for select
to anon
using (true);

drop policy if exists attendance_weeks_read_admin_roles on public.attendance_weeks;
drop policy if exists attendance_weeks_read_kiosk_current on public.attendance_weeks;

create policy attendance_weeks_read_admin_roles
on public.attendance_weeks
for select
to authenticated
using (public.can_manage_attendance());

create policy attendance_weeks_read_kiosk_current
on public.attendance_weeks
for select
to anon
using (is_current = true);

drop policy if exists members_read_admin_roles on public.members;
drop policy if exists members_insert_admin_roles on public.members;
drop policy if exists members_update_admin_roles on public.members;
drop policy if exists members_read_kiosk_active on public.members;
drop policy if exists members_insert_kiosk_newcomer on public.members;

create policy members_read_admin_roles
on public.members
for select
to authenticated
using (
  public.can_manage_members()
  or (public.can_manage_attendance() and is_active = true)
);

create policy members_insert_admin_roles
on public.members
for insert
to authenticated
with check (public.can_manage_members());

create policy members_update_admin_roles
on public.members
for update
to authenticated
using (public.can_manage_members())
with check (public.can_manage_members());

create policy members_read_kiosk_active
on public.members
for select
to anon
using (is_active = true);

create policy members_insert_kiosk_newcomer
on public.members
for insert
to anon
with check (
  is_active = true
  and member_type in ('registered', 'visitor')
  and btrim(coalesce(name, '')) <> ''
  and exists (
    select 1
    from public.groups as g
    where g.id = group_id
      and g.group_type = 'newcomer'
  )
);

drop policy if exists attendance_records_read_admin_roles on public.attendance_records;
drop policy if exists attendance_records_insert_admin_roles on public.attendance_records;
drop policy if exists attendance_records_update_admin_roles on public.attendance_records;
drop policy if exists attendance_records_read_kiosk_current_week on public.attendance_records;
drop policy if exists attendance_records_insert_kiosk_current_week on public.attendance_records;
drop policy if exists attendance_records_update_kiosk_current_week on public.attendance_records;

create policy attendance_records_read_admin_roles
on public.attendance_records
for select
to authenticated
using (public.can_manage_attendance());

create policy attendance_records_insert_admin_roles
on public.attendance_records
for insert
to authenticated
with check (public.can_manage_attendance());

create policy attendance_records_update_admin_roles
on public.attendance_records
for update
to authenticated
using (public.can_manage_attendance())
with check (public.can_manage_attendance());

create policy attendance_records_read_kiosk_current_week
on public.attendance_records
for select
to anon
using (
  exists (
    select 1
    from public.attendance_weeks as w
    where w.id = attendance_week_id
      and w.is_current = true
  )
  and exists (
    select 1
    from public.members as m
    where m.id = member_id
      and m.is_active = true
  )
);

create policy attendance_records_insert_kiosk_current_week
on public.attendance_records
for insert
to anon
with check (
  source = 'kiosk'
  and attendance_type = 'youth'
  and (note is null or btrim(note) = '')
  and exists (
    select 1
    from public.attendance_weeks as w
    where w.id = attendance_week_id
      and w.is_current = true
  )
  and exists (
    select 1
    from public.members as m
    where m.id = member_id
      and m.is_active = true
  )
);

create policy attendance_records_update_kiosk_current_week
on public.attendance_records
for update
to anon
using (
  exists (
    select 1
    from public.attendance_weeks as w
    where w.id = attendance_week_id
      and w.is_current = true
  )
)
with check (
  source = 'kiosk'
  and attendance_type = 'youth'
  and (note is null or btrim(note) = '')
  and exists (
    select 1
    from public.attendance_weeks as w
    where w.id = attendance_week_id
      and w.is_current = true
  )
  and exists (
    select 1
    from public.members as m
    where m.id = member_id
      and m.is_active = true
  )
);

drop policy if exists member_change_history_read_admin_roles on public.member_change_history;
drop policy if exists member_change_history_insert_admin_roles on public.member_change_history;

create policy member_change_history_read_admin_roles
on public.member_change_history
for select
to authenticated
using (public.can_view_member_history());

create policy member_change_history_insert_admin_roles
on public.member_change_history
for insert
to authenticated
with check (
  public.can_manage_members()
  and coalesce(actor_user_id, auth.uid()) = auth.uid()
  and coalesce(source_role, public.current_admin_role()) = public.current_admin_role()
);
