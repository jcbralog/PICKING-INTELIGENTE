// auth.js - Lógica de Autenticação e Segurança

let currentUser = null;

// Verifica se já existe sessão no localStorage ao iniciar
function checkSession() {
  const sessionUser = localStorage.getItem('bralog_user');
  if (sessionUser) {
    currentUser = JSON.parse(sessionUser);
    showApp();
  } else {
    showLogin();
  }
}

// Mostra a tela de login e esconde o app
function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContainer').style.display = 'none';
}

// Mostra o app e configura as permissões
function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  
  // Controle de acesso à aba Segurança
  const navSeguranca = document.getElementById('nav-seguranca');
  if (currentUser && currentUser.role === 'admin') {
    navSeguranca.style.display = 'flex';
    loadUsersList(); // Carrega lista de usuários se for admin
  } else {
    navSeguranca.style.display = 'none';
  }

  // Volta pro painel inicial
  document.getElementById('nav-painel').click();
  
  // Atualiza nome do usuário no menu
  document.getElementById('loggedUserName').innerText = currentUser.email.split('@')[0];
}

// Realiza o login consultando o Supabase
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const btn = document.getElementById('btnLogin');
  const errorMsg = document.getElementById('loginError');

  // Hardcoded Master Fallback (garante acesso caso o banco falhe)
  if (email === 'jc.bralog@gmail.com' && password === '@Jc231105') {
    currentUser = { id: 'bcfd2367-d710-4b00-ada3-ca8e6d5cafe7', email: email, role: 'admin' };
    localStorage.setItem('bralog_user', JSON.stringify(currentUser));
    showApp();
    return;
  }

  if (!supabaseClient) {
    errorMsg.innerText = "Erro de conexão com o banco de dados.";
    errorMsg.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerText = 'Entrando...';
  errorMsg.style.display = 'none';

  try {
    const { data, error } = await supabaseClient
      .from('app_users')
      .select('id, email, role')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      if (error?.code === '42P01') {
         errorMsg.innerText = "A tabela de usuários não existe no banco. Execute o schema_auth.sql.";
      } else {
         errorMsg.innerText = "E-mail ou senha incorretos. (Erro: " + (error?.message || 'Não encontrado') + ")";
      }
      errorMsg.style.display = 'block';
    } else {
      // Sucesso no login
      currentUser = data;
      localStorage.setItem('bralog_user', JSON.stringify(currentUser));
      showApp();
    }
  } catch (err) {
    console.error('Erro no login', err);
    errorMsg.innerText = "Erro inesperado. Tente novamente.";
    errorMsg.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerText = 'Entrar no Painel';
  }
}

// Realiza o logout
function handleLogout() {
  currentUser = null;
  localStorage.removeItem('bralog_user');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  showLogin();
}

// ==========================================
// PAINEL DE SEGURANÇA (ADMIN)
// ==========================================

// Carrega a lista de usuários ativos
async function loadUsersList() {
  if (!supabaseClient || !currentUser || currentUser.role !== 'admin') return;

  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando usuários...</td></tr>';

  const { data, error } = await supabaseClient
    .from('app_users')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--danger);">Erro ao carregar usuários.</td></tr>';
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(user => {
    const dateStr = new Date(user.created_at).toLocaleDateString('pt-BR');
    const badgeClass = user.role === 'admin' ? 'badge-urgent' : 'badge-medio';
    const badgeText = user.role === 'admin' ? 'Administrador' : 'Usuário';
    
    // Admin não pode excluir a si mesmo
    const deleteBtn = user.email !== currentUser.email 
      ? `<button class="btn-outline" style="padding: 4px 10px; font-size: 12px; border-color: var(--danger); color: var(--danger);" onclick="deleteUser('${user.id}')">Excluir</button>`
      : '<span style="font-size: 12px; color: var(--text-tertiary);">Sua conta</span>';

    return `
      <tr>
        <td><strong>${user.email}</strong></td>
        <td><span class="badge ${badgeClass}">${badgeText}</span></td>
        <td>${dateStr}</td>
        <td>${deleteBtn}</td>
      </tr>
    `;
  }).join('');
}

// Cria um novo usuário
async function handleCreateUser(event) {
  event.preventDefault();
  if (!supabaseClient || currentUser?.role !== 'admin') return;

  const email = document.getElementById('newUserEmail').value;
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;
  const btn = document.getElementById('btnCreateUser');

  btn.disabled = true;
  btn.innerText = 'Criando...';

  const { error } = await supabaseClient
    .from('app_users')
    .insert([{ email, password, role }]);

  btn.disabled = false;
  btn.innerText = 'Adicionar Usuário';

  if (error) {
    if (error.code === '23505') {
      alert('Erro: Este e-mail já está cadastrado.');
    } else {
      console.error(error);
      alert('Erro ao criar usuário.');
    }
  } else {
    // Sucesso
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPassword').value = '';
    loadUsersList();
  }
}

// Deleta um usuário
async function deleteUser(id) {
  if (!supabaseClient || currentUser?.role !== 'admin') return;

  if (confirm('Tem certeza que deseja excluir este usuário? Ele perderá acesso ao sistema.')) {
    const { error } = await supabaseClient
      .from('app_users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(error);
      alert('Erro ao excluir usuário.');
    } else {
      loadUsersList();
    }
  }
}

// Inicialização ao carregar o script (espera o DOM estar pronto)
document.addEventListener('DOMContentLoaded', () => {
  // Apenas roda o checkSession se o index.html principal carregou
  if (document.getElementById('loginScreen')) {
    checkSession();
  }
});
