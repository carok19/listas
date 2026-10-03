-- =====================================================================
-- Alabanza: esquema inicial (grupos, canciones, listas, storage)
-- Pegar completo en Supabase → SQL Editor → Run (o aplicar como migración).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  invite_code text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  artist text,
  song_key text,
  bpm int check (bpm is null or bpm between 20 and 400),
  lyrics text,
  notes text,
  audio_path text,
  audio_status text not null default 'none'
    check (audio_status in ('none', 'processing', 'ready', 'error')),
  audio_error text,
  source_url text,
  thumbnail_url text,
  duration_sec int,
  -- Fase 2 (Daw): identificador del proyecto multitrack enlazado en la compu.
  multitrack_ref text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_group_idx on public.songs (group_id);

create table public.setlists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  service_date date not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index setlists_group_date_idx on public.setlists (group_id, service_date);

create table public.setlist_songs (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.setlists (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  position int not null default 0,
  key_override text,
  created_at timestamptz not null default now()
);
create index setlist_songs_setlist_idx on public.setlist_songs (setlist_id, position);
create index setlist_songs_song_idx on public.setlist_songs (song_id);

-- ---------------------------------------------------------------------
-- Funciones auxiliares (SECURITY DEFINER para evitar recursión en RLS)
-- ---------------------------------------------------------------------

create or replace function public.is_member(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_admin(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.shares_group(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.setlist_group(sid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select group_id from public.setlists where id = sid;
$$;

-- Convierte texto a uuid sin lanzar error (para rutas de Storage).
create or replace function public.try_uuid(t text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- Código de invitación: 6 caracteres sin 0/O/1/I/L para evitar confusiones.
create or replace function public.gen_invite_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Crear perfil automáticamente al registrarse.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger songs_touch_updated_at
  before update on public.songs
  for each row execute function public.touch_updated_at();

-- No permitir que un grupo se quede sin administrador.
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role <> 'admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' then
    return new;
  end if;
  -- Si el grupo entero se está borrando, dejar pasar la cascada.
  if not exists (select 1 from public.groups where id = old.group_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = old.group_id and role = 'admin' and user_id <> old.user_id
  ) then
    raise exception 'El grupo necesita al menos un administrador. Nombra a otro admin primero.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger group_members_protect_last_admin
  before update or delete on public.group_members
  for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------
-- RPC (llamadas desde la app)
-- ---------------------------------------------------------------------

create or replace function public.create_group(p_name text)
returns public.groups language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  insert into public.groups (name, invite_code, created_by)
  values (trim(p_name), public.gen_invite_code(), auth.uid())
  returning * into g;
  insert into public.group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'admin');
  return g;
end;
$$;

-- Vista previa de un grupo por código (para la pantalla "Unirte a ...").
create or replace function public.group_preview(p_code text)
returns table (id uuid, name text, member_count bigint)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, (select count(*) from public.group_members m where m.group_id = g.id)
  from public.groups g
  where g.invite_code = upper(trim(p_code))
    and auth.uid() is not null;
$$;

create or replace function public.join_group(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;
  select id into gid from public.groups where invite_code = upper(trim(p_code));
  if gid is null then
    raise exception 'Código de invitación no válido.';
  end if;
  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  insert into public.group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  return gid;
end;
$$;

create or replace function public.regenerate_invite_code(p_group uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.is_admin(p_group) then
    raise exception 'Solo un administrador puede cambiar el código.';
  end if;
  code := public.gen_invite_code();
  update public.groups set invite_code = code where id = p_group;
  return code;
end;
$$;

-- Reordenar canciones de una lista en un solo paso.
create or replace function public.reorder_setlist(p_setlist uuid, p_item_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(public.setlist_group(p_setlist)) then
    raise exception 'Solo un administrador puede reordenar la lista.';
  end if;
  update public.setlist_songs s
  set position = t.ord - 1
  from unnest(p_item_ids) with ordinality as t(item_id, ord)
  where s.id = t.item_id and s.setlist_id = p_setlist;
end;
$$;

revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.group_preview(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
revoke execute on function public.reorder_setlist(uuid, uuid[]) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.group_preview(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.reorder_setlist(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.songs enable row level security;
alter table public.setlists enable row level security;
alter table public.setlist_songs enable row level security;

-- profiles: me veo a mí y a quienes comparten grupo conmigo.
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group(id));
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- groups: se crean solo con create_group().
create policy "groups_select" on public.groups for select to authenticated
  using (public.is_member(id));
create policy "groups_update" on public.groups for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
create policy "groups_delete" on public.groups for delete to authenticated
  using (public.is_admin(id));

-- group_members: se agregan solo con create_group() / join_group().
create policy "members_select" on public.group_members for select to authenticated
  using (public.is_member(group_id));
create policy "members_update" on public.group_members for update to authenticated
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
create policy "members_delete" on public.group_members for delete to authenticated
  using (public.is_admin(group_id) or user_id = (select auth.uid()));

-- songs
create policy "songs_select" on public.songs for select to authenticated
  using (public.is_member(group_id));
create policy "songs_insert" on public.songs for insert to authenticated
  with check (public.is_admin(group_id));
create policy "songs_update" on public.songs for update to authenticated
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
create policy "songs_delete" on public.songs for delete to authenticated
  using (public.is_admin(group_id));

-- setlists
create policy "setlists_select" on public.setlists for select to authenticated
  using (public.is_member(group_id));
create policy "setlists_insert" on public.setlists for insert to authenticated
  with check (public.is_admin(group_id));
create policy "setlists_update" on public.setlists for update to authenticated
  using (public.is_admin(group_id)) with check (public.is_admin(group_id));
create policy "setlists_delete" on public.setlists for delete to authenticated
  using (public.is_admin(group_id));

-- setlist_songs (la canción debe ser del mismo grupo que la lista)
create policy "setlist_songs_select" on public.setlist_songs for select to authenticated
  using (public.is_member(public.setlist_group(setlist_id)));
create policy "setlist_songs_insert" on public.setlist_songs for insert to authenticated
  with check (
    public.is_admin(public.setlist_group(setlist_id))
    and exists (
      select 1 from public.songs s
      where s.id = song_id and s.group_id = public.setlist_group(setlist_id)
    )
  );
create policy "setlist_songs_update" on public.setlist_songs for update to authenticated
  using (public.is_admin(public.setlist_group(setlist_id)))
  with check (public.is_admin(public.setlist_group(setlist_id)));
create policy "setlist_songs_delete" on public.setlist_songs for delete to authenticated
  using (public.is_admin(public.setlist_group(setlist_id)));

-- ---------------------------------------------------------------------
-- Storage: bucket privado "audio", rutas {group_id}/{song_id}.mp3
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 52428800, array['audio/mpeg', 'audio/mp3'])
on conflict (id) do nothing;

create policy "audio_select" on storage.objects for select to authenticated
  using (bucket_id = 'audio'
    and public.is_member(public.try_uuid((storage.foldername(name))[1])));
create policy "audio_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio'
    and public.is_admin(public.try_uuid((storage.foldername(name))[1])));
create policy "audio_update" on storage.objects for update to authenticated
  using (bucket_id = 'audio'
    and public.is_admin(public.try_uuid((storage.foldername(name))[1])));
create policy "audio_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'audio'
    and public.is_admin(public.try_uuid((storage.foldername(name))[1])));
