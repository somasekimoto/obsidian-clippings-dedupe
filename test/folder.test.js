'use strict';

const assert = require('assert');
const { canonicalFolder, computeFolderPrefix } = require('../main.js');

// stand-in for Obsidian's normalizePath: backslashes to slashes, collapse duplicate slashes, strip the leading slash
const fakeNormalize = (s) => s.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '');

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('a plain folder name passes through unchanged', () => {
	assert.strictEqual(canonicalFolder('Clippings', fakeNormalize), 'Clippings');
	assert.strictEqual(computeFolderPrefix('Clippings', fakeNormalize), 'Clippings/');
});

ok('trailing slashes and surrounding whitespace are canonicalized', () => {
	assert.strictEqual(canonicalFolder('Clippings/', fakeNormalize), 'Clippings');
	assert.strictEqual(canonicalFolder('  Clippings  ', fakeNormalize), 'Clippings');
	assert.strictEqual(canonicalFolder('Clippings///', fakeNormalize), 'Clippings');
	assert.strictEqual(computeFolderPrefix('Clippings/', fakeNormalize), 'Clippings/');
});

ok('nested folders are handled', () => {
	assert.strictEqual(computeFolderPrefix('Web/Clippings', fakeNormalize), 'Web/Clippings/');
	assert.strictEqual(computeFolderPrefix('Web\\Clippings', fakeNormalize), 'Web/Clippings/');
});

ok('empty, whitespace-only, and slash-only values turn watching off (null)', () => {
	for (const v of ['', '   ', '/', '//', ' / ']) {
		assert.strictEqual(canonicalFolder(v, fakeNormalize), '', `canonical of ${JSON.stringify(v)}`);
		assert.strictEqual(computeFolderPrefix(v, fakeNormalize), null, `prefix of ${JSON.stringify(v)}`);
	}
});

ok('non-string input does not crash and reads as off', () => {
	for (const v of [undefined, null, 42, {}]) {
		assert.strictEqual(computeFolderPrefix(v, fakeNormalize), null);
	}
});

ok('works with the same rules without normalizePath (node test path)', () => {
	assert.strictEqual(computeFolderPrefix('Clippings/', undefined), 'Clippings/');
	assert.strictEqual(computeFolderPrefix('', undefined), null);
});

ok('prefix matching does not leak into sibling folders', () => {
	const prefix = computeFolderPrefix('Clippings', fakeNormalize);
	assert.strictEqual('Clippings/note.md'.startsWith(prefix), true);
	assert.strictEqual('ClippingsArchive/note.md'.startsWith(prefix), false);
});

console.log(`\n${passed} tests passed`);
