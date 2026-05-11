// ===== SUPABASE.JS - BRALOG PICKING INTELLIGENCE =====
// Funciona com OU sem a biblioteca CDN (@supabase/supabase-js)
// Fallback total via fetch nativo do browser

const SUPABASE_URL = 'https://tcdrabbdtgftacrskfdt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZHJhYmJkdGdmdGFjcnNrZmR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MjM1NTcsImV4cCI6MjA5MzQ5OTU1N30.kedyoBXVlUre1ZuAcfST2wR-3LnVIKsh31NkobT_KaQ';

let supabaseClient = null;

// ═══════════════════════════════════════════════════════════════
// FETCH DIRETO — funciona 100% sem biblioteca CDN
// ═══════════════════════════════════════════════════════════════

async function sbRequest(endpoint, method, body, params) {
  let url = SUPABASE_URL + '/rest/v1/' + endpoint;
  if (params) url += '?' + params;

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  const opts = { method: method || 'GET', headers: headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  if (res.status === 204) return true; // DELETE sem corpo

  let json;
  try { json = await res.json(); } catch(e) { json = null; }

  if (!res.ok) {
    const msg = (json && (json.message || json.error || json.code)) || ('HTTP ' + res.status);
    throw new Error(msg);
  }
  return json;
}

// ═══════════════════════════════════════════════════════════════
// TENTATIVA DE USAR A BIBLIOTECA SUPABASE (CDN) — opcional
// ═══════════════════════════════════════════════════════════════

function tryInitLib() {
  try {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false }
      });
      window.supabaseClient = supabaseClient;
      console.log('[Supabase] ✅ Biblioteca CDN inicializada com sucesso.');
      return true;
    }
  } catch(e) {
    console.warn('[Supabase] Biblioteca CDN indisponível, usando fetch nativo.');
  }
  return false;
}

// Tenta inicializar a lib; se falhar, fetch nativo será usado em todas as funções
tryInitLib();
document.addEventListener('DOMContentLoaded', function() {
  if (!supabaseClient) tryInitLib();
  setTimeout(function() { if (!supabaseClient) tryInitLib(); }, 800);
});

// ═══════════════════════════════════════════════════════════════
// API PÚBLICA — usa lib se disponível, fetch nativo como fallback
// ═══════════════════════════════════════════════════════════════

// Retorna o histórico de um cliente (filtrado por usuário)
async function fetchHistory(clientName, userId) {
  console.log('[Supabase] fetchHistory →', clientName, '| user:', userId);
  try {
    if (supabaseClient) {
      let query = supabaseClient
        .from('analysis_snapshots')
        .select('id, created_at, client_name')
        .eq('client_name', clientName)
        .order('created_at', { ascending: false });
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query;
      if (!error) return data || [];
      console.warn('[Supabase] fetchHistory lib erro, usando fetch:', error.message);
    }
    // Fallback fetch
    const enc = encodeURIComponent(clientName);
    let params = 'select=id,created_at,client_name&client_name=eq.' + enc + '&order=created_at.desc';
    if (userId) params += '&user_id=eq.' + encodeURIComponent(userId);
    const data = await sbRequest('analysis_snapshots', 'GET', null, params);
    return Array.isArray(data) ? data : [];
  } catch(e) {
    console.error('[Supabase] fetchHistory erro:', e.message);
    return [];
  }
}

// Salva um novo snapshot (com user_id para isolamento)
async function saveAnalysisSnapshot(clientName, analysisData, userId) {
  console.log('[Supabase] saveAnalysisSnapshot →', clientName, '| produtos:', analysisData.length, '| user:', userId);
  const payload = { client_name: clientName, analysis_data: analysisData, user_id: userId || null };

  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('analysis_snapshots')
        .insert([payload])
        .select('id')
        .single();
      if (!error) {
        console.log('[Supabase] ✅ Salvo via lib! ID:', data && data.id);
        return data;
      }
      console.warn('[Supabase] saveAnalysisSnapshot lib erro, usando fetch:', error.message);
    }
    // Fallback fetch
    const result = await sbRequest('analysis_snapshots', 'POST', payload);
    const saved = Array.isArray(result) ? result[0] : result;
    console.log('[Supabase] ✅ Salvo via fetch! ID:', saved && saved.id);
    return saved;
  } catch(e) {
    console.error('[Supabase] saveAnalysisSnapshot ERRO:', e.message);
    throw e;
  }
}

// Carrega os dados de um snapshot específico
async function loadSnapshotData(id) {
  console.log('[Supabase] loadSnapshotData → id:', id);
  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('analysis_snapshots')
        .select('analysis_data')
        .eq('id', id)
        .single();
      if (!error) return data && data.analysis_data;
      console.warn('[Supabase] loadSnapshotData lib erro:', error.message);
    }
    // Fallback fetch
    const data = await sbRequest('analysis_snapshots', 'GET', null,
      'select=analysis_data&id=eq.' + encodeURIComponent(id));
    const row = Array.isArray(data) ? data[0] : data;
    return row && row.analysis_data;
  } catch(e) {
    console.error('[Supabase] loadSnapshotData ERRO:', e.message);
    return null;
  }
}

// Pega a análise mais recente de um cliente (filtrada por usuário)
async function fetchLatestSnapshot(clientName, userId) {
  console.log('[Supabase] fetchLatestSnapshot →', clientName, '| user:', userId);
  try {
    if (supabaseClient) {
      let query = supabaseClient
        .from('analysis_snapshots')
        .select('analysis_data, created_at')
        .eq('client_name', clientName)
        .order('created_at', { ascending: false })
        .limit(1);
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query.maybeSingle();
      if (!error) return data;
      console.warn('[Supabase] fetchLatestSnapshot lib erro:', error.message);
    }
    // Fallback fetch
    const enc = encodeURIComponent(clientName);
    let params = 'select=analysis_data,created_at&client_name=eq.' + enc + '&order=created_at.desc&limit=1';
    if (userId) params += '&user_id=eq.' + encodeURIComponent(userId);
    const data = await sbRequest('analysis_snapshots', 'GET', null, params);
    const rows = Array.isArray(data) ? data : [];
    return rows.length > 0 ? rows[0] : null;
  } catch(e) {
    console.error('[Supabase] fetchLatestSnapshot ERRO:', e.message);
    return null;
  }
}

// Deleta um snapshot
async function deleteSnapshot(id) {
  console.log('[Supabase] deleteSnapshot → id:', id);
  try {
    if (supabaseClient) {
      const { error } = await supabaseClient
        .from('analysis_snapshots')
        .delete()
        .eq('id', id);
      if (!error) return true;
      console.warn('[Supabase] deleteSnapshot lib erro:', error.message);
    }
    // Fallback fetch
    await sbRequest('analysis_snapshots', 'DELETE', null, 'id=eq.' + encodeURIComponent(id));
    return true;
  } catch(e) {
    console.error('[Supabase] deleteSnapshot ERRO:', e.message);
    return false;
  }
}

// Para uso no auth.js (acesso direto à lib para login via app_users)
async function queryAppUsers(email, password) {
  console.log('[Supabase] queryAppUsers →', email);
  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from('app_users')
        .select('id, email, role')
        .eq('email', email)
        .eq('password', password)
        .single();
      if (!error) return { data, error: null };
      return { data: null, error };
    }
    // Fallback fetch
    const enc_email = encodeURIComponent(email);
    const enc_pass  = encodeURIComponent(password);
    const result = await sbRequest('app_users', 'GET', null,
      'select=id,email,role&email=eq.' + enc_email + '&password=eq.' + enc_pass + '&limit=1');
    const rows = Array.isArray(result) ? result : [];
    if (rows.length === 0) return { data: null, error: { message: 'Credenciais inválidas', code: 'NOT_FOUND' } };
    return { data: rows[0], error: null };
  } catch(e) {
    console.error('[Supabase] queryAppUsers ERRO:', e.message);
    return { data: null, error: { message: e.message } };
  }
}
