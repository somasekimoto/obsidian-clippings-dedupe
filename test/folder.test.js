'use strict';

const assert = require('assert');
const { canonicalFolder, computeFolderPrefix } = require('../main.js');

// Obsidian の normalizePath 相当の代役: バックスラッシュ→スラッシュ、連続スラッシュ圧縮、先頭スラッシュ除去
const fakeNormalize = (s) => s.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('通常のフォルダ名はそのまま', () => {
	assert.strictEqual(canonicalFolder('Clippings', fakeNormalize), 'Clippings');
	assert.strictEqual(computeFolderPrefix('Clippings', fakeNormalize), 'Clippings/');
});

ok('末尾スラッシュ・前後空白は正規化される', () => {
	assert.strictEqual(canonicalFolder('Clippings/', fakeNormalize), 'Clippings');
	assert.strictEqual(canonicalFolder('  Clippings  ', fakeNormalize), 'Clippings');
	assert.strictEqual(canonicalFolder('Clippings///', fakeNormalize), 'Clippings');
	assert.strictEqual(computeFolderPrefix('Clippings/', fakeNormalize), 'Clippings/');
});

ok('ネストしたフォルダも扱える', () => {
	assert.strictEqual(computeFolderPrefix('Web/Clippings', fakeNormalize), 'Web/Clippings/');
	assert.strictEqual(computeFolderPrefix('Web\\Clippings', fakeNormalize), 'Web/Clippings/');
});

ok('空・空白のみ・スラッシュのみは監視オフ (null)', () => {
	for (const v of ['', '   ', '/', '//', ' / ']) {
		assert.strictEqual(canonicalFolder(v, fakeNormalize), '', `canonical of ${JSON.stringify(v)}`);
		assert.strictEqual(computeFolderPrefix(v, fakeNormalize), null, `prefix of ${JSON.stringify(v)}`);
	}
});

ok('文字列以外が来ても落ちずにオフ扱い', () => {
	for (const v of [undefined, null, 42, {}]) {
		assert.strictEqual(computeFolderPrefix(v, fakeNormalize), null);
	}
});

ok('normalizePath なしでも同じ規則で動く（node テスト経路）', () => {
	assert.strictEqual(computeFolderPrefix('Clippings/', undefined), 'Clippings/');
	assert.strictEqual(computeFolderPrefix('', undefined), null);
});

ok('プレフィックス判定で兄弟フォルダに誤マッチしない', () => {
	const prefix = computeFolderPrefix('Clippings', fakeNormalize);
	assert.strictEqual('Clippings/note.md'.startsWith(prefix), true);
	assert.strictEqual('ClippingsArchive/note.md'.startsWith(prefix), false);
});

console.log(`\n${passed} tests passed`);
