-- Reminders: the single domain table behind Relay.

create type public.reminder_status as enum ('inbox', 'pending', 'active', 'done', 'archived');
create type public.reminder_source as enum ('text', 'voice');

create table public.reminders (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text             text not null check (char_length(btrim(text)) between 1 and 2000),
  source           public.reminder_source not null default 'text',
  status           public.reminder_status not null default 'inbox',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  next_reminder_at timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz
);

create index reminders_user_status_idx on public.reminders (user_id, status);
create index reminders_user_next_idx on public.reminders (user_id, next_reminder_at)
  where status = 'pending';

-- Row Level Security: every user sees and changes only their own reminders.
alter table public.reminders enable row level security;

create policy "reminders_select_own" on public.reminders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "reminders_insert_own" on public.reminders
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reminders_update_own" on public.reminders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "reminders_delete_own" on public.reminders
  for delete to authenticated using (user_id = (select auth.uid()));

-- Last-writer-wins: a write carrying an older (or equal) updated_at than the stored
-- row is ignored. This makes retries and duplicate requests idempotent and prevents
-- a slow device from overwriting a newer decision made elsewhere.
create or replace function public.reminders_last_writer_wins()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at <= old.updated_at then
    return null; -- skip this update
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger reminders_lww
  before update on public.reminders
  for each row execute function public.reminders_last_writer_wins();

-- Batch upsert used by clients. Runs with the caller's privileges (RLS applies).
create or replace function public.upsert_reminders(items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.reminders as r (
    id, user_id, text, source, status,
    created_at, updated_at, next_reminder_at, started_at, completed_at
  )
  select
    i.id, auth.uid(), i.text, i.source, i.status,
    i.created_at, i.updated_at, i.next_reminder_at, i.started_at, i.completed_at
  from jsonb_to_recordset(items) as i (
    id uuid,
    text text,
    source public.reminder_source,
    status public.reminder_status,
    created_at timestamptz,
    updated_at timestamptz,
    next_reminder_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz
  )
  on conflict (id) do update set
    text = excluded.text,
    source = excluded.source,
    status = excluded.status,
    updated_at = excluded.updated_at,
    next_reminder_at = excluded.next_reminder_at,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at;
$$;

revoke all on function public.upsert_reminders(jsonb) from public, anon;
grant execute on function public.upsert_reminders(jsonb) to authenticated;

-- Realtime change feed for desktop clients.
alter publication supabase_realtime add table public.reminders;
