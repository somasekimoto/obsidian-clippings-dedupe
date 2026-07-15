'use strict';

const assert = require('assert');
const { sanitizeSettings, DEFAULT_SETTINGS } = require('../main.js');

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('data.json なし (null) ならデフォルト', () => {
	assert.deepStrictEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
	assert.deepStrictEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
});

ok('正常な値はそのまま採用される', () => {
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

ok('空の keyword/label/heading はデフォルトに戻る（全H2一致や例外を防ぐ）', () => {
	const s = sanitizeSettings({ headingKeyword: '', memoLabel: '   ', mergedHeading: '' });
	assert.strictEqual(s.headingKeyword, DEFAULT_SETTINGS.headingKeyword);
	assert.strictEqual(s.memoLabel, DEFAULT_SETTINGS.memoLabel);
	assert.strictEqual(s.mergedHeading, DEFAULT_SETTINGS.mergedHeading);
});

ok('非文字列の label/keyword はデフォルトに戻る', () => {
	const s = sanitizeSettings({ memoLabel: 42, headingKeyword: ['x'], mergedHeading: null });
	assert.strictEqual(s.memoLabel, DEFAULT_SETTINGS.memoLabel);
	assert.strictEqual(s.headingKeyword, DEFAULT_SETTINGS.headingKeyword);
	assert.strictEqual(s.mergedHeading, DEFAULT_SETTINGS.mergedHeading);
});

ok('folder は空文字を許す（監視オフの意味を保持）', () => {
	assert.strictEqual(sanitizeSettings({ folder: '' }).folder, '');
});

ok('不正な maxBackups はデフォルトに戻り、小数は切り捨て', () => {
	assert.strictEqual(sanitizeSettings({ maxBackups: 0 }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: -5 }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: NaN }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: '10' }).maxBackups, DEFAULT_SETTINGS.maxBackups);
	assert.strictEqual(sanitizeSettings({ maxBackups: 7.9 }).maxBackups, 7);
});

ok('未知のキーは無視される', () => {
	const s = sanitizeSettings({ evil: 'x', __proto__: { hacked: true } });
	assert.strictEqual('evil' in s, false);
	assert.strictEqual('hacked' in s, false);
});

console.log(`\n${passed} tests passed`);
