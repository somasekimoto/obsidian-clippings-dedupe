/*
 * Clippings Dedupe
 *
 * The official Obsidian Web Clipper cannot append "only new highlights" to an
 * existing note (obsidian-clipper#180): re-clipping a page appends every
 * highlight again, duplicating the ones you already saved. The clipper
 * intentionally has no knowledge of your vault, so the merge has to happen
 * vault-side — that is what this plugin does.
 *
 * Whenever a note in your clippings folder changes, it:
 *   - merges blocks that quote the same highlight (the quoted text itself is
 *     the identity — no IDs or hashes needed)
 *   - always prefers the copy that has your comment written under it, so
 *     nothing you wrote is ever lost
 *   - folds appended "highlights (added ...)" sections back into the main
 *     highlights section, keeping your closing section at the bottom
 *   - snapshots the note into this plugin's backups/ folder before rewriting
 */

'use strict';

let obsidian = null;
try {
	obsidian = require('obsidian');
} catch (e) {
	// running under node (tests) — the obsidian module only exists inside the app
}

const DEFAULT_SETTINGS = {
	folder: 'Clippings',
	memoLabel: '**Note**: ',
	mergedHeading: '## Highlights',
	headingKeyword: 'Highlight',
	keepBackups: true,
	maxBackups: 30,
};

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function memoLabelRe(settings) {
	return new RegExp(escapeRegex(settings.memoLabel.trim()) + '\\s*', 'g');
}

// H2 only, matching the section split in dedupe() — an H3 containing the
// keyword belongs to whatever H2 section it sits under and is never treated
// as a highlight section of its own.
function highlightHeadingRe(settings) {
	return new RegExp('^## .*' + escapeRegex(settings.headingKeyword));
}

/**
 * Merge persisted data over the defaults, rejecting values that would make
 * the parser misbehave: labels/headings/keyword must be non-empty strings
 * (an empty keyword would over-match every H2), maxBackups a number >= 1.
 * `folder` accepts any string — empty means watching is off.
 */
function sanitizeSettings(raw) {
	const s = Object.assign({}, DEFAULT_SETTINGS);
	if (raw && typeof raw === 'object') {
		if (typeof raw.folder === 'string') s.folder = raw.folder;
		for (const k of ['memoLabel', 'mergedHeading', 'headingKeyword']) {
			if (typeof raw[k] === 'string' && raw[k].trim() !== '') s[k] = raw[k];
		}
		if (typeof raw.keepBackups === 'boolean') s.keepBackups = raw.keepBackups;
		if (typeof raw.maxBackups === 'number' && isFinite(raw.maxBackups) && raw.maxBackups >= 1) {
			s.maxBackups = Math.floor(raw.maxBackups);
		}
	}
	return s;
}

function splitFrontmatter(text) {
	if (text.startsWith('---\n')) {
		const end = text.indexOf('\n---\n', 4);
		if (end !== -1) return [text.slice(0, end + 5), text.slice(end + 5)];
	}
	return ['', text];
}

/** Split a section body on '---' separators into quote+comment units. */
function parseUnits(sectionBody, settings) {
	const labelRe = memoLabelRe(settings);
	const units = [];
	for (let chunk of sectionBody.split(/\n---\n/)) {
		chunk = chunk.replace(/^\n+/, '').replace(/\n+$/, '');
		if (!chunk.trim()) continue;
		const lines = chunk.split('\n');
		const quoteLines = lines.filter((l) => l.startsWith('>'));
		const key = quoteLines
			.map((l) => l.replace(/^>\s?/, ''))
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
		const memo = lines
			.filter((l) => !l.startsWith('>'))
			.join('\n')
			.replace(labelRe, '')
			.trim();
		if (quoteLines.length === 0) {
			if (memo) {
				// writing without a quote: keep it attached to the previous unit
				const last = units[units.length - 1];
				if (last) {
					last.text += '\n\n' + chunk;
					last.memo = (last.memo + '\n' + memo).trim();
				} else {
					units.push({ text: chunk, key: '', memo });
				}
			}
			// an empty comment label with no quote is clipper residue — drop it
			continue;
		}
		units.push({ text: chunk, key, memo });
	}
	return units;
}

/*
 * Folder-scope helpers. `settings.folder` is stored in canonical form
 * (normalized, trimmed, no trailing slash) — loadSettings() and the settings
 * UI both canonicalize through canonicalFolder(), and consumers derive the
 * match prefix through computeFolderPrefix(). An empty canonical value means
 * "watching is off": the plugin rewrites notes, so an unset scope must fail
 * closed rather than fall back to some implicit folder.
 */
function canonicalFolder(raw, normalizePathFn) {
	const folder = (typeof raw === 'string' ? raw : '').trim();
	if (!folder) return '';
	const normalized = (normalizePathFn ? normalizePathFn(folder) : folder).replace(/\/+$/, '');
	return normalized === '/' ? '' : normalized;
}

/** Vault-relative prefix to match note paths against, or null when off. */
function computeFolderPrefix(raw, normalizePathFn) {
	const canonical = canonicalFolder(raw, normalizePathFn);
	return canonical ? canonical + '/' : null;
}

/*
 * Backup file name codec. Generation and parsing share one format so a future
 * format change cannot silently break pruning: `<note basename>.<stamp>.md`,
 * where the stamp is an ISO timestamp with ':' and '.' replaced by '-'
 * (millisecond precision keeps names collision-free and lexicographically
 * sortable by age).
 */
const BACKUP_STAMP_RE = /\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.md$/;

function backupFileName(baseName, date) {
	return `${baseName}.${date.toISOString().replace(/[:.]/g, '-')}.md`;
}

function backupStamp(path) {
	const m = path.match(BACKUP_STAMP_RE);
	return m ? m[1] : null;
}

/**
 * Pick which backup files to delete so that at most `max` snapshots remain,
 * deleting the oldest first. Only files that strictly match this plugin's
 * own backup name format are ever candidates — legacy files, manual copies,
 * or future formats are left alone (and don't count toward the limit).
 * The cap is a simple global bound on disk usage; dedupe rewrites are rare,
 * so per-note retention would add complexity without protecting much.
 */
function selectBackupsToPrune(paths, max) {
	const stamped = paths.filter((p) => backupStamp(p) !== null);
	return stamped
		.sort((a, b) => backupStamp(a).localeCompare(backupStamp(b)))
		.slice(0, Math.max(0, stamped.length - max));
}

/** Return the deduplicated note text, or null when nothing changes. */
function dedupe(original, settings = DEFAULT_SETTINGS) {
	const headingRe = highlightHeadingRe(settings);
	const [frontmatter, body] = splitFrontmatter(original);

	// split() does not break at a zero-width match on position 0, so when the
	// body starts directly with a heading the first section would otherwise be
	// swallowed into the preamble and never merged
	const parts = body.split(/(?=^## )/m);
	let preamble = parts[0];
	let sections = parts.slice(1);
	if (/^## /.test(preamble)) {
		sections = parts;
		preamble = '';
	}
	const highlightBodies = [];
	const otherSections = [];
	for (const sec of sections) {
		const heading = sec.split('\n', 1)[0];
		if (headingRe.test(heading)) {
			highlightBodies.push(sec.slice(heading.length));
		} else {
			otherSections.push(sec);
		}
	}
	if (highlightBodies.length === 0) return null;

	const units = [];
	for (const secBody of highlightBodies) units.push(...parseUnits(secBody, settings));

	// merge duplicates: the copy with a written comment wins
	const kept = [];
	const byKey = new Map();
	for (const u of units) {
		const prev = u.key ? byKey.get(u.key) : undefined;
		if (prev === undefined) {
			if (u.key) byKey.set(u.key, u);
			kept.push(u);
		} else if (!prev.memo && u.memo) {
			kept[kept.indexOf(prev)] = u;
			byKey.set(u.key, u);
		} else if (prev.memo && u.memo && prev.memo !== u.memo) {
			// two different comments on the same quote: keep both, delete nothing
			kept.push(u);
		}
	}
	if (kept.length === 0) return null;

	const section =
		settings.mergedHeading + '\n\n' + kept.map((u) => u.text).join('\n\n---\n\n') + '\n';
	let rebuilt = frontmatter + preamble + section + '\n' + otherSections.join('');
	rebuilt = rebuilt.replace(/\n{3,}/g, '\n\n');
	if (!rebuilt.endsWith('\n')) rebuilt += '\n';

	const normalizedOriginal = original.replace(/\n{3,}/g, '\n\n');
	return rebuilt === normalizedOriginal ? null : rebuilt;
}

if (obsidian) {
	class ClippingsDedupeSettingTab extends obsidian.PluginSettingTab {
		constructor(app, plugin) {
			super(app, plugin);
			this.plugin = plugin;
		}

		display() {
			const { containerEl } = this;
			containerEl.empty();

			new obsidian.Setting(containerEl)
				.setName('Clippings folder')
				.setDesc('Only notes inside this folder are watched and deduplicated. Leave empty to turn watching off.')
				.addText((t) =>
					t.setValue(this.plugin.settings.folder).onChange(async (v) => {
						this.plugin.settings.folder = canonicalFolder(v, obsidian.normalizePath);
						await this.plugin.saveSettings();
					})
				);

			new obsidian.Setting(containerEl)
				.setName('Comment label')
				.setDesc('The label your clipper template puts under each quote. Blocks whose comment is written are always preserved.')
				.addText((t) =>
					t.setValue(this.plugin.settings.memoLabel).onChange(async (v) => {
						this.plugin.settings.memoLabel = v;
						await this.plugin.saveSettings();
					})
				);

			new obsidian.Setting(containerEl)
				.setName('Highlights heading keyword')
				.setDesc('Sections whose ## heading contains this word are treated as highlight sections and merged into one.')
				.addText((t) =>
					t.setValue(this.plugin.settings.headingKeyword).onChange(async (v) => {
						this.plugin.settings.headingKeyword = v;
						await this.plugin.saveSettings();
					})
				);

			new obsidian.Setting(containerEl)
				.setName('Merged section heading')
				.setDesc('Heading used for the merged highlights section.')
				.addText((t) =>
					t.setValue(this.plugin.settings.mergedHeading).onChange(async (v) => {
						this.plugin.settings.mergedHeading = v;
						await this.plugin.saveSettings();
					})
				);

			new obsidian.Setting(containerEl)
				.setName('Keep backups')
				.setDesc('Snapshot each note into the plugin folder before rewriting it.')
				.addToggle((t) =>
					t.setValue(this.plugin.settings.keepBackups).onChange(async (v) => {
						this.plugin.settings.keepBackups = v;
						await this.plugin.saveSettings();
					})
				);
		}
	}

	class ClippingsDedupePlugin extends obsidian.Plugin {
		async onload() {
			await this.loadSettings();
			this.timers = new Map();
			this.applying = new Set();

			this.registerEvent(
				this.app.vault.on('modify', (file) => this.schedule(file))
			);
			// sweep on startup — collects clips that arrived while the app was closed
			this.app.workspace.onLayoutReady(() => this.sweep());

			this.addCommand({
				id: 'dedupe-all',
				name: 'Deduplicate all clippings now',
				callback: () => {
					if (this.folderPrefix() === null) {
						new obsidian.Notice(
							'Clippings Dedupe is off: set a clippings folder in the plugin settings.'
						);
						return;
					}
					this.sweep();
				},
			});

			this.addSettingTab(new ClippingsDedupeSettingTab(this.app, this));
		}

		async loadSettings() {
			// type-validate persisted data first, then canonicalize the folder
			// (legacy/hand-edited values are canonicalized once at load time)
			this.settings = sanitizeSettings(await this.loadData());
			this.settings.folder = canonicalFolder(this.settings.folder, obsidian.normalizePath);
		}

		async saveSettings() {
			await this.saveData(this.settings);
		}

		folderPrefix() {
			return computeFolderPrefix(this.settings.folder, obsidian.normalizePath);
		}

		/** True when `path` is inside the watched folder as of right now. */
		inScope(path) {
			const prefix = this.folderPrefix();
			return prefix !== null && path.startsWith(prefix);
		}

		sweep() {
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (this.inScope(file.path)) this.run(file);
			}
		}

		schedule(file) {
			if (!file || !file.path || !this.inScope(file.path)) return;
			if (!file.path.endsWith('.md')) return;
			if (this.applying.has(file.path)) return;
			const prev = this.timers.get(file.path);
			if (prev) window.clearTimeout(prev);
			this.timers.set(
				file.path,
				window.setTimeout(() => {
					this.timers.delete(file.path);
					// the folder setting may have changed while this timer was
					// pending — re-check the scope at execution time
					if (this.inScope(file.path)) this.run(file);
				}, 2000)
			);
		}

		async backup(file, text) {
			if (!this.settings.keepBackups) return;
			const dir = `${this.manifest.dir}/backups`;
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
			// notes with the same basename in different folders can collide on
			// the same millisecond — bump the stamp until the name is free
			let time = Date.now();
			let target = `${dir}/${backupFileName(file.basename, new Date(time))}`;
			while (await adapter.exists(target)) {
				time += 1;
				target = `${dir}/${backupFileName(file.basename, new Date(time))}`;
			}
			// writing the snapshot must succeed before the note is rewritten,
			// so failures here propagate; pruning below is best-effort upkeep
			await adapter.write(target, text);
			try {
				const listing = await adapter.list(dir);
				for (const old of selectBackupsToPrune(listing.files, this.settings.maxBackups)) {
					await adapter.remove(old);
				}
			} catch (e) {
				console.error('[clippings-dedupe] backup pruning failed', e);
			}
		}

		async run(file) {
			try {
				const text = await this.app.vault.cachedRead(file);
				if (dedupe(text, this.settings) === null) return;
				await this.backup(file, text);
				this.applying.add(file.path);
				try {
					await this.app.vault.process(file, (current) => {
						// recompute against the freshest content to avoid clobbering edits
						return dedupe(current, this.settings) ?? current;
					});
					new obsidian.Notice(`Merged duplicate highlights: ${file.basename}`);
				} finally {
					window.setTimeout(() => this.applying.delete(file.path), 3000);
				}
			} catch (e) {
				console.error('[clippings-dedupe]', e);
			}
		}

		onunload() {
			for (const t of this.timers.values()) window.clearTimeout(t);
		}
	}

	module.exports = ClippingsDedupePlugin;
} else {
	module.exports = {
		dedupe,
		parseUnits,
		splitFrontmatter,
		sanitizeSettings,
		canonicalFolder,
		computeFolderPrefix,
		selectBackupsToPrune,
		backupFileName,
		backupStamp,
		DEFAULT_SETTINGS,
	};
}
