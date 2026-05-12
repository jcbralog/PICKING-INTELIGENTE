-- 1. Criação da tabela de usuários (se não existir)
create table if not exists public.app_users (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  password text not null,
  role text not null default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilita RLS e políticas para a chave anônima
alter table public.app_users enable row level security;

drop policy if exists "Anon pode ler usuarios" on public.app_users;
create policy "Anon pode ler usuarios" on public.app_users
  for select to anon
  using (true);

drop policy if exists "Anon pode inserir usuarios" on public.app_users;
create policy "Anon pode inserir usuarios" on public.app_users
  for insert to anon
  with check (true);

drop policy if exists "Anon pode deletar usuarios" on public.app_users;
create policy "Anon pode deletar usuarios" on public.app_users
  for delete to anon
  using (true);

-- 3. Inserir o administrador master (ignora se já existir)
insert into public.app_users (email, password, role)
values ('jc.bralog@gmail.com', '@Jc231105', 'admin')
on conflict (email) do nothing;
