const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = process.cwd();
const { loadLexicon, loadPunctuationMap } = require('../.tmp-test/src/ime/lexicon.js');
const { QuickCodeIme } = require('../.tmp-test/src/ime/quickcode-ime.js');
const {
  KEY_LAYOUT,
  normalizeGuideKey,
  KEY_POP_ANIMATION,
  KEYBOARD_ANNOTATION_IDS,
  KEYBOARD_3D_VISUAL_POLICY,
  KEYBOARD_ASSET_BACKGROUND,
  KEYBOARD_POINTER_PROFILE,
  SUN_LIGHT_POLICY,
  derivePopDurationMs,
} = require('../.tmp-test/src/ui/input/keyboard-guide.js');
const { computeSunLightPositionFromPointer } = require('../.tmp-test/src/render/sun-light.js');

let lexicon;
let punctuationMap;
let originalFetch;

before(async () => {
  originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    const rel = url.startsWith('/') ? url.slice(1) : url;
    const filePath = path.resolve(ROOT, rel);
    try {
      const text = await fs.readFile(filePath, 'utf8');
      return new Response(text, { status: 200 });
    } catch {
      return new Response('', { status: 404 });
    }
  };

  lexicon = await loadLexicon();
  punctuationMap = await loadPunctuationMap();
});

after(() => {
  global.fetch = originalFetch;
});

function createIme() {
  return new QuickCodeIme(lexicon, 4, punctuationMap);
}

function input(ime, seq) {
  for (const ch of seq) {
    ime.handleKey({ key: ch });
  }
}

function candidatesFirstPage(seq) {
  const ime = createIme();
  input(ime, seq);
  return ime.getSnapshot().candidates;
}

function collectCandidates(seq, maxPages = 8) {
  const ime = createIme();
  input(ime, seq);
  const out = [];
  for (let i = 0; i < maxPages; i += 1) {
    const snap = ime.getSnapshot();
    for (const cand of snap.candidates) {
      out.push(cand);
    }
    const beforePage = snap.page;
    ime.handleKey({ key: '-' });
    const afterPage = ime.getSnapshot().page;
    if (afterPage === beforePage) break;
  }
  return out;
}

function firstText(seq) {
  return candidatesFirstPage(seq)[0]?.text ?? '';
}

test('IME-SESSION-01 raw 非空时支持 ; 作为码表输入键', () => {
  const ime = createIme();
  ime.handleKey({ key: 'd' });
  const ret = ime.handleKey({ key: ';' });
  assert.equal(ret.consumed, true);
  assert.equal(ime.getSnapshot().raw, 'd;');
});

test('IME-SESSION-02 好 的码表 hb 可命中', () => {
  assert.equal(firstText('hb'), '好');
});

test('IME-SESSION-03 连续输入 nhhbsmjd 可出现 你好世界', () => {
  const texts = collectCandidates('nhhbsmjd').map((c) => c.text);
  assert.ok(texts.includes('你好世界'));
});

test('IME-SESSION-04 长连续输入可命中 程序设计需要持续练习和反馈 (含大写补码)', () => {
  const texts = collectCandidates('crxusijixlymcuxclcxxhrGftke').map((c) => c.text);
  assert.ok(texts.some((t) => t.endsWith('练习和反馈')));
});

test('IME-SESSION-05 不用大写补码也可延续命中 程序设计需要持续练习和反馈', () => {
  const texts = collectCandidates('crxusijixlymcuxclcxxhrftke').map((c) => c.text);
  assert.ok(texts.some((t) => t.endsWith('练习和反馈')));
});

test('IME-SESSION-06 xulu 排序应优先 效率', () => {
  assert.equal(firstText('xulu'), '效率');
});

test('IME-SESSION-07 xlh 潜在候选应包含 需(~d) 且有 颉', () => {
  const cands = candidatesFirstPage('xlh');
  const texts = cands.map((c) => c.text);
  assert.ok(texts.includes('颉'));
  const xu = cands.find((c) => c.text === '需');
  assert.ok(xu);
  assert.equal(xu.pendingCode, 'd');
});

test('IME-SESSION-08 同字候选不重复（如 rhb 的 仍）', () => {
  const texts = collectCandidates('rhb').map((c) => c.text);
  const count = texts.filter((t) => t === '仍').length;
  assert.equal(count, 1);
});

test('IME-SESSION-09 yczistuz 可连续命中 验证所有', () => {
  const texts = collectCandidates('yczistuz').map((c) => c.text);
  assert.ok(texts.includes('验证所有'));
});

test('IME-SESSION-10 一简 ; 与 z 连续片段可命中 生成的', () => {
  assert.ok(collectCandidates('srchd;').map((c) => c.text).includes('生成的'));
  assert.ok(collectCandidates('srchdz').map((c) => c.text).includes('生成的'));
});

test('IME-SESSION-11 常见标点映射可上屏中文标点', () => {
  const ime = createIme();
  assert.equal(ime.handleKey({ key: ',' }).committedText, '，');
  assert.equal(ime.handleKey({ key: '.' }).committedText, '。');
  assert.equal(ime.handleKey({ key: '<' }).committedText, '；');
  assert.equal(ime.handleKey({ key: '>' }).committedText, '！');
  assert.equal(ime.handleKey({ key: '?' }).committedText, '？');
});

test('IME-SESSION-12 输入中插入标点时应先提交当前首候选再追加标点', () => {
  const ime = createIme();
  input(ime, 'nh');
  const first = ime.getSnapshot().candidates[0]?.text ?? '';
  const ret = ime.handleKey({ key: ',' });
  assert.equal(ret.committedText, `${first}，`);
});

test('IME-SESSION-13 多字词不显示补码提示 (~xx)', () => {
  const cands = collectCandidates('zrnxt');
  for (const cand of cands) {
    if (cand.text.length > 1) {
      assert.equal(cand.pendingCode, undefined);
    }
  }
});

test('IME-SESSION-14 zrnxth 不应空候选（左到右最大匹配回退）', () => {
  const cands = collectCandidates('zrnxth');
  assert.ok(cands.length > 0);
});

test('IME-SESSION-15 多音字变体应支持 zrym 命中 重要', () => {
  const texts = collectCandidates('zrym').map((c) => c.text);
  assert.ok(texts.includes('重要'));
});

test('IME-SESSION-16 sudjsohf 第一候选应为 手动审核', () => {
  assert.equal(firstText('sudjsohf'), '手动审核');
});

test('IME-SESSION-17 wrmh 第一候选应为 我们', () => {
  assert.equal(firstText('wrmh'), '我们');
});

test('IME-SESSION-18 一简/U简前导候选: 输入 u 应包含 有(~;) 或 有(~z)', () => {
  const cands = collectCandidates('u');
  const you = cands.filter((c) => c.text === '有').map((c) => c.pendingCode);
  assert.ok(you.includes(';') || you.includes('z'));
});

test('IME-SESSION-19 直命中词优先: wdrc 第一候选应为 围绕', () => {
  assert.equal(firstText('wdrc'), '围绕');
});

test('IME-SESSION-20 单独输入 ; 应直接上屏 顿号', () => {
  const ime = createIme();
  const ret = ime.handleKey({ key: ';' });
  assert.equal(ret.committedText, '、');
  assert.equal(ime.getSnapshot().raw, '');
});

test('IME-SESSION-21 大写补码连续组词: bhshR 应包含 不伤', () => {
  const texts = collectCandidates('bhshR').map((c) => c.text);
  assert.ok(texts.includes('不伤'));
});

test('IME-SESSION-22 ch 候选应优先 从，并包含 传(~j) 与 厂(~h)', () => {
  const cands = collectCandidates('ch');
  assert.equal(cands[0]?.text ?? '', '从');
  const chuan = cands.find((c) => c.text === '传');
  const chang = cands.find((c) => c.text === '厂');
  assert.ok(chuan);
  assert.ok(chang);
  assert.equal(chuan?.pendingCode?.toLowerCase() ?? '', 'j');
  assert.equal(chang?.pendingCode?.toLowerCase() ?? '', 'h');
});

test('IME-SESSION-23 Shift 切换英文模式后标点与字母半角直出', () => {
  const ime = createIme();
  ime.handleKey({ key: 'Shift' });
  ime.handleKeyUp({ key: 'Shift' });
  const a = ime.handleKey({ key: 'a' });
  const comma = ime.handleKey({ key: ',' });
  const dot = ime.handleKey({ key: '.' });
  assert.equal(a.committedText, 'a');
  assert.equal(comma.committedText, ',');
  assert.equal(dot.committedText, '.');
  assert.equal(ime.getSnapshot().raw, '');
});

test('IME-SESSION-24 Shift 组合输入大写时不切换模式', () => {
  const ime = createIme();
  ime.handleKey({ key: 'Shift' });
  ime.handleKey({ key: 'A' });
  ime.handleKeyUp({ key: 'Shift' });
  const snap = ime.getSnapshot();
  assert.equal(snap.mode, 'zh');
  assert.equal(snap.raw, 'A');
});

test('IME-SESSION-25 中文模式 raw 为空时可直接输入 0-9', () => {
  const ime = createIme();
  const out = [];
  for (const k of '0123456789') {
    out.push(ime.handleKey({ key: k }).committedText);
  }
  assert.equal(out.join(''), '0123456789');
  assert.equal(ime.getSnapshot().raw, '');
});

test('IME-SESSION-26 键位图按键归一化支持图例键与 Shift 符号', () => {
  assert.equal(normalizeGuideKey('A'), 'a');
  assert.equal(normalizeGuideKey(';'), 'semicolon');
  assert.equal(normalizeGuideKey('<'), 'comma');
  assert.equal(normalizeGuideKey('>'), 'period');
  assert.equal(normalizeGuideKey('?'), 'slash');
  assert.equal(normalizeGuideKey('Backspace'), null);
  assert.equal(normalizeGuideKey('F1'), null);
});

test('IME-SESSION-27 键盘冒泡动画参数应为放大并抬升', () => {
  assert.ok(KEY_POP_ANIMATION.peakScale > 1);
  assert.ok(KEY_POP_ANIMATION.settleScale > 1);
  assert.ok(KEY_POP_ANIMATION.liftPx >= 12);
  assert.ok(KEY_POP_ANIMATION.baseDurationMs >= 500);
});

test('IME-SESSION-28 键盘冒泡回落时长应随击打速度变化', () => {
  const fast = derivePopDurationMs(80);
  const mid = derivePopDurationMs(240);
  const slow = derivePopDurationMs(500);
  assert.equal(derivePopDurationMs(null), KEY_POP_ANIMATION.baseDurationMs);
  assert.equal(fast, KEY_POP_ANIMATION.minDurationMs);
  assert.equal(slow, KEY_POP_ANIMATION.maxDurationMs);
  assert.ok(fast < mid);
  assert.ok(mid < slow);
});

test('IME-SESSION-29 键盘冒泡应启用平滑回落模式', () => {
  assert.equal(KEY_POP_ANIMATION.smoothReturn, true);
});

test('IME-SESSION-30 键位图底部黄字图例应为单张整体图', () => {
  assert.ok(KEYBOARD_ANNOTATION_IDS.includes('hints-bottom'));
  assert.equal(KEYBOARD_ANNOTATION_IDS.includes('hint-riyue'), false);
  assert.equal(KEYBOARD_ANNOTATION_IDS.includes('hint-shui'), false);
});

test('IME-SESSION-31 键位切图背景应使用透明方案', () => {
  assert.equal(KEYBOARD_ASSET_BACKGROUND.annotations, 'transparent-yellow-only');
  assert.equal(KEYBOARD_ASSET_BACKGROUND.keys, 'source-original');
});

test('IME-SESSION-32 黄字说明图配置应包含底部整图与左右分区', () => {
  const expected = ['zone-left-top', 'zone-left-mid', 'zone-left-bot', 'zone-right-top', 'zone-right-mid', 'hints-bottom'];
  for (const id of expected) {
    assert.ok(KEYBOARD_ANNOTATION_IDS.includes(id));
  }
});

test('IME-SESSION-33 3D 键盘布局应包含 30 个键位与符号键', () => {
  assert.equal(KEY_LAYOUT.length, 30);
  const ids = new Set(KEY_LAYOUT.map((item) => item.id));
  for (const id of ['a', 'semicolon', 'comma', 'period', 'slash']) {
    assert.ok(ids.has(id));
  }
});

test('IME-SESSION-34 3D 键盘鼠标交互语义应固定', () => {
  assert.equal(KEYBOARD_POINTER_PROFILE.leftClick, 'commit-input');
  assert.equal(KEYBOARD_POINTER_PROFILE.rightButton, 'rotate-view');
  assert.equal(KEYBOARD_POINTER_PROFILE.rightClickTap, 'backspace');
  assert.equal(KEYBOARD_POINTER_PROFILE.middleButton, 'pan-view');
  assert.equal(KEYBOARD_POINTER_PROFILE.middleClickTap, 'shift-key');
  assert.equal(KEYBOARD_POINTER_PROFILE.wheel, 'zoom-view');
  assert.equal(KEYBOARD_POINTER_PROFILE.commitPhase, 'pointerup');
  assert.equal(KEYBOARD_POINTER_PROFILE.keyMotion, 'down-press-up-release');
});

test('IME-SESSION-35 3D 键盘应禁用底板背景', () => {
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.basePlate, 'none');
});

test('IME-SESSION-36 3D 键帽贴图应位于外侧正面', () => {
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.keyCapTextureFace, 'front');
});

test('IME-SESSION-37 3D 键盘应支持垂直旋转范围', () => {
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.minPolarAngle <= 0.01);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.maxPolarAngle >= 3.1);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.maxPolarAngle > KEYBOARD_3D_VISUAL_POLICY.minPolarAngle);
});

test('IME-SESSION-38 3D 键帽应使用单层渐变结构', () => {
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.keyCapStructure, 'single-tapered');
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyCapDepth >= 0.2);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyCapTopScale < 1);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyCapTopScale >= 0.85);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyCapVerticalSegments >= 6);
});

test('IME-SESSION-39 3D 键帽颜色与初始视角策略', () => {
  assert.equal(typeof KEYBOARD_3D_VISUAL_POLICY.keyCapSideColor, 'string');
  assert.equal(typeof KEYBOARD_3D_VISUAL_POLICY.keyCapTopColor, 'string');
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyboardTiltX <= -0.2);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.cameraInitialY >= 1.8);
});

test('IME-SESSION-40 3D 键盘初始位置应上移避免与目标区重叠', () => {
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyboardOffsetY >= 0.1);
});

test('IME-SESSION-41 3D 键盘空闲摇摆策略应关闭', () => {
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleMotionEnabled, false);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.idleResumeDelayMs >= 1000);
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleRockXAmplitude, 0);
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleRockZAmplitude, 0);
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleBobYAmplitude, 0);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.idleRockFrequencyHz > 0);
});

test('IME-SESSION-42 黄色底部说明图应上移且初始视角更立体', () => {
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyboardOffsetY >= 0.35);
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.hintsBottomLiftPx, 0);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyboardTiltX <= -0.35);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.cameraInitialY >= 2.3);
});

test('IME-SESSION-43 黄色底部说明图应与目标区保留安全距离', () => {
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyboardOffsetY >= 0.4);
});

test('IME-SESSION-44 鼠标左键按键物理反馈应为按下缩小松开回弹', () => {
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyPressScale < 1);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyPressDepth > 0);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyReleaseBounceScale > 0);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyReleaseLift > 0);
  assert.ok(KEYBOARD_3D_VISUAL_POLICY.keyReleaseDurationMs >= 120);
});

test('IME-SESSION-45 空闲时键盘摇摆应禁用', () => {
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleMotionEnabled, false);
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleRockXAmplitude, 0);
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleRockZAmplitude, 0);
  assert.equal(KEYBOARD_3D_VISUAL_POLICY.idleBobYAmplitude, 0);
});

test('IME-SESSION-46 构建类型声明应覆盖 three 与 OrbitControls', async () => {
  const dts = await fs.readFile(path.resolve(ROOT, 'src/three.d.ts'), 'utf8');
  assert.match(dts, /declare module 'three';/);
  assert.match(dts, /declare module 'three\/examples\/jsm\/controls\/OrbitControls\.js';/);
});

test('IME-SESSION-47 太阳光应与鼠标位置绑定并保留亮度参数', () => {
  assert.equal(SUN_LIGHT_POLICY.enabled, true);
  assert.equal(SUN_LIGHT_POLICY.motionBinding, 'pointer');
  assert.ok(SUN_LIGHT_POLICY.xAmplitude > 0);
  assert.ok(SUN_LIGHT_POLICY.baseY > 3);
  assert.ok(SUN_LIGHT_POLICY.arcHeight > 0);
  assert.ok(SUN_LIGHT_POLICY.intensity >= 1.2);
  assert.ok(SUN_LIGHT_POLICY.shadowMapSize >= 1024);
});

test('IME-SESSION-48 太阳光策略不再包含自动巡航周期参数', () => {
  assert.equal('cycleSeconds' in SUN_LIGHT_POLICY, false);
});

test('IME-SESSION-49 太阳光垂直移动应产生可见角度变化', () => {
  const top = computeSunLightPositionFromPointer(0.5, 0, SUN_LIGHT_POLICY);
  const bottom = computeSunLightPositionFromPointer(0.5, 1, SUN_LIGHT_POLICY);
  assert.ok(top.y > bottom.y);
  assert.ok(Math.abs(top.z - bottom.z) >= SUN_LIGHT_POLICY.zAmplitude * 4);

  const target = { x: 0, y: KEYBOARD_3D_VISUAL_POLICY.cameraTargetY, z: 0 };
  const normalize = (dx, dy, dz) => {
    const len = Math.hypot(dx, dy, dz);
    return { x: dx / len, y: dy / len, z: dz / len };
  };
  const toDir = (pos) => normalize(target.x - pos.x, target.y - pos.y, target.z - pos.z);
  const a = toDir(top);
  const b = toDir(bottom);
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const angleDeg = (Math.acos(dot) * 180) / Math.PI;
  assert.ok(angleDeg >= 15);
});
