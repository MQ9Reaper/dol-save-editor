/* ============================================================================
   DOL Save Editor - app.js
   功能：解码 LZString Base64 → JSON；分类展示变量并允许编辑；
        编辑后写回 state.delta[0]，截断后续历史，重新 LZString.compressToBase64。
   ============================================================================ */

// ====== 全局状态 ======
const STATE = {
  rawText: null,        // 原始 base64 字符串
  decoded: null,        // 解码后的完整对象 {id, state:{index, expired, seed, loadedVersion, delta}, idx}
  vars: null,           // 当前可编辑的 variables 对象（来自 delta[0]）
  variablesPath: null,  // 在 decoded 内部到 variables 的路径（用于回写）
  fileName: 'edited.save',
  changed: new Set(),   // 已修改的字段名（用于高亮）
  currentTab: 'common'
};

// ====== 分类规则 ======
// 关键词匹配，把 variables 划入不同分类（同一变量可能命中多个，按顺序优先）
const CATEGORIES = [
  { id: 'common',     name: '⭐ 常用属性',   match: ['money','time','daysOfRain','rentDay','renown','schoolday','timer','combat','combatSkill','submissive','independence','daystart','daysAtSchool','school'], desc: '游戏中最常调整的核心数值（钱、时间、声望、战斗等）' },
  { id: 'body',       name: '👤 角色身体',   match: ['breastsize','breast','penissize','penis','testicles','vagina','butt','hair','eyes','skin','height','weight','muscle','bodysize','breastefficiency','lactation','pregnancy','virginity','milk','feminine','masculine','tan','freckles'], desc: '外貌、身体特征、性别相关' },
  { id: 'stats',      name: '🎯 技能与状态', match: ['skill','attractiveness','allure','awareness','deviancy','promiscuity','exhibitionism','seduction','tend','swim','run','science','math','english','history','tiredness','stress','arousal','health','fatigue','pain','trauma','willpower','confidence','beauty'], desc: '能力值、心理状态、声誉相关' },
  { id: 'inventory',  name: '🎒 物品 & 服装', match: ['worn','inv','inventory','clothes','outfit','tampon','condom','toy','item','wardrobe','bag','accessory','jewellery','makeup'], desc: '装备、服装、随身物品' },
  { id: 'social',     name: '💞 关系 & NPC',  match: ['npc','love','dom','rage','lust','trust','rapport','bf','gf','partner','sydney','robin','kylar','whitney','leighton','great_hawk','wren','quincy','remy','alex','black_wolf','eden','avery','morgan','river','bailey','briar','charlie'], desc: 'NPC 好感度、关系数值' },
  { id: 'flags',      name: '🏷 剧情/事件标志', match: ['quest','event','flag','story','firstTime','met','found','seen','done','complete','start','count','progress'], desc: '剧情进度、事件触发标志' },
  { id: 'all',        name: '📋 全部变量',   match: null, desc: '所有 SugarCube 变量（按字母排序）' },
  { id: 'raw',        name: '⚙ 原始 JSON',   match: null, desc: '直接编辑解码后的完整 JSON（高级，请小心）' },
];

// ====== DOM ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ====== 工具函数 ======
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 2400);
}
function valueType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function tryParseNumber(s) {
  if (s === '' || s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ====== 解码 / 编码 ======
function decodeSave(base64Text) {
  const text = base64Text.trim();
  // 兼容用户可能直接提供 JSON
  if (text.startsWith('{')) {
    return JSON.parse(text);
  }
  const json = LZString.decompressFromBase64(text);
  if (!json) throw new Error('解码失败：不是有效的 LZString Base64 存档');
  return JSON.parse(json);
}
function encodeSave(obj) {
  const json = JSON.stringify(obj);
  return LZString.compressToBase64(json);
}

// ====== 找到当前 variables（最新帧）======
// SugarCube History 结构：
//   state.delta = [ moment0_full, moment1_diff, moment2_diff, ... ]
//   state.index = 当前 moment 索引
// 编辑策略：把 delta[0] 解出来给用户改 → 改完后把 delta 截断为 [delta[0]]，index 重置为 0。
// 这样不会被后续 diff 覆盖。
function extractVariables(decoded) {
  if (!decoded.state || !decoded.state.delta || !decoded.state.delta.length) {
    throw new Error('未找到 state.delta，存档结构可能不兼容');
  }
  const m0 = decoded.state.delta[0];
  if (!m0 || typeof m0 !== 'object' || !m0.variables) {
    throw new Error('delta[0].variables 缺失');
  }
  return m0.variables;
}

// ====== 主流程：加载文件 ======
function handleFile(file) {
  if (!file) return;
  STATE.fileName = file.name.replace(/\.save$/i, '') + '_edited.save';
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      STATE.rawText = text;
      const decoded = decodeSave(text);
      STATE.decoded = decoded;
      STATE.vars = extractVariables(decoded);
      STATE.changed.clear();
      enterEditor();
      toast('存档解码成功 ✓', 'success');
    } catch (err) {
      console.error(err);
      toast('解析失败：' + err.message, 'error');
    }
  };
  reader.onerror = () => toast('文件读取失败', 'error');
  reader.readAsText(file);
}

// ====== 进入编辑器 ======
function enterEditor() {
  $('#emptyView').classList.add('hidden');
  $('#editorView').classList.remove('hidden');
  $('#btnExport').disabled = false;
  $('#btnExportJson').disabled = false;
  renderTabs();
  selectTab('common');
  renderMeta();
}

function renderMeta() {
  const d = STATE.decoded;
  const total = Object.keys(STATE.vars).length;
  $('#metaBox').innerHTML = `
    <div><b>游戏 ID：</b>${escapeHtml(d.id || '-')}</div>
    <div><b>游戏版本：</b>${escapeHtml(d.state.loadedVersion || '-')}</div>
    <div><b>当前帧：</b>${d.state.index} / 总 ${d.state.delta.length}</div>
    <div><b>变量总数：</b>${total}</div>
    <div style="margin-top:8px;color:#9ca3af">导出时会把当前帧重置为 0（截断历史）以保证修改生效。</div>
  `;
}

// ====== 分类 ======
function categorize() {
  const result = {};
  CATEGORIES.forEach(c => result[c.id] = []);
  const keys = Object.keys(STATE.vars).sort();
  for (const k of keys) {
    let placed = false;
    for (const c of CATEGORIES) {
      if (!c.match) continue;
      if (c.match.some(kw => k.toLowerCase().includes(kw.toLowerCase()))) {
        result[c.id].push(k);
        placed = true;
        break;
      }
    }
    result.all.push(k);
    if (!placed) {
      // 未分类的也已经在 all 里
    }
  }
  return result;
}

function renderTabs() {
  const cats = categorize();
  const html = CATEGORIES.map(c => {
    const cnt = c.id === 'raw' ? '' : `<span class="cnt">${(cats[c.id]||[]).length}</span>`;
    return `<div class="tab" data-id="${c.id}">${c.name}${cnt}</div>`;
  }).join('');
  $('#tabs').innerHTML = html;
  $$('#tabs .tab').forEach(el => el.addEventListener('click', () => {
    selectTab(el.dataset.id);
    // 手机端：选完分类后自动收起侧栏
    if (window.innerWidth <= 720) closeSidebar();
  }));
}

// ====== 手机端侧栏控制 ======
function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#sidebarBackdrop').classList.remove('hidden');
}
function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').classList.add('hidden');
}

function selectTab(id) {
  STATE.currentTab = id;
  $$('#tabs .tab').forEach(el => el.classList.toggle('active', el.dataset.id === id));
  const cat = CATEGORIES.find(c => c.id === id);
  $('#panelTitle').textContent = cat.name;
  $('#panelSub').textContent = cat.desc;
  if (id === 'raw') renderRawJson();
  else renderFields(id);
}

// ====== 字段渲染 ======
function renderFields(catId) {
  const cats = categorize();
  let keys = cats[catId] || [];
  const q = ($('#searchBox').value || '').trim().toLowerCase();
  if (q) keys = keys.filter(k => k.toLowerCase().includes(q));

  if (!keys.length) {
    $('#grid').innerHTML = `<div style="color:#9ca3af;padding:20px;font-size:14px">没有匹配的变量。</div>`;
    return;
  }

  const html = keys.map(k => fieldHtml(k, STATE.vars[k])).join('');
  $('#grid').innerHTML = html;

  // 绑定事件
  $$('.field').forEach(el => {
    const key = el.dataset.key;
    const input = el.querySelector('[data-edit]');
    if (!input) return;
    input.addEventListener('input', () => onFieldChange(key, input, el));
    input.addEventListener('change', () => onFieldChange(key, input, el));
  });
}

function fieldHtml(key, val) {
  const t = valueType(val);
  const changed = STATE.changed.has(key) ? ' changed' : '';
  let editor = '';
  if (t === 'number') {
    editor = `<input data-edit type="number" step="any" value="${escapeHtml(val)}">`;
  } else if (t === 'string') {
    if (val.length > 60) {
      editor = `<textarea data-edit>${escapeHtml(val)}</textarea>`;
    } else {
      editor = `<input data-edit type="text" value="${escapeHtml(val)}">`;
    }
  } else if (t === 'boolean') {
    editor = `<label class="switch"><input data-edit type="checkbox" ${val ? 'checked' : ''}><span>${val ? 'true' : 'false'}</span></label>`;
  } else if (t === 'null') {
    editor = `<input data-edit type="text" value="" placeholder="null">
              <div class="hint">原值为 null，输入将作为字符串保存</div>`;
  } else {
    // object / array → JSON 编辑
    const j = JSON.stringify(val, null, 2);
    const lines = Math.min(20, j.split('\n').length);
    editor = `<textarea data-edit rows="${Math.max(4, lines)}">${escapeHtml(j)}</textarea>
              <div class="hint">JSON 编辑（${t}）。保存时会再次解析；语法错误会被忽略。</div>`;
  }
  return `
    <div class="field${changed}" data-key="${escapeHtml(key)}">
      <div class="field-head">
        <span class="field-name" title="${escapeHtml(key)}">${escapeHtml(key)}</span>
        <span class="field-type t-${t}">${t}</span>
      </div>
      ${editor}
    </div>`;
}

function onFieldChange(key, input, fieldEl) {
  const oldVal = STATE.vars[key];
  const t = valueType(oldVal);
  let newVal;
  try {
    if (t === 'number') {
      const n = tryParseNumber(input.value);
      if (n === null) return; // 非法不更新
      newVal = n;
    } else if (t === 'boolean') {
      newVal = !!input.checked;
      input.parentElement.querySelector('span').textContent = newVal ? 'true' : 'false';
    } else if (t === 'string' || t === 'null') {
      newVal = input.value;
    } else {
      // object/array
      newVal = JSON.parse(input.value);
    }
    STATE.vars[key] = newVal;
    STATE.changed.add(key);
    fieldEl.classList.add('changed');
  } catch (e) {
    // JSON 解析失败：不写回，但提示
    fieldEl.classList.remove('changed');
  }
}

// ====== 原始 JSON 编辑 ======
function renderRawJson() {
  const json = JSON.stringify(STATE.decoded, null, 2);
  $('#grid').innerHTML = `
    <div style="grid-column:1/-1">
      <div style="font-size:12px;color:#6b7280;margin-bottom:8px">⚠ 直接编辑完整解码后的 JSON。点击"应用 JSON 修改"后才会写入内存；导出仍走打包流程。</div>
      <textarea id="rawEditor" class="json-editor" spellcheck="false">${escapeHtml(json)}</textarea>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn primary" id="applyRaw">✔ 应用 JSON 修改</button>
        <button class="btn ghost" id="resetRaw">⟲ 重置</button>
      </div>
    </div>`;
  $('#applyRaw').addEventListener('click', () => {
    try {
      const obj = JSON.parse($('#rawEditor').value);
      STATE.decoded = obj;
      STATE.vars = extractVariables(obj);
      STATE.changed.clear();
      renderMeta();
      toast('JSON 已应用 ✓', 'success');
    } catch (e) {
      toast('JSON 解析失败：' + e.message, 'error');
    }
  });
  $('#resetRaw').addEventListener('click', () => renderRawJson());
}

// ====== 导出 ======
function exportSave() {
  try {
    // 把改过的 variables 写回 delta[0]
    STATE.decoded.state.delta[0].variables = STATE.vars;
    // 截断历史，回到全量帧
    STATE.decoded.state.delta = [STATE.decoded.state.delta[0]];
    STATE.decoded.state.index = 0;

    const compressed = encodeSave(STATE.decoded);
    downloadText(compressed, STATE.fileName);
    toast('已导出：' + STATE.fileName, 'success');
  } catch (e) {
    console.error(e);
    toast('导出失败：' + e.message, 'error');
  }
}
function exportJson() {
  const json = JSON.stringify(STATE.decoded, null, 2);
  downloadText(json, STATE.fileName.replace(/\.save$/, '.json'));
}
function downloadText(text, name) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 50);
}

// ====== 事件绑定 ======
window.addEventListener('DOMContentLoaded', () => {
  $('#btnLoad').addEventListener('click', () => $('#fileInput').click());
  const btnLoadBig = document.getElementById('btnLoadBig');
  if (btnLoadBig) btnLoadBig.addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => handleFile(e.target.files[0]));
  $('#btnExport').addEventListener('click', exportSave);
  $('#btnExportJson').addEventListener('click', exportJson);
  $('#btnHelp').addEventListener('click', () => $('#helpModal').classList.remove('hidden'));
  $('#closeHelp').addEventListener('click', () => $('#helpModal').classList.add('hidden'));

  // 手机端侧栏开关
  const btnMenu = document.getElementById('btnMenu');
  const btnClose = document.getElementById('btnCloseSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (btnMenu) btnMenu.addEventListener('click', openSidebar);
  if (btnClose) btnClose.addEventListener('click', closeSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // dropzone
  const dz = $('#dropzone');
  ;['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ;['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

  // 整页拖拽
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files[0] && !$('#editorView').classList.contains('hidden') === false) {
      handleFile(e.dataTransfer.files[0]);
    } else if (e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // 搜索
  $('#searchBox').addEventListener('input', () => {
    if (STATE.currentTab === 'raw') return;
    renderFields(STATE.currentTab);
  });
});
