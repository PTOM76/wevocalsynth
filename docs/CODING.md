# コーディング規約
コードの書き方の決まり。どこに何を配置するかは [STRUCTURE.md](STRUCTURE.md)、実装中に問題を踏んで決まったことは [DECISIONS.md](DECISIONS.md) を参照。

関連: [決定事項](DECISIONS.md)、[アーキテクチャ](ARCHITECTURE.md)

## 大きさ
- 1ファイル300行を目安とし、500行を上限とする
- 300行を少し超えた程度では分けない。500行に近づいたときや、責務がはっきり分かれたときに分ける

長いファイルは、読む人が目的の処理を探す時間が増えるため。一方で、300行ちょうどに収めるためだけに分けると、かえって読むファイルが増える。実際に `App.tsx`（687行）と `Waveform.tsx`（557行）が読みにくくなり、フックと部品に分けた (2026-09-27)。

## コメント

### コメントは日本語で書く
識別子（変数名・関数名）は英語のままにする。

### 何をしているかより、なぜそうしているかを書く
処理の中身はコードを読めば分かる。理由はコードからは分からず、書いておかないと「変えてよいか」を判断できないため。

```ts
// GOOD
// 末尾で無音を重ね合わせないよう、フレーム位置を入力の内側に収める
const pos = clampPos(nominal)

// BAD
// 位置を制限する
const pos = clampPos(nominal)
```

## TypeScript / React

### 音声は `Clip` で扱い、`AudioBuffer` は再生の直前にだけ作る
`Clip` はサンプルレートとチャンネルごとの `Float32Array` を持つだけの値。Worker へ渡す、切り貼りする、保存する、のどれにもそのまま使用できる。`AudioBuffer` は `AudioContext` に縛られ、Worker にも渡せない。

### クリップは書き換えず、作り直す
履歴、F0 やスペクトログラムの解析結果、プレビューは「どのクリップのものか」をオブジェクトの同一性（`===`）で判定している。中身を書き換えると、古い解析結果が新しい音声に対して使われてしまう。

```ts
// GOOD
commit(gainRange(edited, range, db))

// BAD
edited.channels[0][i] *= gain
```

### 時間の単位は、範囲や画面では秒、処理の内部ではサンプル
`Range` は秒で持つ。サンプルに直すのは処理の入口（`toFrames` など）だけにする。単位の混同は、音はずれるのにエラーにならないので気づきにくいため。

### 重い処理は Worker に送る
加工・F0 は `src/dsp/engine.ts` 経由で Worker に送る（スペクトログラムは追加機能「解析」の Worker）。画面のスレッドで長いループを回すと、その間は再生の表示も止まる。
切り貼りや音量のような、サンプル数に比例するだけの軽い処理は JS で直接やってよい。

### 時間のかかる操作は `useTask` の `run()` で包む
処理中の表示、進捗、エラーの通知、再生の停止がそろう。個別に `try` / `catch` を書くと、どれかが抜ける。

### 表示する文言は `t()` / `useT()` を通す
画面部品は `useT()`、React の外（Canvas、エラーメッセージ）は `t()` を使う。直接日本語を書くと、英語表示のときにそこだけ日本語が残る。

```tsx
// GOOD
<Button>{t('common.apply')}</Button>

// BAD
<Button>適用</Button>
```

### 状態と操作は `useEditor`、画面の組み立ては `App.tsx`
`App.tsx` にロジックを書かない。画面の並べ替え（PC とスマホ）と、処理の変更を別々に行えるようにするため。

## 多言語化

| 決まり | 理由 |
| --- | --- |
| キーは `領域.名前`（例: `process.pitch`、`toast.applied`） | 同じ画面の文言が並び、探しやすい |
| 新しい文言は `src/i18n/` のすべての言語（ja_jp、en_us、ko_kr、zh_cn、zh_tw）に追加する | ja_jp にあるキーがほかの言語に欠けていると型エラーになり、ビルドが止まる |
| 値の差し込みは `{name}` で書く（`t('toast.loadFailed', { file, error })`） | 言語によって語順が違うため、文字列を連結しない |
| 言語で描き直す Canvas は `useLang()` を依存に入れる | Canvas は React の再描画では描き直されない |

## 画面

### MUI の `Stack` などの配置は `sx` に書く
MUI v9 では `alignItems` などの props が廃止されている。

```tsx
// GOOD
<Stack direction="row" sx={{ alignItems: 'center' }}>

// BAD
<Stack direction="row" alignItems="center">
```

### Canvas の色は `usePalette()` で取る
Canvas は CSS 変数を解決できない。`theme.palette` は常にライトテーマの値なので、そのまま使うとダークテーマで文字が見えなくなる（実際に目盛りの文字が暗いまま表示された）。

### PC とスマホで大きく変えるところは `useMediaQuery` で分ける
`theme.breakpoints.down('md')` を境にする。細かい余白だけなら `sx` のブレークポイント指定（`{ xs: 1, md: 3 }`）で足りる。

## Rust（`dsp/`）

### `lib.rs` はモジュールの宣言と `pub use` だけにする
アルゴリズムはファイルを分ける（`wsola.rs`、`pv.rs`、`formant.rs`、`f0.rs` など）。856行あった `lib.rs` を分けた経緯がある。

### wasm に公開する関数は `ffi.rs` に集める
`#[no_mangle] pub unsafe extern "C"` とし、`# Safety` にポインタの前提を書く。公開関数が散らばると、TS 側（`worker.ts` の `DspExports`）と食い違っても気づきにくい。

### 足し込みの多いループは部分和を分ける
浮動小数点の足し込みは順序を変えられないため、1本の足し込みはベクトル化されない。部分和を分けると SIMD 命令になる（`f0.rs` の `sq_diff_sum` で約3倍速くなった）。

### テストは合成音で、数値で確かめられる性質を見る
正弦波や母音もどき（パルス列＋共振）を入れて、周波数・長さ・音量・スペクトル重心を確かめる。耳で聴く評価は再現できないため、テストでは数値だけを見る。テストは `src/tests/` に話題ごとに配置する。

## 確認のコマンド

| コマンド | 内容 |
| --- | --- |
| `npm run test:dsp` | Rust の DSP テスト |
| `cargo test --release -- --ignored --nocapture`（`dsp/` で） | 3分の音声での処理時間の計測 |
| `npm run build` | 型チェックとビルド |
| `npm run lint` | oxlint |

DSP を変えたら `npm run build:wasm` で `src/dsp/wevocal_dsp.wasm` を作り直し、一緒にコミットする。`.wasm` をリポジトリに含めているので、作り直し忘れると画面の動きが古いままになる。

## コミット
- メッセージは `feat:` / `fix:` / `perf:` / `refactor:` / `chore:` と日本語の要約。本文に変更の理由を書く
- 1つの機能・修正ごとにコミットする
- 変更したファイルを指定して `git add` する。`git add -A` だと、並行して編集中の別のファイルが混ざる（実際に混ざったことがある）
