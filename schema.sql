-- Criação da tabela de histórico de análises por cliente
create table public.analysis_snapshots (
  id uuid default gen_random_uuid() primary key,
  client_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  analysis_data jsonb not null
);
