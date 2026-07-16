'use strict';

const assert = require('assert');
const { selectBackupsToPrune, backupFileName, backupStamp } = require('../main.js');

const DIR = '.obsidian/plugins/clippings-dedupe/backups';
function b(name, stamp) {
	return `${DIR}/${name}.${stamp}.md`;
}

let passed = 0;
function ok(name, fn) {
	fn();
	passed++;
	console.log(`  ok - ${name}`);
}

ok('keeps everything while under the limit', () => {
	const files = [b('note-a', '2026-07-16T01-00-00-000Z'), b('note-b', '2026-07-16T02-00-00-000Z')];
	assert.deepStrictEqual(selectBackupsToPrune(files, 30), []);
});

ok('prunes by age, not by note name order', () => {
	// a lexicographic sort would prune 'aaa' first; the oldest 'zzz' must go instead
	const files = [
		b('zzz-old-note', '2026-07-01T00-00-00-000Z'),
		b('aaa-new-note', '2026-07-16T00-00-00-000Z'),
		b('mmm-mid-note', '2026-07-10T00-00-00-000Z'),
	];
	assert.deepStrictEqual(selectBackupsToPrune(files, 2), [b('zzz-old-note', '2026-07-01T00-00-00-000Z')]);
});

ok('prunes multiple files oldest-first', () => {
	const files = [
		b('n1', '2026-07-04T00-00-00-000Z'),
		b('n2', '2026-07-02T00-00-00-000Z'),
		b('n3', '2026-07-03T00-00-00-000Z'),
		b('n4', '2026-07-01T00-00-00-000Z'),
	];
	assert.deepStrictEqual(selectBackupsToPrune(files, 1), [
		b('n4', '2026-07-01T00-00-00-000Z'),
		b('n2', '2026-07-02T00-00-00-000Z'),
		b('n3', '2026-07-03T00-00-00-000Z'),
	]);
});

ok('reads the stamp correctly for note names containing dots', () => {
	const files = [
		b('ver.2.0.リリースノート', '2026-07-01T00-00-00-000Z'),
		b('普通のノート', '2026-07-16T00-00-00-000Z'),
	];
	assert.deepStrictEqual(selectBackupsToPrune(files, 1), [
		b('ver.2.0.リリースノート', '2026-07-01T00-00-00-000Z'),
	]);
});

ok('never selects files that are not in this plugin\'s own format', () => {
	const strangers = [
		`${DIR}/stray-file.md`, // no stamp at all
		`${DIR}/manual-copy.2026-07-01.md`, // date with missing digits
		`${DIR}/note.2026-7-1T00-00-00-000Z.md`, // malformed date digits
		`${DIR}/note.2026-07-01T00-00-00-000Z.txt`, // wrong extension
		`${DIR}/future-format.2026-07-01T00-00-00-000Z-v2.md`, // hypothetical future format
	];
	const own = [b('note', '2026-07-16T00-00-00-000Z'), b('note', '2026-07-15T00-00-00-000Z')];
	assert.deepStrictEqual(selectBackupsToPrune([...strangers, ...own], 1), [
		b('note', '2026-07-15T00-00-00-000Z'),
	]);
	// unrecognized files do not count toward the limit either
	assert.deepStrictEqual(selectBackupsToPrune(strangers, 0), []);
});

ok('generation and parsing share one format (codec round-trip)', () => {
	const date = new Date('2026-07-16T01:23:45.678Z');
	const name = backupFileName('メモ.付き.ノート', date);
	assert.strictEqual(name, 'メモ.付き.ノート.2026-07-16T01-23-45-678Z.md');
	assert.strictEqual(backupStamp(`${DIR}/${name}`), '2026-07-16T01-23-45-678Z');
	assert.deepStrictEqual(selectBackupsToPrune([`${DIR}/${name}`], 0), [`${DIR}/${name}`]);
});

ok('does not mutate the input array', () => {
	const files = [b('n1', '2026-07-02T00-00-00-000Z'), b('n2', '2026-07-01T00-00-00-000Z')];
	const copy = files.slice();
	selectBackupsToPrune(files, 1);
	assert.deepStrictEqual(files, copy);
});

console.log(`\n${passed} tests passed`);
