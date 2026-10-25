-- Secret Santa schema.
--
-- All access goes through the `api` Edge Function using the service role key.
-- RLS is enabled on every table with NO policies, and table/function privileges
-- are revoked from anon/authenticated, so the public anon key can read nothing.

create table public.participants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  phone       text check (phone is null or phone ~ '^[0-9]{6,15}$'),
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  is_admin    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Exactly one admin at most.
create unique index participants_single_admin on public.participants ((true)) where is_admin;

-- Symmetric pairs, stored once with participant_a < participant_b.
create table public.exclusions (
  participant_a uuid not null references public.participants (id) on delete cascade,
  participant_b uuid not null references public.participants (id) on delete cascade,
  primary key (participant_a, participant_b),
  check (participant_a < participant_b)
);

create table public.wishlist_items (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants (id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  url             text check (url is null or (url ~* '^https?://' and char_length(url) <= 2000)),
  notes           text check (notes is null or char_length(notes) <= 1000),
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index wishlist_items_participant_position on public.wishlist_items (participant_id, position);

create table public.events (
  id        uuid primary key default gen_random_uuid(),
  year      integer not null unique check (year between 2000 and 2100),
  status    text not null default 'open' check (status in ('open', 'drawn')),
  drawn_at  timestamptz,
  check ((status = 'drawn') = (drawn_at is not null))
);

create table public.assignments (
  event_id     uuid not null references public.events (id) on delete cascade,
  giver_id     uuid not null references public.participants (id),
  receiver_id  uuid not null references public.participants (id),
  primary key (event_id, giver_id),
  unique (event_id, receiver_id),
  check (giver_id <> receiver_id)
);

alter table public.participants   enable row level security;
alter table public.exclusions     enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.events         enable row level security;
alter table public.assignments    enable row level security;

revoke all on public.participants, public.exclusions, public.wishlist_items,
              public.events, public.assignments
  from anon, authenticated;

-- Saves a completed draw atomically: inserts all assignments and marks the
-- event as drawn in the same transaction. Fails if the event is not open.
create function public.santa_save_draw(p_event_id uuid, p_givers uuid[], p_receivers uuid[])
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_status   text;
  v_drawn_at timestamptz := now();
begin
  select status into v_status from events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found';
  end if;
  if v_status <> 'open' then
    raise exception 'event_already_drawn';
  end if;
  if coalesce(array_length(p_givers, 1), 0) < 2
     or array_length(p_givers, 1) <> array_length(p_receivers, 1) then
    raise exception 'invalid_assignments';
  end if;

  insert into assignments (event_id, giver_id, receiver_id)
  select p_event_id, g, r from unnest(p_givers, p_receivers) as t (g, r);

  update events set status = 'drawn', drawn_at = v_drawn_at where id = p_event_id;
  return v_drawn_at;
end;
$$;

-- Discards a draw so it can be run again (e.g. someone joined late).
create function public.santa_reset_draw(p_event_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform 1 from events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found';
  end if;
  delete from assignments where event_id = p_event_id;
  update events set status = 'open', drawn_at = null where id = p_event_id;
end;
$$;

-- Sets wishlist positions from an ordered list of ids. The list must contain
-- each of the participant's items exactly once.
create function public.santa_reorder_wishlist(p_participant_id uuid, p_ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  v_total integer;
begin
  select count(*) into v_total from wishlist_items where participant_id = p_participant_id;
  if coalesce(array_length(p_ids, 1), 0) <> v_total
     or (select count(distinct x) from unnest(p_ids) as x) <> v_total
     or (select count(*) from wishlist_items
         where participant_id = p_participant_id and id = any (p_ids)) <> v_total then
    raise exception 'invalid_order';
  end if;

  update wishlist_items w
  set position = t.ord - 1
  from unnest(p_ids) with ordinality as t (id, ord)
  where w.id = t.id and w.participant_id = p_participant_id;
end;
$$;

revoke all on function public.santa_save_draw(uuid, uuid[], uuid[])   from public, anon, authenticated;
revoke all on function public.santa_reset_draw(uuid)                  from public, anon, authenticated;
revoke all on function public.santa_reorder_wishlist(uuid, uuid[])    from public, anon, authenticated;
grant execute on function public.santa_save_draw(uuid, uuid[], uuid[]) to service_role;
grant execute on function public.santa_reset_draw(uuid)                to service_role;
grant execute on function public.santa_reorder_wishlist(uuid, uuid[])  to service_role;
