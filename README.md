# Clippings Dedupe

An Obsidian plugin that merges duplicate highlights appended by the official
[Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper) — while
protecting the comments you write under each quote.

## The problem

The Web Clipper cannot append "only new highlights" to an existing note
([obsidian-clipper#180](https://github.com/obsidianmd/obsidian-clipper/issues/180)).
When you read an article in multiple sittings — highlight, clip, come back,
highlight more, clip again — every clip appends **all** highlights on the page,
duplicating the ones you already saved. The clipper intentionally has no
knowledge of your vault, so the merge has to happen vault-side. That is what
this plugin does.

## What it does

Whenever a note inside your clippings folder changes, the plugin:

- **Merges blocks quoting the same highlight.** The quoted text itself is the
  identity — no IDs or hashes needed.
- **Never loses your writing.** If one copy of a quote has your comment under
  it, that copy wins. If two copies have different comments, both are kept.
- **Folds appended sections back in.** Sections like `## Highlights (added …)`
  that the clipper appends at the bottom are merged into the main highlights
  section, keeping your closing section at the end of the note.
- **Backs up before rewriting.** A snapshot of the note is saved under the
  plugin's `backups/` folder (pruned to the most recent 30 by default).

It runs 2 seconds after a clip lands, sweeps all clippings on startup, and can
be triggered manually via the command palette (`Deduplicate all clippings now`).
Notes without duplicates are never touched.

## Expected note shape

The plugin understands notes whose highlight sections look like:

```markdown
## Highlights

> first highlighted passage

**Note**: your comment here

---

> second highlighted passage

**Note**:
```

The folder, comment label, and section headings are all configurable in
settings, so any clipper template with a `quote → comment label → ---`
structure works. A matching Web Clipper template pair (create + append) is
included in [`templates/`](templates/), with Japanese variants in
[`templates/ja/`](templates/ja/).

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Clippings folder | `Clippings` | Only notes in this folder are watched |
| Comment label | `**Note**: ` | Label under each quote; written comments are always preserved |
| Highlights heading keyword | `Highlight` | `##` headings containing this word are treated as highlight sections |
| Merged section heading | `## Highlights` | Heading for the merged section |
| Keep backups | on | Snapshot notes before rewriting |

## Install

Until the plugin is accepted into the community catalog:

1. Copy `main.js` and `manifest.json` into
   `<vault>/.obsidian/plugins/clippings-dedupe/`
2. Settings → Community plugins → turn off Restricted mode → enable
   **Clippings Dedupe**

Or install via [BRAT](https://github.com/TfTHacker/obsidian42-brat) with this
repository.

## Development

```bash
npm test          # run the node test suite (no build step — main.js is plain JS)
npm run deploy    # run tests, then copy main.js + manifest.json into your vault
                  # (put your vault path in .vaultpath first)
```

---

## 日本語での説明

公式Web Clipperは「新規ハイライトだけを追記」できません（[#180](https://github.com/obsidianmd/obsidian-clipper/issues/180)）。
記事を分割して読みながらクリップすると、ページ上の全ハイライトが毎回追記され、
保存済みの引用が重複します。クリッパーは意図的にvaultの中身を知らない設計のため、
マージはvault側でやるしかない——それをこのプラグインが担当します。

- 同じ引用文のブロックを1つに統合（引用テキスト自体がID）
- **メモが書かれているブロックを優先して残す。書いたメモは絶対に消えない**
- 末尾に追記された「（... 追加）」セクションをメインのハイライトセクションに合流
- 書き換え前にプラグインフォルダ内 `backups/` へスナップショット保存

フォルダ名・メモラベル・見出しは設定で変更できます。日本語テンプレート
（`templates/ja/`）を使う場合は、設定画面で次の3つを合わせてください:

- Comment label → `**✍️ メモ**: `
- Highlights heading keyword → `ハイライト`
- Merged section heading → `## 📌 ハイライト`
