'use strict';

const assert = require('assert');
const { dedupe } = require('../main.js');

const FM = `---
title: テスト記事
source: https://example.com/article
tags:
  - clippings
  - highlights
---
`;

const ABSTRACT = `> [!abstract]- 記事の概要
> これは記事の概要です。

`;

function unit(quote, memo = '') {
	return `> ${quote}\n\n**✍️ メモ**: ${memo}`.trimEnd() + (memo ? '' : ' ');
}

function note(units, extra = '') {
	return (
		FM +
		ABSTRACT +
		'## 📌 ハイライト\n\n' +
		units.join('\n\n---\n\n') +
		'\n\n## ✍️ 全体メモ\n\n- \n' +
		extra
	);
}

function appended(units, stamp = '2026-07-11T02:18:59+09:00') {
	return (
		`\n## 📌 ハイライト（${stamp} 追加）\n\n` + units.join('\n\n---\n\n') + '\n'
	);
}

const Q1 = '一つ目のハイライトです。長い文章がここに入ります。';
const Q2 = '二つ目のハイライトです。[リンク](https://example.com)も含みます。';
const Q3 = '三つ目の、まだノートに無い新しいハイライトです。';

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('重複はマージされ新規は残る', () => {
	const original = note([unit(Q1, '書いたメモ'), unit(Q2)]) + appended([unit(Q1), unit(Q2), unit(Q3)]);
	const out = dedupe(original);
	assert.notStrictEqual(out, null);
	assert.strictEqual(out.split(Q1).length - 1, 1);
	assert.strictEqual(out.split(Q2).length - 1, 1);
	assert(out.includes(Q3));
});

ok('書いたメモは絶対に消えない', () => {
	const original = note([unit(Q1, '大事なメモ')]) + appended([unit(Q1)]);
	const out = dedupe(original);
	assert(out.includes('大事なメモ'));
});

ok('メモは後から書いた方でも保護される', () => {
	const original = note([unit(Q1)]) + appended([unit(Q1, '後から書いたメモ')]);
	const out = dedupe(original);
	assert(out.includes('後から書いたメモ'));
	assert.strictEqual(out.split(Q1).length - 1, 1);
});

ok('同じ引用に別々のメモがあれば両方残す', () => {
	const original = note([unit(Q1, '最初のメモ')]) + appended([unit(Q1, '別の観点のメモ')]);
	const out = dedupe(original);
	assert(out.includes('最初のメモ'));
	assert(out.includes('別の観点のメモ'));
});

ok('追記セクションはメインに合流し全体メモが末尾に残る', () => {
	const original = note([unit(Q1)]) + appended([unit(Q3)]);
	const out = dedupe(original);
	assert(!out.includes('追加）'));
	assert.strictEqual(out.split('## 📌 ハイライト').length - 1, 1);
	assert(out.indexOf(Q3) < out.indexOf('## ✍️ 全体メモ'));
	assert(out.trimEnd().endsWith('-'));
});

ok('冪等: 一度整理したノートには手を出さない', () => {
	const original = note([unit(Q1, 'メモ'), unit(Q2)]) + appended([unit(Q1), unit(Q3)]);
	const out = dedupe(original);
	assert.strictEqual(dedupe(out), null);
});

ok('重複のないきれいなノートには手を出さない', () => {
	assert.strictEqual(dedupe(note([unit(Q1, 'メモ'), unit(Q2)])), null);
});

ok('ハイライトセクションが無いノートは対象外', () => {
	assert.strictEqual(dedupe(FM + '# ただのノート\n\n本文です。\n'), null);
});

ok('引用の無いはぐれた書き込みは前のブロックに保全される', () => {
	const original = note([unit(Q1, 'メモ') + '\n\n---\n\nはぐれた自由記述テキスト']) + appended([unit(Q1)]);
	const out = dedupe(original);
	assert(out.includes('はぐれた自由記述テキスト'));
});

ok('単位が全滅するケースでは書き換えない', () => {
	const original = FM + '## 📌 ハイライト\n\n**✍️ メモ**: \n';
	assert.strictEqual(dedupe(original), null);
});

console.log(`\n${passed} tests passed`);
