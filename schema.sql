-- Criação da tabela de histórico de análises por cliente
create table if not exists public.analysis_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id text,                          -- isolamento por usuário (FK lógica para app_users.id)
  client_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  analysis_data jsonb not null
);

create index if not exists idx_snapshots_user_id on public.analysis_snapshots(user_id);

-- Habilita RLS (já é default, mas garantimos)
alter table public.analysis_snapshots enable row level security;

-- Políticas para permitir que a chave anônima (anon key) faça operações
drop policy if exists "Anon pode inserir snapshots" on public.analysis_snapshots;
create policy "Anon pode inserir snapshots" on public.analysis_snapshots
  for insert to anon
  with check (true);

drop policy if exists "Anon pode ler snapshots" on public.analysis_snapshots;
create policy "Anon pode ler snapshots" on public.analysis_snapshots
  for select to anon
  using (true);

drop policy if exists "Anon pode deletar snapshots" on public.analysis_snapshots;
create policy "Anon pode deletar snapshots" on public.analysis_snapshots
  for delete to anon
  using (true);
