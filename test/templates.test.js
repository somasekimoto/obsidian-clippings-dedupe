'use strict';

// Contract tests: the bundled Web Clipper templates, the runtime defaults,
// and the README-documented Japanese profile must stay in sync. Labels and
// headings are duplicated across those places by nature; these tests fail
// when one side drifts.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS, dedupe } = require('../main.js');

function template(rel) {
	return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'templates', rel), 'utf8'));
}

// README「日本語での説明」に記載している設定値と templates/ja/ の対応
const JA_PROFILE = {
	memoLabel: '**✍️ メモ**: ',
	mergedHeading: '## 📌 ハイライト',
	headingKeyword: 'ハイライト',
};

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('英語テンプレート(create)は DEFAULT_SETTINGS と一致する', () => {
	const t = template('highlights-create.json');
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.memoLabel));
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.mergedHeading + '\n'));
	assert(new RegExp('^## .*' + DEFAULT_SETTINGS.headingKeyword, 'm').test(t.noteContentFormat));
});

ok('英語テンプレート(append)は DEFAULT_SETTINGS と一致する', () => {
	const t = template('highlights-append.json');
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.memoLabel));
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.mergedHeading + ' (added '));
	assert.strictEqual(t.behavior, 'append-specific');
});

ok('日本語テンプレートは README 記載の設定プロファイルと一致する', () => {
	for (const rel of ['ja/highlights-create.json', 'ja/highlights-append.json']) {
		const t = template(rel);
		assert(t.noteContentFormat.includes(JA_PROFILE.memoLabel), `${rel}: memoLabel`);
		assert(t.noteContentFormat.includes(JA_PROFILE.mergedHeading), `${rel}: mergedHeading`);
		assert(
			new RegExp('^## .*' + JA_PROFILE.headingKeyword, 'm').test(t.noteContentFormat),
			`${rel}: headingKeyword`
		);
	}
});

ok('英語テンプレートの追記見出しはデフォルト設定の dedupe で拾える', () => {
	// append テンプレートの見出し（変数展開後の形）がハイライトセクションとして認識されること
	const appendedHeading = '## Highlights (added 2026-07-16)';
	const note =
		'## Highlights\n\n> quote one\n\n**Note**: \n\n' +
		`${appendedHeading}\n\n> quote one\n\n**Note**: \n\n---\n\n> quote two\n\n**Note**: \n`;
	const out = dedupe(note);
	assert.notStrictEqual(out, null);
	assert.strictEqual(out.split('quote one').length - 1, 1);
	assert(out.includes('quote two'));
	assert(!out.includes('(added'));
});

ok('create/append テンプレートは同じ noteNameFormat と path を持つ（追記先が一致する）', () => {
	for (const dir of ['', 'ja/']) {
		const c = template(`${dir}highlights-create.json`);
		const a = template(`${dir}highlights-append.json`);
		assert.strictEqual(c.noteNameFormat, a.noteNameFormat, `${dir}: noteNameFormat`);
		assert.strictEqual(c.path, a.path, `${dir}: path`);
	}
});

console.log(`\n${passed} tests passed`);
