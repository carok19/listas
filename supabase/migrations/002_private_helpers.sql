-- =====================================================================
-- Mover funciones internas a un esquema no expuesto por la API.
-- Las políticas RLS siguen apuntando a ellas (se referencian por OID).
-- =====================================================================

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

alter function public.is_member(uuid) set schema private;
alter function public.is_admin(uuid) set schema private;
alter function public.shares_group(uuid) set schema private;
alter function public.setlist_group(uuid) set schema private;
alter function public.try_uuid(text) set schema private;
alter function public.gen_invite_code() set schema private;
alter function public.handle_new_user() set schema private;
alter function public.touch_updated_at() set schema private;
alter function public.protect_last_admin() set schema private;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.shares_group(uuid) to authenticated;
grant execute on function private.setlist_group(uuid) to authenticated;
grant execute on function private.try_uuid(text) to authenticated;

-- RPC públicas: actualizar referencias internas al nuevo esquema.

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
  values (trim(p_name), private.gen_invite_code(), auth.uid())
  returning * into g;
  insert into public.group_members (group_id, user_id, role)
  values (g.id, auth.uid(), 'admin');
  return g;
end;
$$;

create or replace function public.regenerate_invite_code(p_group uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not private.is_admin(p_group) then
    raise exception 'Solo un administrador puede cambiar el código.';
  end if;
  code := private.gen_invite_code();
  update public.groups set invite_code = code where id = p_group;
  return code;
end;
$$;

create or replace function public.reorder_setlist(p_setlist uuid, p_item_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin(private.setlist_group(p_setlist)) then
    raise exception 'Solo un administrador puede reordenar la lista.';
  end if;
  update public.setlist_songs s
  set position = t.ord - 1
  from unnest(p_item_ids) with ordinality as t(item_id, ord)
  where s.id = t.item_id and s.setlist_id = p_setlist;
end;
$$;
