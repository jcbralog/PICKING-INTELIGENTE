-- Criação da tabela de histórico de análises por cliente
create table public.analysis_snapshots (
  id uuid default gen_random_uuid() primary key,
  user_id text,                          -- isolamento por usuário (FK lógica para app_users.id)
  client_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  analysis_data jsonb not null
);

create index idx_snapshots_user_id on public.analysis_snapshots(user_id);
