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
	memoLabel: '**✍️ メモ**: ',
	mergedHeading: '## 📌 ハイライト',
	headingKeyword: 'ハイライト',
	keepBackups: true,
	maxBackups: 30,
};

function escapeRegex(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function memoLabelRe(settings) {
	return new RegExp(escapeRegex(settings.memoLabel.trim()) + '\\s*', 'g');
}

function highlightHeadingRe(settings) {
	return new RegExp('^#{2,3} .*' + escapeRegex(settings.headingKeyword));
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

/** Return the deduplicated note text, or null when nothing changes. */
function dedupe(original, settings = DEFAULT_SETTINGS) {
	const headingRe = highlightHeadingRe(settings);
	const [frontmatter, body] = splitFrontmatter(original);

	const parts = body.split(/(?=^## )/m);
	const preamble = parts[0];
	const highlightBodies = [];
	const otherSections = [];
	for (const sec of parts.slice(1)) {
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
				.setDesc('Only notes inside this folder are watched and deduplicated.')
				.addText((t) =>
					t.setValue(this.plugin.settings.folder).onChange(async (v) => {
						this.plugin.settings.folder = obsidian
							.normalizePath(v.trim())
							.replace(/\/+$/, '');
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
				callback: () => this.sweep(),
			});

			this.addSettingTab(new ClippingsDedupeSettingTab(this.app, this));
		}

		async loadSettings() {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		}

		async saveSettings() {
			await this.saveData(this.settings);
		}

		/**
		 * Vault-relative prefix of the watched folder, or null when the
		 * setting is empty/whitespace — then nothing is watched, instead of
		 * accidentally matching the whole vault.
		 */
		folderPrefix() {
			const folder = this.settings.folder.trim();
			if (!folder) return null;
			const normalized = obsidian.normalizePath(folder).replace(/\/+$/, '');
			return normalized === '/' || normalized === '' ? null : normalized + '/';
		}

		sweep() {
			const prefix = this.folderPrefix();
			if (!prefix) return;
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (file.path.startsWith(prefix)) this.run(file);
			}
		}

		schedule(file) {
			const prefix = this.folderPrefix();
			if (!prefix) return;
			if (!file || !file.path || !file.path.startsWith(prefix)) return;
			if (!file.path.endsWith('.md')) return;
			if (this.applying.has(file.path)) return;
			const prev = this.timers.get(file.path);
			if (prev) window.clearTimeout(prev);
			this.timers.set(
				file.path,
				window.setTimeout(() => {
					this.timers.delete(file.path);
					this.run(file);
				}, 2000)
			);
		}

		async backup(file, text) {
			if (!this.settings.keepBackups) return;
			const dir = `${this.manifest.dir}/backups`;
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
			const stamp = new Date().toISOString().replace(/[:.]/g, '-');
			await adapter.write(`${dir}/${file.basename}.${stamp}.md`, text);
			// prune oldest snapshots beyond the limit
			const listing = await adapter.list(dir);
			const files = listing.files.sort();
			for (const old of files.slice(0, Math.max(0, files.length - this.settings.maxBackups))) {
				await adapter.remove(old);
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
	module.exports = { dedupe, parseUnits, splitFrontmatter, DEFAULT_SETTINGS };
}
