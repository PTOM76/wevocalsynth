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
| 多言語化 | JSON（ja_jp / en_us）をビルド時に取り込む | 実行時の読み込み待ちがない |

C++（Emscripten）は採用しない。

- emsdk の準備が要り、この環境では用意できなかった
- 使いたい既存の C++ ライブラリ（Signalsmith Stretch など）は、今の方式で音質が足りなかったときの比較候補にとどめている

## ディレクトリ
```
src/
├── App.tsx          画面の組み立てだけ
├── hooks/           状態と操作（useEditor がまとめる）
├── components/      画面部品
│   ├── waveform/    波形の描画（Canvas）と表示範囲
│   └── menu/        メニューの項目の定義と描画
├── audio/           音声データの処理と再生（React に依存しない関数が中心）
│   └── realtime/    ループ試聴の AudioWorklet
├── dsp/             Worker と wasm の橋渡し、wevocal_dsp.wasm
├── project/         プロジェクトファイル（.wvsp）と自動保存
├── settings/        設定と設定画面
└── i18n/            訳文と t()
dsp/src/             Rust の DSP
```

| フック | 担当 |
| --- | --- |
| `useEditor` | 状態と操作をまとめ、`App.tsx` に渡す |
| `useHistory` | 元に戻す・やり直す（20段） |
| `usePlayer` | Web Audio での再生 |
| `usePlayback` | 再生・試聴・ループの切り替え（どれかを始めたらほかを止める） |
| `usePreview` | 加工済みプレビューを裏で作る |
| `useClipAnalysis` | F0・スペクトログラム（表示が ON のときだけ） |
| `useClipCommands` | 切り貼り・音量編集（JS で即時に処理） |
| `useAutosave` | IndexedDB への自動保存と、起動時の復元 |
| `useAppMenus` | メニューバー・⋮ メニュー・右クリックメニューの中身 |

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
| 読み込み | `decodeFile` で `Clip`（サンプルレート＋チャンネルごとの `Float32Array`）にする。WAV はヘッダからサンプルレートを読み、同じレートでデコードする |
| 初期化 | `useHistory.reset` で履歴を作り直し、ボーカル／楽器を自動判定してパラメータの初期値にする |
| 編集 | 編集のたびに新しい `Clip` を作って `commit` する（元のクリップは書き換えない） |
| 出力 | `downloadWav` で WAV にしてダウンロードする |

### 加工（ピッチ・長さ）
1. `applyEditToRanges` が各範囲を後ろから順に処理する（前の範囲の位置がずれないように）
2. 範囲ごとに `processRange` が Worker へ送り、wasm の `process_planar` で処理する
3. `spliceProcessed` で元の位置に差し戻す。継ぎ目は 5ms のクロスフェードでつなぐ

同じ設定の加工済みプレビューがあれば、2 を飛ばしてプレビューをそのまま差し込む。

## DSP（`dsp/src`）

### 加工の流れ（`pipeline.rs`）
```
入力 ─▶ 時間伸縮（WSOLA / Phase Vocoder、倍率 = 伸縮率 × ピッチ比）
     ─▶ フォルマント補正（保持が ON のとき）
     ─▶ リサンプル（ピッチ比の速さで読み戻す）─▶ 出力
```

長さは伸縮率だけで決まり、ピッチ比には影響されない。

| ファイル | 担当 |
| --- | --- |
| `pipeline.rs` | 上の流れ。`Algorithm`（WSOLA / Phase Vocoder）と `Formant`（追従 / 保持＋移動） |
| `wsola.rs` | WSOLA。フレーム 46ms・50% オーバーラップ・探索幅 ±12ms |
| `pv.rs` | Phase Vocoder（identity phase locking）。フレーム 2048・75% オーバーラップ |
| `timemap.rs` | 出力位置→入力位置の対応。一定倍率とピッチカーブの両方を表す |
| `curve.rs` | ピッチカーブ編集。時間ごとのピッチ比から時間マップを作る |
| `formant.rs` | ケプストラムによるスペクトル包絡の補正 |
| `resample.rs` | 窓付き sinc 補間。上げるときはカットオフを下げて折り返しを防ぐ |
| `f0.rs` | YIN による F0 推定（16kHz に間引き、10ms 間隔） |
| `spec.rs` | 表示用スペクトログラム（STFT 2048/256、対数周波数 128段、1バイト） |
| `fft.rs` | radix-2 FFT |
| `ffi.rs` | wasm 向けの C ABI |

### wasm の公開関数

| 関数 | 内容 |
| --- | --- |
| `alloc_f32` / `free_f32` | wasm メモリ上の f32 配列の確保・解放 |
| `process_planar` | ピッチ変更・時間伸縮・フォルマント（全チャンネル） |
| `process_curve_planar` | ピッチカーブに従った処理 |
| `analyze_f0` / `analyze_spectrogram` | F0 推定、スペクトログラム（モノラル） |
| `output_ptr` / `output_u8_ptr` | 直前の結果の置き場所 |

進捗は、Worker が渡す `env.report_progress(p)` を wasm から呼んで通知する。

## Worker とのやりとり
- リクエストは `kind` で分ける: `process`（加工）、`curve`（ピッチカーブ）、`f0`、`spec`
- 応答は `{ id, channels }` / `{ id, bytes }` / `{ id, error }` / `{ id, progress }`
- `engine.ts` が `id` ごとに Promise を持ち、応答と対応づける
- 音声データは `transfer` で渡し、コピーを避ける
- Worker は1つで、リクエストは順番に処理される

## 再生

| 種類 | 実装 | 用途 |
| --- | --- | --- |
| 通常の再生 | `usePlayer`（AudioBufferSourceNode） | 全体・範囲の再生 |
| 試聴 | `usePreview` の結果を `usePlayer` で再生 | 高品質な加工結果の確認 |
| ループ | `useRealtimePreview`（AudioWorklet のグラニュラー方式） | スライダー操作中の即時確認 |

## 保存

| 対象 | 保存先 | 形式 |
| --- | --- | --- |
| プロジェクト | ダウンロード（.wvsp） | gzip（"WVSP"＋ヘッダ JSON＋f32 の原音・加工後） |
| 自動保存 | IndexedDB（`wevocalsynth` / `kv` / `autosave`） | .wvsp と同じ |
| 設定 | localStorage（`wevocalsynth.settings`） | JSON |

## ビルド

| コマンド | 内容 |
| --- | --- |
| `npm run build:wasm` | Rust を wasm にビルドし `src/dsp/wevocal_dsp.wasm` にコピー（simd128 有効） |
| `npm run dev` / `npm run build` | Vite の開発サーバー / 本番ビルド |
| `npm run test:dsp` | DSP のテスト |

`.wasm` はリポジトリに含めているので、Rust がない環境でも `npm install && npm run dev` で動く。
