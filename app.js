// ===== BRALOG PICKING INTELLIGENCE — APP =====
let rawPedidos = null, rawEstoque = null, analysisData = [];
let barChartInstance = null, doughnutInstance = null, lineChartInstance = null;

// ===== TAB NAVIGATION =====
function updateVisibility() {
  const activeTabBtn = document.querySelector('.nav-item.active');
  const idx = activeTabBtn ? activeTabBtn.dataset.tab : '1';
  
  // Abas 2 (Histórico) e 4 (Segurança) não precisam de dados para aparecer
  if (idx === '4' || idx === '2') {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('tabPanels').style.display = 'block';
  } else {
    // Abas 1 (Painel) e 3 (Exportar) precisam de dados
    if (!analysisData || analysisData.length === 0) {
      document.getElementById('emptyState').style.display = 'flex';
      document.getElementById('tabPanels').style.display = 'none';
    } else {
      document.getElementById('emptyState').style.display = 'none';
      document.getElementById('tabPanels').style.display = 'block';
    }
  }
}

const routeMap = {
  '/': '0',
  '/charts': '1',
  '/history': '2',
  '/export': '3',
  '/security': '4'
};

const idMap = Object.fromEntries(Object.entries(routeMap).map(([k, v]) => [v, k]));

function handleRouting() {
  const path = window.location.pathname;
  const tabId = routeMap[path] || '0';
  
  const btn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (btn) {
    switchToTab(tabId, false);
  }
}

function switchToTab(idx, pushState = true) {
  // Proteção rigorosa: se for aba de segurança e não for admin, bloqueia
  if (idx === '4') {
    if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'admin') {
      alert("Acesso negado! Apenas administradores podem acessar a aba de Segurança.");
      return;
    }
  }

  const btn = document.querySelector(`.nav-item[data-tab="${idx}"]`);
  if (!btn) return;

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + idx).classList.add('active');
  
  updateVisibility();

  if (idx === '1' && analysisData && analysisData.length > 0) setTimeout(renderCharts, 100);

  if (pushState) {
    const newPath = idMap[idx] || '/';
    if (window.location.pathname !== newPath) {
      history.pushState({ tabId: idx }, '', newPath);
    }
  }
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    switchToTab(btn.dataset.tab);
  });
});

window.addEventListener('popstate', (e) => {
  handleRouting();
});

// ===== FILE HANDLING =====
function handleFile(input, type) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (type === 'pedidos') {
      rawPedidos = data;
      document.getElementById('statusPedidos').textContent = '✓ ' + file.name + ' (' + data.length + ' linhas)';
      document.getElementById('zone1').classList.add('loaded');
    } else {
      rawEstoque = data;
      document.getElementById('statusEstoque').textContent = '✓ ' + file.name + ' (' + data.length + ' linhas)';
      document.getElementById('zone2').classList.add('loaded');
    }
    document.getElementById('btnProcessar').disabled = !(rawPedidos && rawEstoque);
  };
  reader.readAsArrayBuffer(file);
}

function handleDrop(e, type) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const inputId = type === 'pedidos' ? 'filePedidos' : 'fileEstoque';
  const dt = new DataTransfer();
  dt.items.add(file);
  document.getElementById(inputId).files = dt.files;
  handleFile(document.getElementById(inputId), type);
}

// ===== PROCESS DATA =====
function processData() {
  if (!rawPedidos || !rawEstoque) return;

  // Normaliza SKU para matching: remove espaços, força string
  const normSku = v => String(v ?? '').trim().replace(/\.0+$/, '');

  // ===== STEP 1: BUILD ESTOQUE MAP =====
  const estoqueMap = {};
  rawEstoque.forEach(row => {
    const sku = normSku(
      findCol(row, ['Cód. Merc.', 'Cod. Merc.', 'Cód. Merc', 'Cod. Merc', 'CÓD. MERC.', 'COD. MERC.']) ??
      findCol(row, ['sku', 'codigo', 'cod']) ?? ''
    );
    if (!sku) return;

    const qtyRaw =
      findCol(row, ['Qt. Disp.', 'QT. DISP.', 'Qt. Disp', 'QT DISP', 'Qt.Disp.', 'Qtd. Disp.']) ??
      findCol(row, ['disponivel', 'disp', 'saldo', 'estoque', 'fisico']) ??
      0;
    const qty = parseNum(qtyRaw);

    const endereco = findCol(row, [
      'Endereço', 'Endereco', 'Endereço ', 'ENDEREÇO', 'ENDERECO',
      'Local', 'Localizacao', 'Localização',
      'Box', 'Posicao', 'Posição', 'Posicao armazenagem',
      'Rua', 'Rua/Box', 'End.', 'Endereco armazenagem'
    ]) ?? '';

    if (!estoqueMap[sku]) estoqueMap[sku] = { qty: 0, enderecos: new Set() };
    estoqueMap[sku].qty += qty;
    if (endereco) estoqueMap[sku].enderecos.add(endereco.trim());
  });

  // ===== STEP 2: BUILD PEDIDOS MAP =====
  const pedidosMap = {};
  rawPedidos.forEach(row => {
    const sku = normSku(
      findCol(row, ['Cód. Merc.', 'Cod. Merc.', 'Cód. Merc', 'Cod. Merc', 'CÓD. MERC.', 'COD. MERC.']) ??
      findCol(row, ['sku', 'codigo', 'cod']) ?? ''
    );
    if (!sku) return;

    const qtyRaw =
      findCol(row, ['Qt. Ítem', 'Qt. Item', 'QT. ÍTEM', 'QT. ITEM', 'Qt.Ítem', 'Qt.Item', 'Qtd. Item', 'Qtd Item']) ??
      findCol(row, ['quantidade', 'qtd', 'qtde', 'qty', 'volume', 'saida', 'venda']) ??
      0;
    const qty = parseNum(qtyRaw);
    if (qty <= 0) return;

    const desc = String(
      findCol(row, ['Nome Mercadoria', 'NOME MERCADORIA', 'Nome Merc.']) ||
      findCol(row, ['descricao', 'desc', 'nome', 'produto']) || sku
    ).trim();

    const dateRaw = findCol(row, ['Data', 'Data Pedido', 'Data Emissão', 'Data Emissao', 'DATA', 'DT.', 'Dt. Emissão']);

    if (!pedidosMap[sku]) pedidosMap[sku] = { total: 0, desc, months: {} };
    pedidosMap[sku].total += qty;

    let monthKey = 'Mês 1';
    if (dateRaw) {
      const d = parseDate(dateRaw);
      if (d) monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    pedidosMap[sku].months[monthKey] = (pedidosMap[sku].months[monthKey] || 0) + qty;
  });

  // ===== STEP 3: BUILD ANALYSIS (only from pedidos) =====
  analysisData = [];
  const maxSaidas = Math.max(...Object.values(pedidosMap).map(p => p.total), 1);

  Object.keys(pedidosMap).forEach(sku => {
    const pedido = pedidosMap[sku];
    const estoqueEntry = estoqueMap[sku] || { qty: 0 };

    const saidas90d = pedido.total;
    const mediaDia = Math.round((saidas90d / 90) * 10) / 10;
    const estoqueAtual = estoqueEntry.qty;

    // Cobertura = quantos dias o estoque atual vai durar com base na média diária de saídas
    const diasCobertura = mediaDia > 0 ? Math.round(estoqueAtual / mediaDia) : (estoqueAtual > 0 ? 9999 : 0);

    // Regras de Status:
    // URGENTE → Cobertura ≤ 15 dias (reposição imediata)
    // MÉDIO   → Cobertura 16 a 45 dias (repor em breve)
    // BAIXO   → Cobertura > 45 dias (estoque suficiente)
    let status;
    if (diasCobertura <= 15)      status = 'Urgente';
    else if (diasCobertura <= 45) status = 'Médio';
    else                          status = 'Baixo';

    // Giro: proporcional ao maior produto (barra relativa)
    const giroPercent = Math.min(100, Math.round((saidas90d / maxSaidas) * 100));

    const monthKeys = Object.keys(pedido.months).sort();
    let trend = 'estavel', variacao = 0;
    if (monthKeys.length >= 2) {
      const vals = monthKeys.map(k => pedido.months[k]);
      const last = vals[vals.length - 1];
      const prev = vals[vals.length - 2];
      if (prev > 0) {
        variacao = Math.round(((last - prev) / prev) * 100);
        if (variacao > 20) trend = 'alta';
        else if (variacao < -20) trend = 'queda';
      }
    }

    analysisData.push({ sku, desc: pedido.desc, saidas90d, mediaDia, estoqueAtual, enderecos: estoqueEntry.enderecos ? [...estoqueEntry.enderecos].filter(Boolean).sort() : [], diasCobertura, status, giroPercent, months: pedido.months, trend, variacao, monthKeys });
  });

  // Sort: Urgente → Médio → Baixo, depois por saídas decrescentes dentro de cada grupo
  const statusOrder = { 'Urgente': 0, 'Médio': 1, 'Baixo': 2 };
  analysisData.sort((a, b) => {
    const sA = statusOrder[a.status] ?? 3;
    const sB = statusOrder[b.status] ?? 3;
    if (sA !== sB) return sA - sB;
    return b.saidas90d - a.saidas90d;
  });

  // Update UI
  document.getElementById('uploadModal').classList.remove('show');
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('tabPanels').style.display = 'block';
  document.getElementById('btnManualSave').style.display = 'inline-flex';
  document.getElementById('dataStatus').innerHTML =
    '<span class="status-dot online"></span><span class="status-text">' +
    analysisData.length + ' produtos analisados</span>';

  renderMetrics();
  renderTable(analysisData);
  renderAlerts();
  setTimeout(renderCharts, 200);

  // Salvar no histórico (Supabase) — dispara em background com feedback
  saveCurrentAnalysis(analysisData.length);
}

// ===== HELPERS =====

/**
 * Find a column value by exact name match first, then case-insensitive.
 * Returns undefined if not found (so ?? 0 works correctly).
 */
function findCol(row, names) {
  // 1. Exact match
  for (const n of names) {
    if (row[n] !== undefined) return row[n];
  }
  // 2. Case-insensitive + accent-insensitive
  const norm = s => s.toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normNames = names.map(n => norm(n));
  for (const key of Object.keys(row)) {
    const nKey = norm(key);
    if (normNames.includes(nKey)) return row[key];
  }
  return undefined;
}

// Keep old findVal for backward compat (export, etc.)
function findVal(obj, keys, returnFirst = false) {
  return findCol(obj, keys) ?? (returnFirst ? (Object.values(obj)[0] || '') : null);
}

function parseNum(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  let s = String(v).trim();
  // Brazilian format: dot = thousands separator, comma = decimal
  // e.g. "1.234,5" -> 1235  |  "688,2" -> 688  |  "6882" -> 6882
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  return Math.round(parseFloat(s.replace(/[^\d.-]/g, ''))) || 0;
}





// ===== RENDER METRICS =====
function renderMetrics() {
  const total = analysisData.length;
  const urgente = analysisData.filter(d => d.status === 'Urgente').length;
  const medio = analysisData.filter(d => d.status === 'Médio').length;
  const baixo = analysisData.filter(d => d.status === 'Baixo').length;

  animateCounter('metricTotal', total);
  animateCounter('metricUrgente', urgente);
  animateCounter('metricMedio', medio);
  animateCounter('metricBaixo', baixo);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) { current = target; clearInterval(interval); }
    el.textContent = current.toLocaleString('pt-BR');
  }, 30);
}

// ===== RENDER TABLE =====
let currentSort = { col: 'saidas90d', asc: false };
let currentFilterStatus = 'todos';

function renderTable(data) {
  window._enderecosData = window._enderecosData || {};
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = data.map(d => {
    const statusClass = d.status === 'Urgente' ? 'urgente' : d.status === 'Médio' ? 'medio' : 'baixo';
    const barColor = d.status === 'Urgente' ? '#ef4444' : d.status === 'Médio' ? '#f59e0b' : '#10b981';
    // Suporte a dados novos (enderecos array) e históricos (endereco string)
    const enderecos = Array.isArray(d.enderecos) ? d.enderecos.filter(Boolean)
                    : (d.endereco && d.endereco !== '—' ? [d.endereco] : []);
    let endCell;
    if (enderecos.length === 0) {
      endCell = '<span style="color:#9ca3af;">—</span>';
    } else if (enderecos.length === 1) {
      endCell = '<code style="background:#f0fdf4;color:#065f46;padding:2px 7px;border-radius:5px;font-size:11.5px;font-weight:600;">' + escHTML(enderecos[0]) + '</code>';
    } else {
      window._enderecosData[d.sku] = { desc: d.desc, enderecos };
      endCell = '<button onclick="openEnderecosModal(\'' + d.sku.replace(/'/g, "\\''") + '\')" style="background:#ecfdf5;border:1.5px solid #6ee7b7;color:#065f46;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">&#128205; ' + enderecos.length + ' endereços</button>';
    }
    return '<tr>' +
      '<td><strong>' + escHTML(d.desc) + '</strong><br><span style="font-size:11px;color:#9ca3af;cursor:pointer;padding:2px 4px;border-radius:4px;margin-left:-4px;" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'transparent\'" onclick="copySku(\'' + String(d.sku).replace(/'/g, "\\'") + '\', this)" title="Clique para copiar o SKU">' + escHTML(d.sku) + '</span></td>' +
      '<td>' + d.saidas90d.toLocaleString('pt-BR') + '</td>' +
      '<td>' + d.mediaDia.toLocaleString('pt-BR') + '</td>' +
      '<td>' + d.estoqueAtual.toLocaleString('pt-BR') + '</td>' +
      '<td>' + endCell + '</td>' +
      '<td>' + (d.diasCobertura >= 999 ? '—' : d.diasCobertura + ' dias') + '</td>' +
      '<td><div class="bar-wrap"><div class="bar-fill" style="width:' + d.giroPercent + '%;background:' + barColor + '"></div></div></td>' +
      '<td><span class="badge ' + statusClass + '">● ' + d.status + '</span></td>' +
      '</tr>';
  }).join('');
}

function openEnderecosModal(sku) {
  const entry = window._enderecosData && window._enderecosData[sku];
  if (!entry) return;
  document.getElementById('enderecosModalTitle').textContent = entry.desc + ' — SKU: ' + sku;
  document.getElementById('enderecosModalList').innerHTML = entry.enderecos.map((e, i) =>
    '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:' + (i%2===0?'#f0fdf4':'#fff') + ';border-radius:8px;margin-bottom:6px;border:1px solid #d1fae5;">' +
    '<div style="width:24px;height:24px;background:#059669;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0;">' + (i+1) + '</div>' +
    '<code style="font-weight:700;color:#065f46;font-size:14px;">' + escHTML(e) + '</code>' +
    '</div>'
  ).join('');
  document.getElementById('enderecosModal').style.display = 'flex';
}

function escHTML(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

window.copySku = function(text, el) {
  navigator.clipboard.writeText(text).then(() => {
    const origText = el.innerText;
    el.innerText = 'Copiado!';
    el.style.color = '#059669';
    el.style.background = '#d1fae5';
    setTimeout(() => {
      el.innerText = origText;
      el.style.color = '#9ca3af';
      el.style.background = 'transparent';
    }, 1200);
  }).catch(err => {
    console.error('Erro ao copiar SKU:', err);
  });
};

// ===== EXCEL-STYLE COLUMN FILTERS =====
let colFilters = {}; // { colKey: Set of allowed values } — empty Set means "all"
let activeFilterCol = null;

function openColFilter(colKey, headerEl) {
  // Close if same column clicked twice
  const existing = document.getElementById('excelFilterDropdown');
  if (existing && activeFilterCol === colKey) { existing.remove(); activeFilterCol = null; return; }
  if (existing) existing.remove();
  activeFilterCol = colKey;

  // Collect unique values
  const allVals = [...new Set(analysisData.map(d => {
    if (colKey === 'desc') return d.desc;
    if (colKey === 'sku') return String(d.sku);
    if (colKey === 'status') return d.status;
    if (colKey === 'saidas90d') return String(d.saidas90d);
    if (colKey === 'mediaDia') return String(d.mediaDia);
    if (colKey === 'estoqueAtual') return String(d.estoqueAtual);
    if (colKey === 'endereco') return d.endereco;
    if (colKey === 'diasCobertura') return d.diasCobertura >= 9999 ? '—' : String(d.diasCobertura);
    return '';
  }))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const selected = colFilters[colKey] || new Set(allVals);
  let searchTerm = '';

  const rect = headerEl.getBoundingClientRect();
  const drop = document.createElement('div');
  drop.id = 'excelFilterDropdown';
  const vw = window.innerWidth;
  const dropW = Math.min(320, vw - 16);
  const dropL = Math.min(rect.left, vw - dropW - 8);
  drop.style.cssText = `position:fixed;top:${rect.bottom + 2}px;left:${Math.max(8, dropL)}px;min-width:240px;max-width:${dropW}px;
    background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.15);
    z-index:1000;font-family:Inter,sans-serif;font-size:12.5px;overflow:hidden;`;

  drop.innerHTML = `
    <div style="padding:8px 10px;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;align-items:center;background:#f9fafb;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="efSearch" placeholder="Pesquisar..." style="flex:1;border:none;outline:none;font-family:inherit;font-size:12px;background:transparent;">
    </div>
    <div style="padding:6px 10px;border-bottom:1px solid #e5e7eb;display:flex;gap:10px;">
      <button onclick="efSelectAll()" style="font-size:11px;color:#059669;border:none;background:none;cursor:pointer;padding:0;">(Selecionar Tudo)</button>
      <button onclick="efClearAll()" style="font-size:11px;color:#6b7280;border:none;background:none;cursor:pointer;padding:0;">Limpar</button>
    </div>
    <div id="efList" style="max-height:220px;overflow-y:auto;padding:4px 0;"></div>
    <div style="padding:8px 10px;border-top:1px solid #e5e7eb;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb;">
      <button onclick="closeColFilter()" style="padding:5px 14px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;background:#fff;">Cancelar</button>
      <button onclick="applyColFilter('${colKey}')" style="padding:5px 14px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:#059669;color:#fff;font-weight:600;">OK</button>
    </div>`;

  document.body.appendChild(drop);

  const renderList = (filter) => {
    const list = document.getElementById('efList');
    list.innerHTML = allVals
      .filter(v => v.toLowerCase().includes(filter.toLowerCase()))
      .map(v => `<label style="display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;hover:background:#f3f4f6;">
        <input type="checkbox" class="ef-cb" value="${escHTML(v)}" ${selected.has(v) ? 'checked' : ''} style="accent-color:#059669;width:14px;height:14px;">
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:210px;">${escHTML(v)}</span>
      </label>`).join('');
  };

  renderList('');

  document.getElementById('efSearch').addEventListener('input', function() {
    searchTerm = this.value;
    renderList(searchTerm);
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!drop.contains(e.target) && e.target !== headerEl) {
        drop.remove(); activeFilterCol = null;
        document.removeEventListener('click', handler);
      }
    });
  }, 50);

  window.efSelectAll = () => { drop.querySelectorAll('.ef-cb').forEach(cb => cb.checked = true); };
  window.efClearAll  = () => { drop.querySelectorAll('.ef-cb').forEach(cb => cb.checked = false); };
}

window.applyColFilter = function(colKey) {
  const checked = [...document.querySelectorAll('.ef-cb:checked')].map(cb => cb.value);
  const allVals = [...new Set(analysisData.map(d => {
    if (colKey === 'desc') return d.desc;
    if (colKey === 'sku') return String(d.sku);
    if (colKey === 'status') return d.status;
    if (colKey === 'saidas90d') return String(d.saidas90d);
    if (colKey === 'mediaDia') return String(d.mediaDia);
    if (colKey === 'estoqueAtual') return String(d.estoqueAtual);
    if (colKey === 'endereco') return d.endereco;
    if (colKey === 'diasCobertura') return d.diasCobertura >= 9999 ? '—' : String(d.diasCobertura);
    return '';
  }))];
  // If all selected, clear filter
  if (checked.length === allVals.length) { delete colFilters[colKey]; }
  else { colFilters[colKey] = new Set(checked); }
  closeColFilter();
  applyTableFilters();
};

window.closeColFilter = function() {
  const drop = document.getElementById('excelFilterDropdown');
  if (drop) drop.remove();
  activeFilterCol = null;
};

function applyTableFilters() {
  const q = document.getElementById('searchInput').value.toLowerCase();

  let filtered = analysisData.filter(d => {
    // Text search
    if (q && !d.desc.toLowerCase().includes(q) && !String(d.sku).toLowerCase().includes(q)) return false;
    // Status dropdown
    if (currentFilterStatus !== 'todos' && d.status !== currentFilterStatus) return false;
    // Column filters
    for (const [col, allowed] of Object.entries(colFilters)) {
      if (!allowed || allowed.size === 0) continue;
      let val = '';
      if (col === 'desc') val = d.desc;
      else if (col === 'sku') val = String(d.sku);
      else if (col === 'status') val = d.status;
      else if (col === 'saidas90d') val = String(d.saidas90d);
      else if (col === 'mediaDia') val = String(d.mediaDia);
      else if (col === 'estoqueAtual') val = String(d.estoqueAtual);
      else if (col === 'endereco') { const arr = Array.isArray(d.enderecos) ? d.enderecos : (d.endereco ? [d.endereco] : []); val = arr.filter(Boolean).join(' / ') || '—'; }
      else if (col === 'diasCobertura') val = d.diasCobertura >= 9999 ? '—' : String(d.diasCobertura);
      if (!allowed.has(val)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let valA = a[currentSort.col], valB = b[currentSort.col];
    if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
    if (valA < valB) return currentSort.asc ? -1 : 1;
    if (valA > valB) return currentSort.asc ? 1 : -1;
    return 0;
  });

  renderTable(filtered);
  updateSortIcons();
}

function filterTable() { applyTableFilters(); }

function sortTable(col) {
  if (currentSort.col === col) { currentSort.asc = !currentSort.asc; }
  else { currentSort.col = col; currentSort.asc = false; }
  applyTableFilters();
}

function setFilterStatus(status) { currentFilterStatus = status; applyTableFilters(); }

function updateSortIcons() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.col === currentSort.col) th.classList.add(currentSort.asc ? 'asc' : 'desc');
  });
}


// ===== RENDER CHARTS =====
function renderCharts() {
  // Ordena por saídas para os gráficos (top movers)
  const byVolume = [...analysisData].sort((a, b) => b.saidas90d - a.saidas90d);
  const top10 = byVolume.slice(0, 10);

  const urgCount = analysisData.filter(d => d.status === 'Urgente').length;
  const medCount = analysisData.filter(d => d.status === 'Médio').length;
  const baixCount = analysisData.filter(d => d.status === 'Baixo').length;

  // ===== BAR CHART — Top 10 produtos por volume =====
  if (barChartInstance) barChartInstance.destroy();
  const barCtx = document.getElementById('barChart').getContext('2d');
  barChartInstance = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: top10.map(d => d.desc.length > 28 ? d.desc.substring(0, 28) + '…' : d.desc),
      datasets: [{
        label: 'Saídas 90 dias',
        data: top10.map(d => d.saidas90d),
        backgroundColor: top10.map(d =>
          d.status === 'Urgente' ? 'rgba(239,68,68,.8)' :
          d.status === 'Médio' ? 'rgba(245,158,11,.8)' : 'rgba(16,185,129,.8)'
        ),
        borderRadius: 6, borderSkipped: false, barThickness: 20
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#111827', titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' },
          callbacks: { label: ctx => ' ' + ctx.parsed.x.toLocaleString('pt-BR') + ' unidades' }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { family: 'Inter', size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } }
      }
    }
  });
  barCtx.canvas.parentElement.style.height = Math.max(280, top10.length * 34) + 'px';

  // ===== DOUGHNUT =====
  if (doughnutInstance) doughnutInstance.destroy();
  const dCtx = document.getElementById('doughnutChart').getContext('2d');
  doughnutInstance = new Chart(dCtx, {
    type: 'doughnut',
    data: {
      labels: ['Urgente', 'Médio', 'Baixo'],
      datasets: [{ data: [urgCount, medCount, baixCount],
        backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
        borderWidth: 3, borderColor: '#fff', hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyle: 'rectRounded', font: { family: 'Inter', size: 12 } } },
        tooltip: { backgroundColor: '#111827', titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' } }
      }
    },
    plugins: [{ id: 'centerText', beforeDraw: function(chart) {
      const { width, height, ctx } = chart;
      ctx.save();
      ctx.font = 'bold 28px Inter'; ctx.fillStyle = '#111827';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(analysisData.length, width / 2, height / 2 - 8);
      ctx.font = '12px Inter'; ctx.fillStyle = '#6b7280';
      ctx.fillText('produtos', width / 2, height / 2 + 14);
      ctx.restore();
    }}]
  });

  // ===== LINE CHART — Tendência mensal todos os produtos (top 10 por volume) =====
  if (lineChartInstance) lineChartInstance.destroy();

  // Coleta todos os meses únicos
  const allMonths = new Set();
  byVolume.forEach(d => Object.keys(d.months).forEach(m => allMonths.add(m)));
  const sortedMonths = [...allMonths].sort();

  const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const monthLabels = sortedMonths.map(m => {
    const p = m.split('-');
    return p.length === 2 ? monthNames[parseInt(p[1]) - 1] + '/' + p[0].slice(2) : m;
  });

  // Paleta de cores para até 10 produtos
  const palette = [
    '#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6',
    '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1'
  ];

  const lineCtx = document.getElementById('lineChart').getContext('2d');
  lineChartInstance = new Chart(lineCtx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: top10.map((d, i) => ({
        label: d.desc.length > 22 ? d.desc.substring(0, 22) + '…' : d.desc,
        data: sortedMonths.map(m => d.months[m] || 0),
        backgroundColor: palette[i % palette.length] + 'CC',
        borderColor: palette[i % palette.length],
        borderWidth: 1.5, borderRadius: 4
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { family: 'Inter', size: 10 }, boxWidth: 12 } },
        tooltip: { backgroundColor: '#111827', mode: 'index', intersect: false, titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter', size: 11 } }
      },
      scales: {
        x: { stacked: false, grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { family: 'Inter', size: 11 } } },
        y: { stacked: false, grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { family: 'Inter', size: 11 } } }
      }
    }
  });
  lineCtx.canvas.parentElement.style.height = '360px';
}

// ===== RENDER ALERTS =====
function renderAlerts() {
  const grid = document.getElementById('alertsGrid');
  const alerts = [];

  analysisData.forEach(d => {
    // Ruptura
    if (d.status === 'Urgente' && d.diasCobertura <= 3) {
      alerts.push({ type: 'danger', icon: '!', title: d.desc, tag: 'Risco de Ruptura',
        desc: 'Estoque cobre apenas ' + d.diasCobertura + ' dia(s) com média de ' + d.mediaDia + ' saídas/dia. Reposição imediata necessária.' });
    }
    // Tendência de alta
    if (d.trend === 'alta' && d.variacao > 0) {
      alerts.push({ type: 'warning', icon: '↑', title: d.desc, tag: 'Tendência de Alta',
        desc: 'Aumento de ' + d.variacao + '% nas saídas comparado ao mês anterior. Avaliar ponto de pedido.' });
    }
    // Excesso
    if (d.diasCobertura > 180 && d.saidas90d > 0) {
      alerts.push({ type: 'info', icon: '≡', title: d.desc, tag: 'Excesso de Estoque',
        desc: 'Cobertura de ' + d.diasCobertura + ' dias. Possível excesso de estoque no picking.' });
    }
    // Sem movimentação com estoque
    if (d.saidas90d === 0 && d.estoqueAtual > 0) {
      alerts.push({ type: 'success', icon: '○', title: d.desc, tag: 'Sem Movimentação',
        desc: 'Produto com estoque de ' + d.estoqueAtual.toLocaleString('pt-BR') + ' unidades mas sem saídas nos últimos 90 dias.' });
    }
  });

  // Sort: danger first
  const order = { danger: 0, warning: 1, info: 2, success: 3 };
  alerts.sort((a, b) => order[a.type] - order[b.type]);

  grid.innerHTML = alerts.length === 0
    ? '<div style="text-align:center;padding:40px;color:#9ca3af;">Nenhum apontamento gerado. Importe os dados para análise.</div>'
    : alerts.map(a =>
      '<div class="alert-card ' + a.type + '">' +
        '<div class="alert-icon">' + a.icon + '</div>' +
        '<div class="alert-body">' +
          '<div class="alert-title">' + escHTML(a.title) + '</div>' +
          '<div class="alert-desc">' + escHTML(a.desc) + '</div>' +
          '<span class="alert-tag">' + a.tag + '</span>' +
        '</div>' +
      '</div>'
    ).join('');
}

// ===== EXPORT PREMIUM BRALOG =====
async function exportData() {
  if (!analysisData.length) return alert('Importe os dados primeiro.');

  const statusFilter = document.getElementById('filterStatus').value;
  const formato = document.getElementById('filterFormato').value;

  let data = [...analysisData];
  if (statusFilter !== 'todos') data = data.filter(d => d.status === statusFilter);

  const btn = document.getElementById('btnExport');
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  try {
    if (formato === 'csv') {
      exportCSV(data);
    } else {
      await exportXLSXPremium(data);
    }
  } catch (err) {
    console.error('Erro na exportação:', err);
    alert('Erro ao gerar planilha: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar Relatório BRALOG';
  }
}


function exportCSV(data) {
  const header = ['SKU','Produto','Saídas 90d','Média/Dia','Estoque Atual','Endereço','Dias Cobertura','Status','Ponto de Pedido'];
  const rows = data.map(d => [
    d.sku, d.desc, d.saidas90d, d.mediaDia, d.estoqueAtual, d.endereco,
    d.diasCobertura >= 9999 ? 'N/A' : d.diasCobertura,
    d.status, Math.round(d.mediaDia * 14)
  ]);
  const csv = [header, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
  downloadFile(csv, 'BRALOG_Picking_' + new Date().toISOString().slice(0,10) + '.csv', 'text/csv');
}

async function exportXLSXPremium(data) {
  if (typeof ExcelJS === 'undefined') {
    alert('Biblioteca de exportação ainda carregando. Tente novamente em instantes.');
    return;
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BRALOG Logística';

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Cores BRALOG
  const VERDE      = '059669';
  const VERDE_SCR  = 'D1FAE5';
  const DARK       = '111827';
  const URG_BG     = 'FEE2E2'; const URG_TX = '991B1B';
  const MED_BG     = 'FEF3C7'; const MED_TX = '92400E';
  const LOW_BG     = 'D1FAE5'; const LOW_TX = '065F46';
  const ROW_A      = 'F0FDF9'; const ROW_B  = 'FFFFFF';

  function applyFill(cell, hex) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } };
  }
  function applyFont(cell, hex, bold = false, size = 10) {
    cell.font = { name: 'Calibri', size, bold, color: { argb: 'FF' + hex } };
  }
  function applyAlign(cell, h = 'left', v = 'middle') {
    cell.alignment = { horizontal: h, vertical: v };
  }
  function applyBorder(cell) {
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
  }

  // =============================================
  // ABA 1 — ANÁLISE DE ESTOQUE
  // =============================================
  const ws1 = workbook.addWorksheet('Análise de Estoque', {
    views: [{ state: 'frozen', ySplit: 7 }]
  });
  ws1.columns = [
    { width: 16 }, { width: 42 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 18 }, { width: 15 }, { width: 15 }, { width: 12 }
  ];

  // Linha 1 — Título BRALOG
  ws1.mergeCells('A1:H1');
  const t1 = ws1.getCell('A1');
  t1.value = 'BRALOG LOGÍSTICA';
  applyFill(t1, DARK); applyFont(t1, '10B981', true, 18); applyAlign(t1);
  ws1.getRow(1).height = 38;

  // Linha 2 — Subtítulo
  ws1.mergeCells('A2:H2');
  const t2 = ws1.getCell('A2');
  t2.value = 'Relatório de GESTÃO DE ESTOQUE — Análise de Estoque';
  applyFill(t2, DARK); applyFont(t2, 'D1FAE5', false, 11); applyAlign(t2);
  ws1.getRow(2).height = 22;

  // Linha 3 — Data
  ws1.mergeCells('A3:H3');
  const t3 = ws1.getCell('A3');
  t3.value = `Gerado em: ${dateStr} às ${timeStr}`;
  applyFill(t3, DARK); applyFont(t3, '6EE7B7', false, 10); applyAlign(t3);
  ws1.getRow(3).height = 18;

  // Linha 4 — Regras
  ws1.mergeCells('A4:H4');
  const t4 = ws1.getCell('A4');
  t4.value = 'Urgente ≤ 15 dias  |  Médio 16–45 dias  |  Baixo > 45 dias';
  applyFill(t4, DARK); applyFont(t4, '6EE7B7', false, 10); applyAlign(t4);
  ws1.getRow(4).height = 18;

  // Linha 5 — spacer escuro
  ws1.mergeCells('A5:H5');
  applyFill(ws1.getCell('A5'), DARK);
  ws1.getRow(5).height = 4;

  // Linha 6 — barra verde accent
  ws1.mergeCells('A6:H6');
  applyFill(ws1.getCell('A6'), VERDE);
  ws1.getRow(6).height = 4;

  // Linha 7 — cabeçalhos da tabela
  const colHeaders = ['SKU', 'PRODUTO', 'SAÍDAS 90d', 'MÉDIA/DIA', 'ESTOQUE ATUAL', 'ENDEREÇO', 'DIAS COBERTURA', 'PONTO PEDIDO', 'STATUS'];
  const hRow = ws1.getRow(7);
  hRow.height = 26;
  colHeaders.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    applyFill(cell, VERDE);
    applyFont(cell, 'FFFFFF', true, 11);
    applyAlign(cell, i >= 2 ? 'center' : 'left');
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF047857' } } };
  });

  // Linhas de dados
  data.forEach((d, i) => {
    const rowNum = i + 8;
    const dRow = ws1.getRow(rowNum);
    dRow.height = 18;

    const rowBg = d.status === 'Urgente' ? URG_BG : (i % 2 === 0 ? ROW_A : ROW_B);

    const vals = [
      d.sku, d.desc, d.saidas90d, d.mediaDia,
      d.estoqueAtual, d.endereco,
      d.diasCobertura >= 9999 ? 'N/A' : d.diasCobertura,
      Math.round(d.mediaDia * 14),
      d.status
    ];

    vals.forEach((v, ci) => {
      const cell = dRow.getCell(ci + 1);
      cell.value = v;
      applyFill(cell, rowBg);
      applyFont(cell, DARK, false, 10);
      applyAlign(cell, ci >= 2 ? 'right' : 'left');
      applyBorder(cell);
    });

    // Célula STATUS colorida
    const sc = dRow.getCell(9);
    if (d.status === 'Urgente') {
      applyFill(sc, 'EF4444'); applyFont(sc, 'FFFFFF', true, 10); applyAlign(sc, 'center');
    } else if (d.status === 'Médio') {
      applyFill(sc, 'F59E0B'); applyFont(sc, 'FFFFFF', true, 10); applyAlign(sc, 'center');
    } else {
      applyFill(sc, '10B981'); applyFont(sc, 'FFFFFF', true, 10); applyAlign(sc, 'center');
    }
    if (d.diasCobertura === 0) {
      applyFont(dRow.getCell(7), 'EF4444', true, 10);
    }
  });

  // =============================================
  // ABA 2 — RESUMO EXECUTIVO
  // =============================================
  const ws2 = workbook.addWorksheet('Resumo Executivo');
  ws2.columns = [{ width: 50 }, { width: 20 }, { width: 16 }, { width: 18 }];

  let r2 = 1;
  function ex2Row(values, bg, txHex, bold = false, size = 11, height = 20, mergeEnd = 0) {
    const row = ws2.getRow(r2++);
    row.height = height;
    values.forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value = v;
      if (bg) applyFill(c, bg);
      applyFont(c, txHex, bold, size);
      applyAlign(c, i > 0 ? 'right' : 'left');
    });
    if (mergeEnd) ws2.mergeCells(`A${r2-1}:${mergeEnd}${r2-1}`);
    return row;
  }

  ex2Row(['BRALOG LOGÍSTICA — RESUMO EXECUTIVO','','',''], DARK, '10B981', true, 16, 36, 'D');
  ex2Row(['Relatório: Análise de GESTÃO DE ESTOQUE','','',''], DARK, 'D1FAE5', false, 11, 22, 'D');
  ex2Row([`Data: ${dateStr}`,'','',''], DARK, '6EE7B7', false, 10, 18, 'D');
  ex2Row(['','','',''], DARK, 'FFFFFF', false, 10, 6, 'D');
  ex2Row(['','','',''], VERDE, 'FFFFFF', false, 10, 4, 'D');

  ex2Row(['INDICADORES GERAIS','','',''], VERDE, 'FFFFFF', true, 11, 24, 'D');

  const urgentes = data.filter(d => d.status === 'Urgente');
  const medios   = data.filter(d => d.status === 'Médio');
  const baixos   = data.filter(d => d.status === 'Baixo');

  ex2Row(['Total de Produtos Analisados', data.length, '', ''], 'F9FAFB', DARK);
  ex2Row([`Urgentes (≤ 15 dias)`, urgentes.length, '', ''], URG_BG, URG_TX, true);
  ex2Row([`Médios (16–45 dias)`, medios.length, '', ''], MED_BG, MED_TX, true);
  ex2Row([`Baixos (> 45 dias)`, baixos.length, '', ''], LOW_BG, LOW_TX, true);

  ex2Row(['','','',''], null, 'FFFFFF', false, 10, 10);
  ex2Row(['TOP 10 — MAIOR VOLUME DE SAÍDAS','','',''], VERDE, 'FFFFFF', true, 11, 22, 'D');
  ex2Row(['Produto','Saídas 90d','',''], '047857', 'FFFFFF', true, 10, 20);
  const top10 = [...data].sort((a,b) => b.saidas90d - a.saidas90d).slice(0, 10);
  top10.forEach((d, i) => ex2Row([d.desc, d.saidas90d,'',''], i%2===0 ? ROW_A : ROW_B, DARK, false, 10, 18));

  ex2Row(['','','',''], null, 'FFFFFF', false, 10, 10);
  ex2Row(['PRODUTOS URGENTES — REPOSIÇÃO IMEDIATA','','',''], 'EF4444', 'FFFFFF', true, 11, 22, 'D');
  ex2Row(['Produto','SKU','Estoque','Dias Cobertura'], '991B1B', 'FFFFFF', true, 10, 20);
  urgentes.slice(0, 50).forEach((d, i) => {
    ex2Row([d.desc, d.sku, d.estoqueAtual, d.diasCobertura >= 9999 ? 'N/A' : d.diasCobertura],
      i%2===0 ? URG_BG : ROW_B, URG_TX, false, 10, 18);
  });

  // Salvar
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'BRALOG_Gestao_de_Estoque_' + now.toISOString().slice(0, 10) + '.xlsx';
  a.click();
  URL.revokeObjectURL(a.href);
}





function downloadFile(content, filename, type) {
  const blob = new Blob(['\uFEFF' + content], { type: type + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ==========================================
// INTEGRAÇÃO COM SUPABASE E HISTÓRICO
// ==========================================

async function saveCurrentAnalysis(totalProdutos) {
  if (!analysisData || analysisData.length === 0) {
    console.warn('[saveCurrentAnalysis] analysisData vazio — abortando save.');
    return;
  }

  const clientName = document.getElementById('clientSelector')?.value || 'Desconhecido';
  const userId = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  // Deep copy para não passar referência mutável
  const dataToSave = JSON.parse(JSON.stringify(analysisData));

  const statusEl = document.getElementById('dataStatus');
  const qtd = totalProdutos || dataToSave.length;

  // Mostra "salvando" imediatamente (antes do await)
  statusEl.innerHTML =
    '<span class="status-dot offline" style="background:#f59e0b;"></span>' +
    '<span class="status-text" style="color:#f59e0b;">💾 Salvando análise no banco...</span>';

  console.log('[saveCurrentAnalysis] Iniciando save →', clientName, '— produtos:', dataToSave.length);

  try {
    const saved = await saveAnalysisSnapshot(clientName, dataToSave, userId);

    if (saved) {
      console.log('[saveCurrentAnalysis] ✅ Salvo! ID:', saved.id);
      statusEl.innerHTML =
        '<span class="status-dot online"></span>' +
        '<span class="status-text" style="color:#10b981;">✅ ' + qtd + ' produtos salvos no histórico!</span>';

      // Após 3 segundos volta ao status normal
      setTimeout(() => {
        statusEl.innerHTML =
          '<span class="status-dot online"></span>' +
          '<span class="status-text">' + qtd + ' produtos analisados</span>';
      }, 3000);

      loadHistoryList(); // Atualiza a aba Histórico
    } else {
      console.error('[saveCurrentAnalysis] saveAnalysisSnapshot retornou null/false.');
      statusEl.innerHTML =
        '<span class="status-dot offline"></span>' +
        '<span class="status-text" style="color:#ef4444;">❌ Banco de dados rejeitou a gravação.</span>';
    }
  } catch(e) {
    console.error('[saveCurrentAnalysis] Exceção:', e);
    const msg = e.message || String(e);
    let userMsg = msg;
    if (msg.includes('row-level security') || msg.includes('violates')) {
      userMsg = 'Banco bloqueado por segurança (RLS). Execute as políticas SQL no schema.sql';
    } else if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('42P01')) {
      userMsg = 'Tabela analysis_snapshots não existe. Execute o schema.sql no Supabase';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('load')) {
      userMsg = 'Erro de rede. Verifique sua conexão com o Supabase';
    } else if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized')) {
      userMsg = 'Credenciais do banco inválidas ou sem permissão';
    }
    statusEl.innerHTML =
      '<span class="status-dot offline" style="background:#ef4444;"></span>' +
      '<span class="status-text" style="color:#ef4444;font-size:11px;">❌ ' + userMsg + '</span>';
    // Também mostra o erro técnico no console e num alert se for admin
    console.error('[saveCurrentAnalysis] Detalhe:', msg);
  }
}

async function manualSave() {
  const btn = document.getElementById('btnManualSave');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="status-dot offline" style="background:#f59e0b; margin-right:6px;"></span> Salvando...';
  }
  await saveCurrentAnalysis(analysisData ? analysisData.length : 0);
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px; margin-bottom:-2px;"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar Análise';
  }
}
window.manualSave = manualSave;


async function changeClient() {
  const clientName = document.getElementById('clientSelector').value;
  document.getElementById('histClientName').innerText = clientName;
  
  // Tentar carregar última análise
  document.getElementById('dataStatus').innerHTML = '<span class="status-dot offline"></span><span class="status-text">Carregando dados...</span>';
  
  try {
    const latest = await fetchLatestSnapshot(clientName);
    if (latest && latest.analysis_data) {
      let data = latest.analysis_data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { console.error('Erro ao fazer parse dos dados:', e); }
      }
      analysisData = data;
      
      document.getElementById('dataStatus').innerHTML =
        '<span class="status-dot online"></span><span class="status-text">Dados recuperados do histórico (' + new Date(latest.created_at).toLocaleDateString('pt-BR') + ')</span>';

      document.getElementById('btnManualSave').style.display = 'inline-flex';
      renderMetrics();
      renderTable(analysisData);
      renderAlerts();
      setTimeout(renderCharts, 200);
    } else {
      // Limpa a tela se não houver dados
      analysisData = [];
      document.getElementById('dataStatus').innerHTML = '<span class="status-dot offline"></span><span class="status-text">Sem dados para ' + clientName + '</span>';
      document.getElementById('btnManualSave').style.display = 'none';
    }
    
    // Aplica a regra de visibilidade correta dependendo da aba selecionada
    updateVisibility();

  } catch (e) {
    console.error(e);
  }

  // Atualiza lista do histórico
  loadHistoryList();
}

async function loadHistoryList() {
  const clientName = document.getElementById('clientSelector').value;
  document.getElementById('histClientName').innerText = clientName;
  const tbody = document.getElementById('historyTableBody');
  
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando histórico...</td></tr>';
  
  try {
    const history = await fetchHistory(clientName);
    
    if (!history || history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 30px; color: var(--text-tertiary);">Nenhum histórico encontrado para este cliente.</td></tr>';
      return;
    }
    
    tbody.innerHTML = history.map(item => {
      const dateStr = new Date(item.created_at).toLocaleString('pt-BR');
      return `
        <tr>
          <td><strong>${dateStr}</strong></td>
          <td><span style="color:var(--text-secondary)">Calculado na carga</span></td>
          <td><span class="badge badge-urgent">Automático</span></td>
          <td>
            <button class="btn-outline" style="padding: 4px 10px; font-size: 12px; margin-right: 8px;" onclick="restoreSnapshot('${item.id}', '${dateStr}')">Carregar</button>
            <button class="btn-outline" style="padding: 4px 10px; font-size: 12px; border-color: var(--danger); color: var(--danger);" onclick="removeSnapshot('${item.id}')">Deletar</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--danger);">Erro ao carregar histórico. Verifique a conexão com o Supabase.</td></tr>';
  }
}

async function restoreSnapshot(id, dateStr) {
  try {
    let data = await loadSnapshotData(id);
    if (data) {
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch(e) { console.error('Erro ao fazer parse dos dados:', e); }
      }
      analysisData = data;
      
      const elEmpty = document.getElementById('emptyState');
      if (elEmpty) elEmpty.style.display = 'none';
      
      const elPanels = document.getElementById('tabPanels');
      if (elPanels) elPanels.style.display = 'block';
      
      const elStatus = document.getElementById('dataStatus');
      if (elStatus) elStatus.innerHTML = '<span class="status-dot online"></span><span class="status-text">Histórico de ' + dateStr + ' recuperado</span>';
      
      const btnSave = document.getElementById('btnManualSave');
      if (btnSave) btnSave.style.display = 'inline-flex';

      renderMetrics();
      renderTable(analysisData);
      renderAlerts();
      setTimeout(renderCharts, 200);
      
      // Muda pra aba Painel
      const navPainel = document.getElementById('nav-painel');
      if (navPainel) navPainel.click();
    } else {
      alert('Não foi possível recuperar os dados do banco.');
    }
  } catch(e) {
    alert('Erro detalhado: ' + e.message);
    console.error('Erro em restoreSnapshot:', e);
  }
}

async function removeSnapshot(id) {
  if (confirm('Tem certeza que deseja deletar este registro do histórico?')) {
    const success = await deleteSnapshot(id);
    if (success) {
      loadHistoryList();
    } else {
      alert('Erro ao deletar do banco de dados.');
    }
  }
}

// Inicializa a carga inicial do primeiro cliente
document.addEventListener('DOMContentLoaded', () => {
  // Atraso curto para dar tempo do supabase.js injetar o cliente
  setTimeout(() => {
    handleRouting();
    changeClient();
  }, 500);
});
