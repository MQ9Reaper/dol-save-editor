/* ============================================================================
   DOL 变量名 → 中文显示名 词典
   说明：
   - 只是 UI 显示，存档里的 key 仍写回原英文
   - 优先精确匹配 EXACT；未命中时用 PARTIAL 前缀/包含规则做兜底
   - 长期可继续补充
   ============================================================================ */
window.DOL_DICT = (function() {

// === 精确名 → 中文 ===
const EXACT = {
  // 时间 / 进度
  'time': '游戏内时间(分)',
  'days': '游戏天数',
  'daystart': '起始天数',
  'daysAtSchool': '在校天数',
  'daysOfRain': '连续下雨天数',
  'rentDay': '租金到期日',
  'renown': '声望',
  'schoolday': '上学日',
  'weather': '天气',
  'season': '季节',
  'currentseason': '当前季节',
  'temperature': '温度',
  'monthday': '日期',
  'month': '月份',
  'year': '年份',
  'hour': '小时',
  'minute': '分钟',

  // 货币 / 资源
  'money': '现金 (×100=英镑)',
  'pillsTaken': '已服药丸数',

  // 核心属性 / 道德倾向
  'submissive': '顺从度',
  'independence': '独立性',
  'awareness': '性认知',
  'allure': '魅力',
  'baseAllure': '基础魅力',
  'attractiveness': '吸引力',
  'beauty': '美貌',
  'deviancy': '变态度',
  'promiscuity': '滥交度',
  'exhibitionism': '裸露癖',
  'lewdness': '淫荡度',
  'willpower': '意志力',
  'confidence': '自信',
  'trauma': '心理创伤',

  // 战斗 / 技能
  'combat': '战斗等级',
  'combatSkill': '战斗技能',
  'physique': '体格',
  'tending': '园艺',
  'swimmingSkill': '游泳',
  'science': '科学',
  'maths': '数学',
  'english': '英语',
  'history': '历史',
  'skill_dance': '舞蹈',
  'skill_oral': '口交',
  'skill_handjob': '手交',
  'skill_anal': '肛交',
  'skill_vaginal': '阴交',
  'skill_seduction': '诱惑',

  // 状态 / 数值
  'tiredness': '疲劳',
  'stress': '压力',
  'arousal': '兴奋',
  'pain': '疼痛',
  'fatigue': '疲倦',
  'trauma_general': '一般创伤',
  'health': '生命值',

  // 身体
  'breastsize': '胸围尺码',
  'breastefficiency': '泌乳效率',
  'penissize': '阴茎尺寸',
  'testicles': '睾丸',
  'lactation': '泌乳',
  'milk': '产奶量',
  'pregnancy': '怀孕状态',
  'virginity': '处子状态',
  'hairtype': '发型',
  'haircolour': '发色',
  'hairlength': '发长',
  'eyeselect': '瞳色',
  'eyecolour': '瞳色',
  'skincolour': '肤色',
  'bodysize': '体型',
  'muscles': '肌肉',
  'tan': '晒痕',
  'freckles': '雀斑',
  'feminine': '女性化',
  'masculine': '男性化',
  'pubic': '阴毛',

  // 角色身份
  'player': '玩家',
  'name': '姓',
  'surname': '名',
  'pronouns': '代词',

  // 关系 / NPC
  'love': '好感度',
  'dom': '支配度',
  'lust': '欲望',
  'trust': '信任',
  'rapport': '默契',
  'rage': '愤怒值',

  // 系统
  'options': '游戏设置',
  'difficulty': '难度',
  'cheatdisable': '已禁作弊',
};

// === 前缀/包含规则（未精确命中时按顺序匹配第一个）===
const PARTIAL = [
  // NPC：love/dom 后缀
  { re: /^([A-Z][a-z]+)love$/,  zh: m => `${m[1]} 的好感度` },
  { re: /^([A-Z][a-z]+)dom$/,   zh: m => `${m[1]} 的支配度` },
  { re: /^([A-Z][a-z]+)lust$/,  zh: m => `${m[1]} 的欲望` },
  { re: /^([A-Z][a-z]+)trust$/, zh: m => `${m[1]} 的信任` },
  { re: /^([A-Z][a-z]+)rage$/,  zh: m => `${m[1]} 的愤怒` },

  // 服装
  { re: /^worn/,        zh: () => '当前穿着' },
  { re: /^wardrobes/,   zh: () => '衣柜' },
  { re: /clothing|outfit/i, zh: () => '服装相关' },

  // 物品 / 库存
  { re: /^inv_/,        zh: () => '物品' },
  { re: /^bag/,         zh: () => '背包' },
  { re: /toy/i,         zh: () => '玩具' },
  { re: /condom/i,      zh: () => '避孕套' },
  { re: /tampon/i,      zh: () => '卫生用品' },
  { re: /makeup/i,      zh: () => '化妆' },

  // 计数器
  { re: /count$/i,      zh: () => '计数' },
  { re: /total$/i,      zh: () => '总数' },
  { re: /timer$/i,      zh: () => '计时器' },
  { re: /timesince/i,   zh: () => '距上次时间' },

  // 标志位 / 事件
  { re: /Done$|Complete$/,  zh: () => '完成标志' },
  { re: /^firstTime/i,  zh: () => '首次事件' },
  { re: /met$|Met$/,    zh: () => '已认识' },
  { re: /^seen|Seen$/,  zh: () => '已见过' },
  { re: /found$|Found$/,zh: () => '已找到' },
  { re: /quest|Quest/,  zh: () => '任务进度' },
  { re: /^event/i,      zh: () => '事件' },

  // 身体相关
  { re: /breast/i,      zh: () => '胸部相关' },
  { re: /penis/i,       zh: () => '阴茎相关' },
  { re: /vagina/i,      zh: () => '阴道相关' },
  { re: /anal|anus/i,   zh: () => '肛门相关' },
  { re: /hair/i,        zh: () => '头发相关' },
  { re: /eye/i,         zh: () => '眼睛相关' },
  { re: /skin/i,        zh: () => '皮肤相关' },

  // 状态
  { re: /trauma/i,      zh: () => '创伤相关' },
  { re: /stress/i,      zh: () => '压力相关' },
  { re: /arous/i,       zh: () => '兴奋相关' },
];

return {
  /**
   * 给定一个变量 key，返回中文显示名；若无翻译返回 null
   */
  translate(key) {
    if (EXACT[key]) return EXACT[key];
    for (const r of PARTIAL) {
      const m = key.match(r.re);
      if (m) return r.zh(m);
    }
    return null;
  }
};

})();
