const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = process.cwd();
const { loadLexicon, loadPunctuationMap } = require('../.tmp-test/src/ime/lexicon.js');
const { QuickCodeIme } = require('../.tmp-test/src/ime/quickcode-ime.js');

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
