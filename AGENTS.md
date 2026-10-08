# AGENTS.md

AI のエージェント向けの決まり。[docs/CODING.md](docs/CODING.md) の決まりも同じく守る。ここには AI だけに当てはまることを書く。

## コードを探す

- どこに何があるかは `npm run map`（各ファイルの 1 行目の説明の一覧）。フォルダーを渡すと絞れる（`npm run map -- src/hooks`）
- ファイルを足したら 1 行目に説明を書き、`npm run map -- --write` で docs/STRUCTURE.md を更新する
- 構造を見直すときは `npm run map -- --cochange` で、履歴でよく一緒に変わるファイルの組を見る（別の場所にあるのに一緒に変わるものが、まとめる候補）

## 訳文

- `src/i18n/*.json`（5 言語で約 220 KB）は直接開かない。`node scripts/i18n.mjs` で扱う
  - 探す: `list settings.`、`get menu.minimap`。画面の文言からキーを探すときは `find 保存先`、キーを使っているコードの場所は `where <key>`
  - 足す: `add <key> ja=… en=… ko=… zh_cn=… zh_tw=…`（同じ分類の最後に入る）
  - 変える、消す、名前を変える: `set`、`rm`、`mv`（`mv` はソースの参照も書き換える）
  - 比べる: `diff`（git と比較して変更・追加・削除されたキーを表示。`--lang ja` で絞る、`--cached` でステージを見る）
  - 終わったら `fmt`（分類ごとにまとめ、全言語を ja_jp と同じ並びにする）と `check`
- Analyzer、Converter、Extractor は `--dir analyzer/app/lang` のように指定する

## 設定

- 設定は `src/settings/items/` の分類のファイルに 1 行で定義する（`check`、`choice`、`number`、`value`）。型、既定値、検索の対象はそこから作られる
- 設定画面に出すときは `SettingsPages.tsx` の分類に `{S('名前')}` を足す。表示や押せるかが状況で変わる項目は `value` で定義し、画面は自前で作る
- 画面に出さない値（メニューの切り替え、覚えておく値）は `page` が null の集まり（`view`、`stored`）に置く
- 部品とフックは `useAppSettings()` で設定を直接読む。App から props で渡さない
- 表示メニューのオンとオフは `useToggleItem()` の `toggle('名前', { disabled })` で作る（名前は定義の label）

## 画面

- ダイアログを足すときは `src/hooks/useDialogs.ts` の `DialogId` に名前を足し、描画は `src/components/AppDialogs.tsx` に置く。開くのは `dialogs.opener('名前')`
- メニューの項目は `src/hooks/menus/`（メニューバーは menuBar.ts、右クリックは context.ts、両方に出るものは shared.ts）。App から渡す値の型は actions.ts
- 音声を書き換える操作（適用、伸縮、曲線の書き込み）は `src/hooks/editActions.ts`、ショートカットは `src/hooks/useEditorKeys.ts`、起動時の処理は `src/hooks/useStartup.ts`。useEditor はそれらを束ねる
- 文字の大きさは数字で書かず `pevenFont('base')`（xs 10、sm 11、md 12、base 13、lg 14、xl 16。PevenMUI の寸法）。選択肢の表などの定数は `src/constants/`

## 音声処理（DSP）

- wasm の関数を足すときは、`dsp/src/ffi.rs`、`src/dsp/worker.ts` の `DspExports` と `OPS`（表の 1 項目。リクエストの型はここから作られる）、`src/dsp/engine.ts` の呼び出す関数の 4 か所。解析の処理なら engine.ts の `laneOf` にも足す
