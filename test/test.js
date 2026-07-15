'use strict';

const assert = require('assert');
const { dedupe, DEFAULT_SETTINGS } = require('../main.js');

const FM = `---
title: Test article
source: https://example.com/article
tags:
  - clippings
  - highlights
---
`;

const ABSTRACT = `> [!abstract]- Summary
> This is the article summary.

`;

function unit(quote, memo = '', label = '**Note**: ') {
	return `> ${quote}\n\n${label}${memo}`.trimEnd() + (memo ? '' : ' ');
}

function note(units, { heading = '## Highlights', closing = '## Closing notes' } = {}) {
	return (
		FM +
		ABSTRACT +
		heading +
		'\n\n' +
		units.join('\n\n---\n\n') +
		`\n\n${closing}\n\n- \n`
	);
}

function appended(units, { heading = '## Highlights', stamp = '2026-07-11T02:18:59+09:00' } = {}) {
	return `\n${heading} (added ${stamp})\n\n` + units.join('\n\n---\n\n') + '\n';
}

const Q1 = 'The first highlighted passage, a fairly long sentence.';
const Q2 = 'The second highlighted passage with a [link](https://example.com).';
const Q3 = 'A third, brand-new highlight that is not in the note yet.';

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('duplicates merge, new highlights survive', () => {
	const original = note([unit(Q1, 'my comment'), unit(Q2)]) + appended([unit(Q1), unit(Q2), unit(Q3)]);
	const out = dedupe(original);
	assert.notStrictEqual(out, null);
	assert.strictEqual(out.split(Q1).length - 1, 1);
	assert.strictEqual(out.split(Q2).length - 1, 1);
	assert(out.includes(Q3));
});

ok('written comments are never lost', () => {
	const original = note([unit(Q1, 'important comment')]) + appended([unit(Q1)]);
	assert(dedupe(original).includes('important comment'));
});

ok('a comment written on the later copy wins', () => {
	const original = note([unit(Q1)]) + appended([unit(Q1, 'comment written later')]);
	const out = dedupe(original);
	assert(out.includes('comment written later'));
	assert.strictEqual(out.split(Q1).length - 1, 1);
});

ok('two different comments on the same quote are both kept', () => {
	const original = note([unit(Q1, 'first comment')]) + appended([unit(Q1, 'a different take')]);
	const out = dedupe(original);
	assert(out.includes('first comment'));
	assert(out.includes('a different take'));
});

ok('appended sections fold into the main section, closing section stays last', () => {
	const original = note([unit(Q1)]) + appended([unit(Q3)]);
	const out = dedupe(original);
	assert(!out.includes('(added'));
	assert.strictEqual(out.split('## Highlights').length - 1, 1);
	assert(out.indexOf(Q3) < out.indexOf('## Closing notes'));
	assert(out.trimEnd().endsWith('-'));
});

ok('idempotent: a merged note is left alone', () => {
	const original = note([unit(Q1, 'comment'), unit(Q2)]) + appended([unit(Q1), unit(Q3)]);
	assert.strictEqual(dedupe(dedupe(original)), null);
});

ok('a clean note without duplicates is left alone', () => {
	assert.strictEqual(dedupe(note([unit(Q1, 'comment'), unit(Q2)])), null);
});

ok('notes without a highlights section are ignored', () => {
	assert.strictEqual(dedupe(FM + '# Just a note\n\nBody text.\n'), null);
});

ok('stray writing without a quote is preserved with the previous block', () => {
	const original = note([unit(Q1, 'comment') + '\n\n---\n\nstray free-form text']) + appended([unit(Q1)]);
	assert(dedupe(original).includes('stray free-form text'));
});

ok('never rewrites when no unit survives', () => {
	assert.strictEqual(dedupe(FM + '## Highlights\n\n**Note**: \n'), null);
});

ok('custom settings: Japanese labels and headings work end to end', () => {
	const settings = Object.assign({}, DEFAULT_SETTINGS, {
		memoLabel: '**✍️ メモ**: ',
		mergedHeading: '## 📌 ハイライト',
		headingKeyword: 'ハイライト',
	});
	const ja = (q, m = '') => unit(q, m, '**✍️ メモ**: ');
	const original =
		note([ja('一つ目のハイライト。', '書いたメモ'), ja('二つ目のハイライト。')], {
			heading: '## 📌 ハイライト',
			closing: '## ✍️ 全体メモ',
		}) +
		'\n## 📌 ハイライト（2026-07-11 追加）\n\n' +
		[ja('一つ目のハイライト。'), ja('新しいハイライト。')].join('\n\n---\n\n') +
		'\n';
	const out = dedupe(original, settings);
	assert.strictEqual(out.split('一つ目のハイライト。').length - 1, 1);
	assert(out.includes('書いたメモ'));
	assert(out.includes('新しいハイライト。'));
	assert(!out.includes('追加）'));
	assert(out.indexOf('新しいハイライト。') < out.indexOf('## ✍️ 全体メモ'));
});

console.log(`\n${passed} tests passed`);
