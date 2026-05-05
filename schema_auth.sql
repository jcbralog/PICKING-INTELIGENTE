-- 1. Criação da tabela de usuários
create table public.app_users (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  password text not null,
  role text not null default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Inserir o administrador master
insert into public.app_users (email, password, role)
values ('jc.bralog@gmail.com', '@Jc231105', 'admin');
