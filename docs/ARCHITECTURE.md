# アーキテクチャ設計
WeVocalSynth は、React の画面、Web Worker 上の Rust（WebAssembly）の DSP、AudioWorklet の簡易リアルタイム処理の3つで構成する。状態管理は React のフックだけで行い、状態管理ライブラリは使わない。

関連: [コーディング規約](CODING.md)、[決定事項](DECISIONS.md)

## なぜ状態管理ライブラリを使わないか
- 状態は「編集中のクリップと履歴」「選択範囲」「加工パラメータ」「表示の切り替え」程度で、画面も1つしかない
- 状態と操作は `useEditor` 1か所に集まっていて、props で渡すだけで足りる
- 音声データ（数十MB になる `Float32Array`）をストアに入れると、シリアライズや差分検出の仕組みと相性が悪い

## 技術選定

| 項目 | 選定 | 理由 |
| --- | --- | --- |
| 画面 | React + TypeScript + MUI | Material Design（Android / Google らしさ）をそのまま使える |
| アイコン | Font Awesome | `@mui/icons-material` はファイル数が多すぎてインストールが壊れた（[決定事項](DECISIONS.md)） |
| ビルド | Vite | Worker、`?url` での wasm の読み込み、AudioWorklet のバンドルをそのまま扱える |
| DSP | Rust → WebAssembly（素の C ABI） | `cargo test` でネイティブのままテストでき、wasm32 の準備も簡単。受け渡しは Float32Array だけなので wasm-bindgen は要らない |
| 重い処理 | Web Worker | 数秒かかる処理でも画面を止めない |
| リアルタイム処理 | AudioWorklet | 再生と同じスレッドで少しずつ音を作れる |
| 保存 | IndexedDB（作業）、localStorage（設定） | 音声は localStorage の容量に収まらない |
| 書き出し | WAV（自前）、MP3（lamejs を Worker で）、Opus（WebCodecs ＋自前の Ogg） | MP3 のエンコーダは使うときだけ読み込む |
| オフライン | PWA（vite-plugin-pwa） | 新しい版は通知して、利用者が「更新」を押したときに切り替える |
| 多言語化 | JSON（ja_jp / en_us）をビルド時に取り込む | 実行時の読み込み待ちがない |

C++（Emscripten）は採用しない。

- emsdk の準備が要り、この環境では用意できなかった
- 使いたい既存の C++ ライブラリ（Signalsmith Stretch など）は、PSOLA・SOLA を自前で入れたため見送った

## ディレクトリ
```
src/
├── App.tsx          画面の組み立てだけ
├── hooks/           状態と操作（useEditor がまとめる）
├── components/      画面部品
│   ├── waveform/    波形の描画（Canvas）と表示範囲
│   ├── tracks/      トラックの欄（波形付きの一覧 / タブ）・右クリックメニュー・名前の変更
│   └── menu/        メニューの項目の定義と描画
├── audio/           音声データの処理と再生（React に依存しない関数が中心）。トラック・ミックス・MIDI・音声の作成もここ
│   └── realtime/    ループ試聴の AudioWorklet
├── dsp/             Worker と wasm の橋渡し、wevocal_dsp.wasm
├── project/         プロジェクトファイル（.wvsp）と自動保存
├── addons/          追加機能の導入・保存・読み込み（docs/EXTRACTOR.md）
├── settings/        設定と設定画面（分類ごとのページ、追加機能、データの削除、アップデートの確認）
├── debug/           デバッグ表示（FPS・描画回数・メモリの内訳・DSP の時間）
├── pwa/             新しい版の確認
└── i18n/            訳文と t()
dsp/src/             Rust の DSP
wevocal-lib/         共有の信号処理（FFT・リサンプル）。submodule
extractor/           ボーカル抽出（WeVocalExtractor）。submodule。追加機能としてビルドする（docs/EXTRACTOR.md）
```

| フック | 担当 |
| --- | --- |
| `useEditor` | 状態と操作をまとめ、`App.tsx` に渡す |
| `useHistory` | トラックと、元に戻す・やり直す・操作履歴。各段は「どのトラックの差分か」と操作名（トラックの追加・削除は一覧）だけを持つ（段数・メモリの上限は設定） |
| `useTracks` | トラックの操作（複製・追加・分ける・統合・名前・削除・選択）と、フェーダー・ミュート・ソロ・重ねる表示 |
| `usePlayer` | Web Audio での再生。ほかのトラックも一緒に鳴らし、フェーダー・適用前の音量とパン・ミュートをすぐ反映する。レベルメーター用の AnalyserNode も持つ |
| `usePlayback` | 再生・試聴・ループの切り替え（どれかを始めたらほかを止める） |
| `usePreview` | 加工済みプレビューを裏で作る |
| `useClipAnalysis` | F0・スペクトログラム（表示が ON のときだけ。解析の設定が変わったら解析し直す） |
| `usePitchTarget` / `usePitchTools` | 目標ピッチの曲線（ペン・一括の加工）と、適用前の試聴 |
| `usePitchVoicing` | ピッチの強制表示・非表示 |
| `useTempo` | テンポの自動解析と候補 |
| `useNumberDraft` | 数値欄（入力途中の文字を持ち、確定時に丸める） |
| `useClipCommands` | 切り貼り・音量とパンの適用・フェードなど（JS で即時に処理） |
| `useVocalExtract` | ボーカル抽出（追加機能）。範囲の置き換えと、ボーカル・伴奏の2トラックへの分割 |
| `useTask` | 時間のかかる処理の、処理中の表示・進捗・中断（DSP の Worker を止める） |
| `useAutosave` | IndexedDB への自動保存（トラックごと）と、起動時の復元 |
| `useAppMenus` | メニューバー・⋮ メニュー・右クリックメニューの中身 |

### 波形（`components/waveform`）

| ファイル | 担当 |
| --- | --- |
| `draw.ts` | Canvas への描画（目盛り・波形・スペクトログラム・ピッチ帯・拍の線・選択範囲） |
| `peaks.ts` | 波形の最小値・最大値のピラミッド。拡大率に合った段から求めるので、全体表示でも速い |
| `useWaveformView.ts` | 表示範囲（拡大縮小・スクロール・再生中の追従） |
| `useRangeEdges.ts` | 範囲の端のドラッグ |
| `useTouchGestures.ts` | スマホ: ピンチで横の拡大縮小、目盛りのタップ・ドラッグ・長押し（横移動） |
| `useEdgeScroll.ts` | 目盛りのドラッグで端に来たら表示範囲を流す |

再生位置の線は、波形の上に重ねた別の Canvas に描く（再生中に波形全体を描き直さないため）。

## 構成図
```
┌──────────────────── メインスレッド ────────────────────┐
│ App.tsx ── AppHeader / Waveform / EditPanel / ...        │
│   └─ useEditor（状態と操作）                               │
│        └─ dsp/engine.ts（リクエストと応答の対応づけ）       │
└──────────────────┬──────────────────────────────────────┘
                   │ postMessage（Float32Array を transfer）
┌──────────────────▼──── Web Worker ──┐  ┌──── AudioWorklet ────┐
│ dsp/worker.ts                       │  │ granularProcessor.ts  │
│   └─ wevocal_dsp.wasm（Rust）       │  │ ループ試聴（簡易）      │
└─────────────────────────────────────┘  └──────────────────────┘
```

## データの流れ

### 読み込みから出力まで

| 段階 | 処理 |
| --- | --- |
| 読み込み | `decodeFile` で `Clip`（サンプルレート＋チャンネルごとの `Float32Array`）にする。WAV・MP4/M4A はファイルからサンプルレートを読み、同じレートでデコードする |
| 初期化 | `useHistory.reset` で履歴を作り直し、ボーカル／楽器を自動判定してパラメータの初期値にする。テンポも解析して BPM・1拍目を設定に入れる |
| 編集 | 編集のたびに新しい `Clip` を作って、操作名と一緒に `commit` する（元のクリップは書き換えない） |
| 出力 | 書き出しダイアログで `exportAudio` を呼び、WAV / MP3 / Opus にしてダウンロードする。選んでいるトラック（フェーダーを掛けたもの）か、全トラックのミックス（`mixClips`。ミュート・ソロとフェーダーに従う）を選べる |

### 加工（ピッチ・長さ）
1. `applyEditToRanges` が各範囲を後ろから順に処理する（前の範囲の位置がずれないように）
2. 範囲ごとに `processRange` が Worker へ送り、wasm の `process_planar` で処理する
3. `spliceProcessed` で元の位置に差し戻す。継ぎ目は 5ms のクロスフェードでつなぐ

`applyPitchCurve`（ピッチカーブ）は曲線のある部分だけを切り出して処理し、同じように差し戻す。

ピッチの一括操作（半音上下・平らにする・音程に揃える・ビブラート・MIDI の当てはめ）は、どれも「目標ピッチの曲線を返す関数」（`audio/pitchTools.ts`）で、`usePitchTools.edit` に渡す。MIDI は `audio/midi.ts` で読み、その時刻に鳴っている音符（和音なら一番高い音）を目標にする（`fitMidi`）。

同じ設定の加工済みプレビューがあれば、2 を飛ばしてプレビューをそのまま差し込む。

## DSP（`dsp/src`）

### 加工の流れ（`pipeline.rs`）
```
入力 ─▶ 時間伸縮（PSOLA / SOLA / WSOLA / Phase Vocoder、倍率 = 伸縮率 × ピッチ比）
     ─▶ フォルマント補正（保持が ON のとき）
     ─▶ リサンプル（ピッチ比の速さで読み戻す）─▶ 出力
```

長さは伸縮率だけで決まり、ピッチ比には影響されない。

| ファイル | 担当 |
| --- | --- |
| `pipeline.rs` | 上の流れ。`Algorithm`（WSOLA=0 / Phase Vocoder=1 / PSOLA=2 / SOLA=3）と `Formant`（追従 / 保持＋移動） |
| `psola.rs` | PSOLA。声の周期（ピッチマーク）に合わせて切り貼りする。ボーカルの既定 |
| `sola.rs` | SOLA。50ms のブロックを 10ms の sin クロスフェードでつなぎ、区切り位置を2乗誤差で探す |
| `wsola.rs` | WSOLA。フレーム 46ms・50% オーバーラップ・探索幅 ±12ms |
| `pv.rs` | Phase Vocoder（identity phase locking）。フレーム 2048・75% オーバーラップ。楽器の既定。位相の回転を複素数の掛け算にし、隣り合う2フレームを1回の FFT で変換して速くしている |
| `timemap.rs` | 出力位置→入力位置の対応。一定倍率とピッチカーブの両方を表す |
| `curve.rs` | ピッチカーブ編集。時間ごとのピッチ比から時間マップを作る |
| `formant.rs` | ケプストラムによるスペクトル包絡の補正 |
| `f0.rs` | YIN による F0 推定（16kHz に間引き、10ms 間隔）。探す範囲・有声判定・無音判定は `Params` で変えられる |
| `spec.rs` | 表示用スペクトログラム（STFT 2048/256、対数周波数 128段、1バイト） |
| `tempo.rs` | テンポ解析。スペクトルの増加量（オンセット強度）の、時間方向の周波数成分から BPM の候補と1拍目の位置を求める |
| `ffi.rs` | wasm 向けの C ABI |

FFT（radix-2。回転因子を段ごとに連続して並べ、SIMD が効くようにしている）とリサンプル（窓付き sinc 補間。上げるときはカットオフを下げて折り返しを防ぐ）は `wevocal-lib` にある。`crate::fft` / `crate::resample` で今までどおり使える。

### wasm の公開関数

| 関数 | 内容 |
| --- | --- |
| `alloc_f32` / `free_f32` | wasm メモリ上の f32 配列の確保・解放 |
| `process_planar` | ピッチ変更・時間伸縮・フォルマント（全チャンネル） |
| `process_curve_planar` | ピッチカーブに従った処理 |
| `analyze_f0` / `analyze_spectrogram` / `analyze_tempo` | F0 推定（設定つき）、スペクトログラム、テンポの候補（モノラル） |
| `output_ptr` / `output_u8_ptr` | 直前の結果の置き場所 |

進捗は、Worker が渡す `env.report_progress(p)` を wasm から呼んで通知する。

## Worker とのやりとり
- リクエストは `kind` で分ける: `process`（加工）、`curve`（ピッチカーブ）、`f0`、`spec`、`tempo`
- 応答は `{ id, channels }` / `{ id, bytes }` / `{ id, error }` / `{ id, progress }`
- `engine.ts` が `id` ごとに Promise を持ち、応答と対応づける
- 音声データは `transfer` で渡し、コピーを避ける
- Worker は1つで、リクエストは順番に処理される

## トラック
編集できるのは**選んでいるトラックだけ**で、ほかのトラックは一緒に鳴らして聴く参照になる。今までの編集の操作（加工・音量・切り貼り・抽出）は、そのまま選んでいるトラックのクリップに効く。

| 持つもの | 場所 | 元に戻す | 保存 |
| --- | --- | --- | --- |
| トラックの一覧（名前・原音・加工後） | `useHistory` | できる | する |
| フェーダー（音量 dB・パン） | `useTracks` | できない | する |
| ミュート・ソロ・重ねる表示 | `useTracks` | できない | する |

- 履歴は1本で、各段は「トラック id と差分」か「トラックの一覧」。元に戻すと、変わったトラックに切り替わる（`audio/tracks.ts`、`hooks/useHistory.ts`）
- トラックを増やす操作: 複製、ファイルの追加、ボーカルと伴奏に分ける（`separateBoth`、推論は1回）、統合（`mixClips`、一番上のトラックのサンプルレートに合わせる）、音声の作成（`audio/synth.ts`）
- トラックの欄（`components/tracks/TrackPanel`）: 2本以上のときだけ出す。広げると波形付きの一覧（小さな波形は大きな波形と同じ表示範囲）、折りたたむとタブ
- ほかのトラックの波形は、右クリックメニューで大きな波形の後ろに薄く重ねられる（`drawGhostWave`）

## 再生

| 種類 | 実装 | 用途 |
| --- | --- | --- |
| 通常の再生 | `usePlayer`（AudioBufferSourceNode） | 全体・範囲の再生 |
| 試聴 | `usePreview` の結果を `usePlayer` で再生 | 高品質な加工結果の確認 |
| ループ | `useRealtimePreview`（AudioWorklet のグラニュラー方式） | スライダー操作中の即時確認 |
| 曲線の試聴 | `usePitchTools` が曲線の部分だけ加工し、`usePlayer` で再生 | ピッチの加工を適用する前の確認 |

### 音の通り道（`usePlayer`）
```
選んでいるトラック: 音源 → 適用前の音量 → 適用前のパン → フェーダー（音量・パン） → ミュート → メーター ┐
ほかのトラック:     音源 ─────────────────────────────→ フェーダー（音量・パン） → ミュート → メーター ┼→ 全体（左右のメーター）→ 出力
```
- 適用前の音量・パンは、選択範囲の境目の時刻に予約する（5ms で切り替え）。再生中に動かしても入れ直す
- ミュート・ソロで鳴らさないトラックも再生しておき、ミュートの音量を 0 にする（再生中の切り替えをすぐ反映するため）
- パンは StereoPannerNode（モノラルも左右同じ音のステレオにしてから）。適用（`panRange`）と書き出し（`applyFader`）も同じ式なので、聴こえる音と結果が一致する
- 止めたら、再生のたびに作った部品をすべて切り離し、AudioContext を一時停止する
- レベルメーター（`LevelMeter`）は AnalyserNode を毎フレーム Canvas に直接描く。鳴っていなくて表示も消えたら 0.25 秒おきの確認にする

再生中の位置は React の状態として更新しない（更新すると画面全体が毎回描き直されて重くなった）。再生位置の線・時間の表示・自動スクロールは、それぞれ `livePosition()` を自分で読む。

## 保存

| 対象 | 保存先 | 形式 |
| --- | --- | --- |
| プロジェクト | ダウンロード（.wvsp） | 無圧縮（"WVSP"＋ヘッダ JSON＋トラックごとの f32 の原音・加工後）。版 2 はヘッダにトラックの一覧（名前・フェーダー・ミュート・ソロ・重ねる表示）を持つ。版 1（1トラック）と古い gzip のファイルも読める |
| 自動保存 | IndexedDB（`wevocalsynth` / `kv` / `autosave:track:<id>:original`・`…:edited`・`autosave:meta`） | `Float32Array` をそのまま。音声は変わったトラックだけ、ブラウザが空いているときに Worker で書く。フェーダーなどだけが変わったときは、音声がすべて保存済みなら 0.3 秒後にすぐ書く。以前の形式（1トラック）も読める |
| 設定 | localStorage（`wevocalsynth.settings`、画面の状態は `wevocalsynth.*`） | JSON |

設定 → データ から、作業データ・オフライン用キャッシュ・設定を削除できる（`project/storage.ts`）。

## ビルド

| コマンド | 内容 |
| --- | --- |
| `npm run build:wasm` | Rust を wasm にビルドし `src/dsp/wevocal_dsp.wasm` にコピー（simd128 有効） |
| `npm run dev` / `npm run build` | Vite の開発サーバー / 本番ビルド |
| `npm run test:dsp` | DSP のテスト |
| `npm run build:wasm:extractor` | ボーカル抽出の STFT（`extractor/dsp`）を wasm にビルド（隣の `wevocal-lib` を使う） |
| `npm run build:addons` | 追加機能（ボーカル抽出の実行環境とモデル）を `dist/addons/` に作る。`npm run build` の後に実行する |
| `npm run build:addons:dev` | 同じものを `public/addons/` に作る（git には入れない）。`npm run dev` でもボーカル抽出を試せる。一度作れば `npm run build` でも `dist/` にコピーされる |

`.wasm` はリポジトリに含めているので、Rust がない環境でも `npm install && npm run dev` で動く。
