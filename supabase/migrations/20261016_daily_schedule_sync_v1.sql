-- Daily Schedule: sincronizzazione tra dispositivi.
-- Ogni elemento (attività, appuntamento, routine, impostazioni...) è una riga.
-- updated_at = momento della modifica sul dispositivo (ms); server_at = arrivo sul server (per scaricare solo le novità).
create table public.sync_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{1,32}$'),
  id text not null check (char_length(id) between 1 and 300),
  data jsonb,
  deleted boolean not null default false,
  updated_at bigint not null,
  device text,
  server_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, id),
  constraint data_size check (data is null or pg_column_size(data) < 200000)
);

create index sync_items_user_server_at on public.sync_items (user_id, server_at);

alter table public.sync_items enable row level security;

create policy "sync_items: leggo solo i miei" on public.sync_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sync_items: scrivo solo i miei" on public.sync_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "sync_items: aggiorno solo i miei" on public.sync_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "sync_items: cancello solo i miei" on public.sync_items
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.sync_items from anon;
grant select, insert, update, delete on public.sync_items to authenticated;

-- Invio delle modifiche: vince la più recente (updated_at). Restituisce le righe del server
-- che erano più recenti di quelle inviate, così il dispositivo le applica.
create or replace function public.sync_push(items jsonb, device text default null)
returns setof public.sync_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  it jsonb;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'non autenticato';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 2000 then
    raise exception 'richiesta non valida';
  end if;
  for it in select * from jsonb_array_elements(items) loop
    insert into public.sync_items as s (user_id, kind, id, data, deleted, updated_at, device, server_at)
    values (uid, it->>'kind', it->>'id', case when coalesce((it->>'deleted')::boolean, false) then null else it->'data' end,
            coalesce((it->>'deleted')::boolean, false), (it->>'updated_at')::bigint, device, clock_timestamp())
    on conflict (user_id, kind, id) do update
      set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at,
          device = excluded.device, server_at = clock_timestamp()
      where s.updated_at <= excluded.updated_at;
  end loop;
  return query
    select s.* from public.sync_items s
    join jsonb_array_elements(items) e on s.user_id = uid and s.kind = e->>'kind' and s.id = e->>'id'
    where s.updated_at > (e->>'updated_at')::bigint;
end;
$$;

revoke all on function public.sync_push(jsonb, text) from public, anon;
grant execute on function public.sync_push(jsonb, text) to authenticated;
