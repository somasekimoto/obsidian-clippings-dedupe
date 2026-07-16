'use strict';

const assert = require('assert');
const { sanitizeSettings, DEFAULT_SETTINGS } = require('../main.js');

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('missing data.json (null) yields the defaults', () => {
	assert.deepStrictEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
	assert.deepStrictEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
});

ok('valid values are taken as-is', () => {
	const s = sanitizeSettings({
		folder: 'Web/Clips',
		memoLabel: '**✍️ メモ**: ',
		mergedHeading: '## 📌 ハイライト',
		headingKeyword: 'ハイライト',
		keepBackups: false,
		maxBackups: 10,
	});
	assert.strictEqual(s.folder, 'Web/Clips');
	assert.strictEqual(s.memoLabel, '**✍️ メモ**: ');
	assert.strictEqual(s.keepBackups, false);
	assert.strictEqual(s.maxBackups, 10);
});

ok('empty keyword/label/heading fall back to defaults (prevents matching every H2)', () => {
	const s = sanitizeSettings({ headingKeyword: '', memoLabel: '   ', mergedHeading: '' });
	assert.strictEqual(s.headingKeyword, DEFAULT_SETTINGS.headingKeyword);
	assert.strictEqual(s.memoLabel, DEFAULT_SETTINGS.memoLabel);
	assert.strictEqual(s.mergedHeading, DEFAULT_SETTINGS.mergedHeading);
});

ok('non-string label/keyword fall back to defaults', () => {
	const s = sanitizeSettings({ memoLabel: 42, headingKeyword: ['x'], mergedHeading: null });
	assert.strictEqual(s.memoLabel, DEFAULT_SETTINGS.memoLabel);
	assert.strictEqual(s.headingKeyword, DEFAULT_SETTINGS.headingKeyword);
	assert.strictEqual(s.mergedHeading, DEFAULT_SETTINGS.mergedHeading);
});

ok('folder may be an empty string (meaning: watching is off)', () => {
	assert.strictEqual(sanitizeSettings({ folder: '' }).folder, '');
});

ok('invalid maxBackups falls back to default, fractions are floored', () => {
	assert.strictEqual(sanitizeSettings({ maxBackups: 0 }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: -5 }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: NaN }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: '10' }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: 7.9 }).maxBackups, 7);
});

ok('unknown keys are ignored', () => {
	const s = sanitizeSettings({ evil: 'x', __proto__: { hacked: true } });
	assert.strictEqual('evil' in s, false);
	assert.strictEqual('hacked' in s, false);
});

console.log(`\n${passed} tests passed`);
