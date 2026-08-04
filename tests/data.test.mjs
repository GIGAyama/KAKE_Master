/**
 * 中核ロジック（九九のカード生成）のテスト。
 * ここが壊れると、出題そのものが間違う。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, YOMI, makeCard, buildDeck } from '../js/data.js';

test('1〜9の段がそろっている', () => {
  assert.deepEqual(STAGES, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('カードの答えが正しい（81通りすべて）', () => {
  for (const a of STAGES) {
    for (let b = 1; b <= 9; b++) {
      const c = makeCard(a, b);
      assert.equal(c.ans, a * b, `${a}×${b}`);
      assert.equal(c.a, a);
      assert.equal(c.b, b);
    }
  }
});

test('となえかたが 81通りぶんある', () => {
  // YOMI[a][b-1] = 「a × b」の唱え方
  for (const a of STAGES) {
    assert.equal(YOMI[a].length, 9, `${a}の段のとなえかたが9つない`);
    for (let b = 1; b <= 9; b++) {
      const y = YOMI[a][b - 1];
      assert.ok(y && y.trim().length > 0, `${a}×${b} のとなえかたが無い`);
      assert.equal(makeCard(a, b).yomi, y);
    }
  }
});

test('カードのキーが 81通りで重複しない', () => {
  const keys = new Set();
  for (const a of STAGES) for (let b = 1; b <= 9; b++) keys.add(makeCard(a, b).key);
  assert.equal(keys.size, 81);
});

test('えらんだ段のカードだけが、段あたり9枚ずつ出る', () => {
  const deck = buildDeck([2, 5], 'asc');
  assert.equal(deck.length, 18);
  assert.ok(deck.every((c) => c.a === 2 || c.a === 5));
  assert.equal(deck.filter((c) => c.a === 2).length, 9);
  assert.equal(deck.filter((c) => c.a === 5).length, 9);
});

test('じゅんばん: 上から / 下から', () => {
  const asc = buildDeck([3], 'asc').map((c) => c.b);
  const desc = buildDeck([3], 'desc').map((c) => c.b);
  assert.deepEqual(asc, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(desc, [9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

test('バラバラでも枚数と中身は変わらない', () => {
  const asc = buildDeck([1, 2, 3], 'asc');
  const rnd = buildDeck([1, 2, 3], 'random');
  assert.equal(rnd.length, asc.length);
  const key = (c) => `${c.a}x${c.b}`;
  assert.deepEqual([...rnd.map(key)].sort(), [...asc.map(key)].sort());
});
