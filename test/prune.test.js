'use strict';

const assert = require('assert');
const { selectBackupsToPrune } = require('../main.js');

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

ok('上限以内なら何も消さない', () => {
	const files = [b('note-a', '2026-07-16T01-00-00-000Z'), b('note-b', '2026-07-16T02-00-00-000Z')];
	assert.deepStrictEqual(selectBackupsToPrune(files, 30), []);
});

ok('ノート名ではなく古い順に消える', () => {
	// 辞書順ソートだと 'aaa' が先に消えてしまうが、正しくは最古の 'zzz' が消える
	const files = [
		b('zzz-old-note', '2026-07-01T00-00-00-000Z'),
		b('aaa-new-note', '2026-07-16T00-00-00-000Z'),
		b('mmm-mid-note', '2026-07-10T00-00-00-000Z'),
	];
	assert.deepStrictEqual(selectBackupsToPrune(files, 2), [b('zzz-old-note', '2026-07-01T00-00-00-000Z')]);
});

ok('複数消すときも最古から順', () => {
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

ok('ドットを含むノート名でもスタンプを正しく読む', () => {
	const files = [
		b('ver.2.0.リリースノート', '2026-07-01T00-00-00-000Z'),
		b('普通のノート', '2026-07-16T00-00-00-000Z'),
	];
	assert.deepStrictEqual(selectBackupsToPrune(files, 1), [
		b('ver.2.0.リリースノート', '2026-07-01T00-00-00-000Z'),
	]);
});

ok('スタンプが読めないファイルは最古扱いで先に消える', () => {
	const files = [`${DIR}/stray-file.md`, b('note', '2026-07-16T00-00-00-000Z')];
	assert.deepStrictEqual(selectBackupsToPrune(files, 1), [`${DIR}/stray-file.md`]);
});

ok('入力配列を破壊しない', () => {
	const files = [b('n1', '2026-07-02T00-00-00-000Z'), b('n2', '2026-07-01T00-00-00-000Z')];
	const copy = files.slice();
	selectBackupsToPrune(files, 1);
	assert.deepStrictEqual(files, copy);
});

console.log(`\n${passed} tests passed`);
