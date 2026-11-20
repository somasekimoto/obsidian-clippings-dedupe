'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

// main.js does `require('obsidian')` at load time, and that module only
// exists inside the Obsidian app. Point Node's resolver at a local stand-in
// so the plugin class (not just the plain exported functions) can be loaded
// and exercised here. Each test/*.js file runs in its own process, so this
// does not leak into the other test files.
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	if (request === 'obsidian') return path.join(__dirname, 'support', 'obsidian-mock.js');
	return originalResolveFilename.call(this, request, ...rest);
};

const obsidian = require('obsidian');
const ClippingsDedupePlugin = require('../main.js');

// mirrors main.js's DEFAULT_SETTINGS — not importable here since, under the
// obsidian stand-in above, main.js exports the plugin class instead of the
// plain functions/constants object it exports when obsidian is absent.
const DEFAULT_SETTINGS = {
	folder: 'Clippings',
	memoLabel: '**Note**: ',
	mergedHeading: '## Highlights',
	headingKeyword: 'Highlight',
	keepBackups: true,
	maxBackups: 30,
};

// run()'s success path schedules a cleanup timer via window.setTimeout —
// stand in for it so the scheduled timer doesn't keep the process alive.
global.window = { setTimeout: (fn, ms) => setTimeout(fn, ms).unref(), clearTimeout };

let passed = 0;
async function ok(name, fn) {
	await fn();
	passed++;
	console.log(`  ok - ${name}`);
}

const DUPLICATE_NOTE =
	'## Highlights\n\n> the same highlight twice\n\n**Note**: \n\n---\n\n> the same highlight twice\n\n**Note**: \n';

function makePlugin(settings, vault) {
	const plugin = Object.create(ClippingsDedupePlugin.prototype);
	plugin.settings = settings;
	plugin.manifest = { dir: '.obsidian/plugins/clippings-dedupe' };
	plugin.applying = new Set();
	plugin.app = { vault };
	return plugin;
}

function withSilencedConsoleError(fn) {
	const calls = [];
	const original = console.error;
	console.error = (...args) => calls.push(args);
	return Promise.resolve(fn()).finally(() => {
		console.error = original;
	}).then(() => calls);
}

(async () => {
	await ok('a vault.process failure surfaces a Notice naming the file, not just console.error', async () => {
		obsidian.Notice.sent.length = 0;
		const file = { path: 'Clippings/x.md', basename: 'x' };
		const plugin = makePlugin({ ...DEFAULT_SETTINGS, keepBackups: false }, {
			cachedRead: async () => DUPLICATE_NOTE,
			process: async () => {
				throw new Error('disk write failed');
			},
		});

		const errorCalls = await withSilencedConsoleError(() => plugin.run(file));

		assert.strictEqual(errorCalls.length, 1, 'console.error should still fire');
		assert.strictEqual(obsidian.Notice.sent.length, 1, 'exactly one user-visible Notice should fire');
		assert(obsidian.Notice.sent[0].includes('x'), 'Notice should name the file');
		assert(obsidian.Notice.sent[0].includes('disk write failed'), 'Notice should include the error');
	});

	await ok('a backup() write failure surfaces a Notice naming the file, and never reaches vault.process', async () => {
		obsidian.Notice.sent.length = 0;
		const file = { path: 'Clippings/y.md', basename: 'y' };
		let processCalled = false;
		const plugin = makePlugin({ ...DEFAULT_SETTINGS, keepBackups: true }, {
			cachedRead: async () => DUPLICATE_NOTE,
			process: async () => {
				processCalled = true;
			},
			adapter: {
				exists: async () => false,
				mkdir: async () => {},
				write: async () => {
					throw new Error('disk full');
				},
				list: async () => ({ files: [] }),
				remove: async () => {},
			},
		});

		const errorCalls = await withSilencedConsoleError(() => plugin.run(file));

		assert.strictEqual(errorCalls.length, 1, 'console.error should still fire');
		assert.strictEqual(obsidian.Notice.sent.length, 1, 'exactly one user-visible Notice should fire');
		assert(obsidian.Notice.sent[0].includes('y'), 'Notice should name the file');
		assert(obsidian.Notice.sent[0].includes('disk full'), 'Notice should include the error');
		assert.strictEqual(processCalled, false, 'a failed backup must not be followed by the rewrite');
	});

	console.log(`\n${passed} tests passed`);
})();
