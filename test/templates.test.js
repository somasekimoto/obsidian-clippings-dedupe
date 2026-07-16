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

// the Japanese profile documented in the README's Japanese section, matching templates/ja/
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

ok('the English create template matches DEFAULT_SETTINGS', () => {
	const t = template('highlights-create.json');
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.memoLabel));
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.mergedHeading + '\n'));
	assert(new RegExp('^## .*' + DEFAULT_SETTINGS.headingKeyword, 'm').test(t.noteContentFormat));
});

ok('the English append template matches DEFAULT_SETTINGS', () => {
	const t = template('highlights-append.json');
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.memoLabel));
	assert(t.noteContentFormat.includes(DEFAULT_SETTINGS.mergedHeading + ' (added '));
	assert.strictEqual(t.behavior, 'append-specific');
});

ok('the Japanese templates match the README-documented profile', () => {
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

ok('the append template heading is recognized by dedupe with default settings', () => {
	// the append template's heading (as it looks after variable expansion) must count as a highlight section
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

ok('create/append templates share noteNameFormat and path (appends target the same note)', () => {
	for (const dir of ['', 'ja/']) {
		const c = template(`${dir}highlights-create.json`);
		const a = template(`${dir}highlights-append.json`);
		assert.strictEqual(c.noteNameFormat, a.noteNameFormat, `${dir}: noteNameFormat`);
		assert.strictEqual(c.path, a.path, `${dir}: path`);
	}
});

console.log(`\n${passed} tests passed`);
