/* ============================================================================
   DOL Save Editor - app.js
   功能：解码 LZString Base64 → JSON；还原当前历史帧并允许编辑；
        重新编码当前帧的变量差量，再 LZString.compressToBase64。
   ============================================================================ */

// ====== 全局状态 ======
const STATE = {
  rawText: null,        // 原始 base64 字符串
  decoded: null,        // 解码后的完整对象 {id, state:{index, expired, seed, loadedVersion, delta}, idx}
  vars: null,           // 当前帧还原后的 variables 对象
  baselineVars: null,   // 加载时当前帧的 variables，用于判断修改
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

// 字段名渲染：有中文翻译就显示"中文 / 英文(小字)"，没有就纯英文
function fieldNameHtml(key) {
  const zh = (window.DOL_DICT && window.DOL_DICT.translate(key)) || null;
  if (!zh) return escapeHtml(key);
  return `<span class="zh">${escapeHtml(zh)}</span><span class="en">${escapeHtml(key)}</span>`;
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

// ====== 还原 SugarCube 当前历史帧 ======
// delta[0] 是完整帧，后续元素是与前一帧之间的差量。
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
function setOwnValue(obj, key, value) {
  Object.defineProperty(obj, key, {
    value, writable: true, enumerable: true, configurable: true
  });
}
function patchMoment(previous, diff) {
  const result = cloneJson(previous);
  if (diff == null) return result;
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) {
    throw new Error('历史帧差量格式无效');
  }
  for (const [key, value] of Object.entries(diff)) {
    if (value === 0) {
      delete result[key];
    } else if (Array.isArray(value)) {
      if (value[0] === 1 && Array.isArray(result)) {
        result.splice(value[1], value[2] - value[1] + 1);
      } else if (value[0] === 2) {
        setOwnValue(result, key, cloneJson(value[1]));
      } else if (value[0] === 3) {
        setOwnValue(result, key, new Date(value[1]));
      } else {
        throw new Error('不支持的历史帧差量操作');
      }
    } else {
      if (!Object.prototype.hasOwnProperty.call(result, key)) {
        throw new Error('历史帧差量引用了不存在的字段');
      }
      setOwnValue(result, key, patchMoment(result[key], value));
    }
  }
  return result;
}
function currentMoment(decoded, index = decoded.state?.index) {
  const state = decoded.state;
  if (!state || !Array.isArray(state.delta) || !state.delta.length) {
    throw new Error('未找到 state.delta，存档结构可能不兼容');
  }
  if (!Number.isInteger(index) || index < 0 || index >= state.delta.length) {
    throw new Error('state.index 超出历史帧范围');
  }
  let moment = state.delta[0];
  if (!moment || typeof moment !== 'object' || !moment.variables) {
    throw new Error('delta[0].variables 缺失');
  }
  for (let i = 1; i <= index; i++) {
    moment = patchMoment(moment, state.delta[i]);
  }
  if (!moment.variables || typeof moment.variables !== 'object' || Array.isArray(moment.variables)) {
    throw new Error('当前帧 variables 格式无效');
  }
  return moment;
}
function extractVariables(decoded) {
  return currentMoment(decoded).variables;
}

// 只重新计算当前帧的变量差量，保留此前的历史帧及索引。
function variableDiff(previous, current) {
  const diff = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      setOwnValue(diff, key, 0);
    } else if (!Object.prototype.hasOwnProperty.call(previous, key)
        || JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
      setOwnValue(diff, key, [2, cloneJson(current[key])]);
    }
  }
  return diff;
}
function buildSaveObject() {
  const output = cloneJson(STATE.decoded);
  if (JSON.stringify(STATE.baselineVars) === JSON.stringify(STATE.vars)) return output;

  const index = output.state.index;
  if (index === 0) {
    output.state.delta[0].variables = cloneJson(STATE.vars);
  } else {
    const previousVars = currentMoment(output, index - 1).variables;
    const diff = output.state.delta[index] || {};
    diff.variables = variableDiff(previousVars, STATE.vars);
    output.state.delta[index] = diff;
  }
  // 如果存档停在历史中的较早帧，编辑后旧的未来差量已不再适用。
  output.state.delta.length = index + 1;
  return output;
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
      STATE.baselineVars = cloneJson(STATE.vars);
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
    <div><b>当前帧：</b>${d.state.index + 1} / 总 ${d.state.delta.length}</div>
    <div><b>变量总数：</b>${total}</div>
    <div style="margin-top:8px;color:#9ca3af">编辑当前帧；修改后导出会保留此前历史。若当前帧后还有历史帧，将截断后续帧。</div>
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
  if (q) {
    keys = keys.filter(k => {
      if (k.toLowerCase().includes(q)) return true;
      const zh = window.DOL_DICT && window.DOL_DICT.translate(k);
      return zh && zh.toLowerCase().includes(q);
    });
  }

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
        <span class="field-name" title="${escapeHtml(key)}">${fieldNameHtml(key)}</span>
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
  const json = JSON.stringify(buildSaveObject(), null, 2);
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
      const vars = extractVariables(obj);
      STATE.decoded = obj;
      STATE.vars = vars;
      STATE.baselineVars = cloneJson(vars);
      STATE.changed.clear();
      renderTabs();
      selectTab('raw');
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
    const compressed = encodeSave(buildSaveObject());
    downloadText(compressed, STATE.fileName);
    toast('已导出：' + STATE.fileName, 'success');
  } catch (e) {
    console.error(e);
    toast('导出失败：' + e.message, 'error');
  }
}
function exportJson() {
  const json = JSON.stringify(buildSaveObject(), null, 2);
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
