# ファイル構成
どのディレクトリ・ファイルが何を担当するかの一覧。コードのどこを見ればよいかを探すときに使う。(2026-10-04 時点)

関連: [アーキテクチャ](ARCHITECTURE.md) / [機能の仕組み](INTERNALS.md) / [アルゴリズム](ALGORITHM.md)

## ディレクトリ
```
src/
├── App.tsx          画面の組み立てだけ
├── hooks/           状態と操作（useEditor がまとめる）
├── components/      画面部品
│   ├── waveform/    帯パネルの描画（Canvas）と表示範囲、ツールバーのボタン
│   ├── inspector/   PC の右側のインスペクタ
│   ├── tracks/      トラックの欄（波形付きの一覧 / タブ）・右クリックメニュー・名前の変更・並び替え
│   └── layout/      PC とスマホのレイアウト
├── audio/           音声データの処理と再生（React に依存しない関数が中心）。トラック・ミックス・MIDI・音声の作成もここ
│   └── realtime/    ループ試聴の AudioWorklet
├── dsp/             Worker と wasm の橋渡し、wevocal_dsp.wasm
├── project/         プロジェクトファイル（.wvsp）、自動保存、メモリ不足のときの再読み込みでの抽出
├── addons/          追加機能の導入・保存・読み込み（docs/EXTRACTOR.md）
├── settings/        設定と設定画面（分類ごとのページ、追加機能、データの削除、アップデートの確認）
├── debug/           デバッグ表示（FPS・描画回数・メモリの内訳・DSP の時間・画面が止まった記録）
├── progress/        進み具合のゲージに出す処理の種類（本体は PevenMUI）
├── pwa/             新しい版の確認
└── i18n/            訳文と t()
dsp/src/             Rust の DSP
wevocal-lib/         共有の信号処理（FFT・リサンプル・STFT）と、音声ファイルの読み込み（AIFF は自前）・書き出し。submodule
extractor/           ボーカル抽出（WeVocalExtractor）。submodule。追加機能としてビルドする（docs/EXTRACTOR.md）。単体の Web ツールでもある
pevenmui/            UI 部品（PevenMUI。テーマ・メニューバー・確認ダイアログ・分割バー・設定画面の部品・ダイアログを別の窓に出す WindowDialog / WindowPortal・進み具合のゲージ・ファイルを開く画面と最近使用したファイル・IndexedDB）。submodule
```

| フック | 担当 |
| --- | --- |
| `useEditor` | 状態と操作をまとめ、`App.tsx` に渡す |
| `useHistory` | トラックと、元に戻す・やり直す・操作履歴。各段は「どのトラックの差分か」と操作名（トラックの追加・削除は一覧）だけを持つ（段数・メモリの上限は設定） |
| `useTracks` | トラックの操作（複製・追加・分ける・統合・名前・削除・選択）と、フェーダー・ミュート・ソロ・重ねる表示 |
| `usePlayer` | Web Audio での再生。ほかのトラックも一緒に鳴らし、フェーダー・適用前の音量とパン・ミュートをすぐ反映する。範囲のループ再生、再生中のトラックの切り替えにも対応する。音量メーター用の AnalyserNode も持つ。AudioContext の起動と一時停止は wevocal-lib の `startContext` / `suspendContext`（`web/src/playback.ts`。iOS の再生用オーディオセッション、`interrupted` の状態からの復帰、停止と再生の競合の回避） |
| `usePlayback` | 再生・試聴・ループ（加工の欄）の切り替え（どれかを始めたらほかを止める） |
| `usePreview` | 加工済みプレビューを裏で作る |
| `useClipAnalysis` | F0・スペクトログラム（表示が ON のときだけ。解析の設定が変わったら解析し直す） |
| `useLanes` | 帯パネル（波形・スペクトログラム・ピッチ・音量・フォルマント）の表示とフォーカス。ツールバーとショートカットはフォーカスしているパネルに効く |
| `useLaneCurve` / `useFormantCurve` | 音量・フォルマントパネルに描いた曲線（10ms 間隔）。音量は再生にすぐ反映し、フォルマントは試聴で加工して聴く。どちらも適用で確定する |
| `usePitchClipboard` | ピッチパネルでの切り取り・コピー・貼り付け（曲線が対象） |
| `usePitchTarget` / `usePitchTools` | 目標ピッチの曲線（ペン・一括の加工）と、適用前の試聴 |
| `usePitchVoicing` | ピッチの強制表示・非表示 |
| `useTempo` | テンポの自動解析と候補 |
| `useNumberDraft` | 数値欄（入力途中の文字を持ち、確定時に丸める） |
| `useClipCommands` | 切り貼り・音量とパンの適用・フェードなど（JS で即時に処理） |
| `useVocalExtract` | ボーカル抽出（追加機能）。範囲の置き換えと、ボーカル・伴奏の2トラックへの分割 |
| `useTask` | 時間のかかる処理の、処理中の表示・進捗・中断（加工用の DSP の Worker を止める） |
| `useAutosave` | IndexedDB への自動保存（トラックごと）と、起動時の復元 |
| `useAppMenus` | メニューバー・⋮ メニュー・右クリックメニューの中身 |
| `useShortcuts` | キーボード操作 |
| `useSeek` | 矢印キー・Home / End での再生位置の移動 |
| `useOutput` | プロジェクトの保存と、音声の書き出し（ミックス・ファイル名） |
| `useMarkers` | マーカー（追加、名前の変更、削除、ドラッグでの移動）。元に戻すの対象にはしない |
| `useRangeNote` | 選択範囲の今の音程（「音程を合わせる」用） |

ファイルのドロップと選択の画面（`useFileDrop` / `useFilePicker`）、最近使用したファイル（`useRecentFiles`）、閉じる前の保存確認（`useLeaveGuard`）は PevenMUI のフックを `useEditor` から使う。

### 波形（`components/waveform`）

| ファイル | 担当 |
| --- | --- |
| `draw.ts` | Canvas への描画（目盛り・波形・スペクトログラム・ピッチ・拍の線・選択範囲）と、パネルの高さの割り振り（`laneHeights`）。`prepareCanvas` は大きさが同じなら Canvas を確保し直さない |
| `spectrogramImage.ts` | スペクトログラムの画像を作る（画像の置き場は使い回す） |
| `WaveformToolbar.tsx` | 表示のボタンと、フォーカスしているパネルの操作のボタン |
| `curveLane.ts` | 音量・フォルマントパネル（目盛りと描いた曲線。縦軸の範囲だけを変えて共通に使う） |
| `useLanePen.ts` | パネルのペン。押したパネルで描き始め、離すまでそのパネルに描く（ピッチ・音量・フォルマントで共通） |
| `usePitchGrab.ts` | ピッチの線を掴んで上下に動かす（掴むモード。選択範囲の中ならその範囲、外なら途切れるまで） |
| `useLaneDivider.ts` | 上のパネル（波形・スペクトログラム）と下のパネル（ピッチ・音量・フォルマント）の境目のドラッグ |
| `peaks.ts` | 波形の最小値・最大値のピラミッド。拡大率に合った段から求めるので、全体表示でも速い |
| `useWaveformView.ts` | 表示範囲（拡大縮小・スクロール・再生中の追従） |
| `useRangeEdges.ts` | 範囲の端のドラッグ |
| `useTouchGestures.ts` | スマホ: ピンチで横の拡大縮小、目盛りのタップ・ドラッグ・長押し（横移動） |
| `useEdgeScroll.ts` | 目盛りのドラッグで端に来たら表示範囲を流す |

再生位置の線は、波形の上に重ねた別の Canvas に描く（再生中に波形全体を描き直さないため）。

## DSP（`dsp/src`）

各方式の仕組みは [アルゴリズム](ALGORITHM.md) にある。

### 加工の流れ（`pipeline.rs`）
```
入力 ─▶ 時間伸縮（SOLA / PSOLA / WSOLA / Phase Vocoder / HPSS と各改良版、倍率 = 伸縮率 × ピッチ比）
     ─▶ フォルマント補正（保持が ON のとき）
     ─▶ リサンプル（ピッチ比の速さで読み戻す）─▶ 出力
```

長さは伸縮率だけで決まり、ピッチ比には影響されない。

| ファイル | 担当 |
| --- | --- |
| `pipeline.rs` | 上の流れ。`Algorithm`（WSOLA=0 / Phase Vocoder=1 / PSOLA=2 / SOLA=3 / PSOLAv2=4 / WSOLAv2=5 / Phase Vocoder v2=6 / HPSS=7 / SOLAv2=8 / SOLAv3=9）と `Formant`（追従 / 保持＋移動） |
| `psola.rs` | PSOLA。声の周期（ピッチマーク）に合わせて切り貼りする。目印の置き方（`Marking`）で PSOLAv2 にもなる |
| `sola.rs` | SOLA。50ms のブロックを 10ms の sin クロスフェードでつなぎ、区切り位置を2乗誤差で探す |
| `sola2.rs` | SOLAv2 / SOLAv3。声のある所は 1 周期ずつ切り貼りし、近くの周期と混ぜる（v3 は前後約 3 周期を平均する。ボーカルの既定）。声のない所の繰り返しは 1 回おきに逆向きにする |
| `hpss.rs` | HPSS。メディアンフィルタで打楽器の成分と伸びる成分に分け、Phase Vocoder と短い窓の OLA で伸ばして足す |
| `wsola.rs` | WSOLA。フレーム 46ms・50% オーバーラップ・探索幅 ±12ms。類似度を正規化した WSOLAv2（`wsola2_map`）も |
| `pv.rs` | Phase Vocoder（identity phase locking）。フレーム 2048・75% オーバーラップ。楽器の既定。位相の回転を複素数の掛け算にし、隣り合う2フレームを1回の FFT で変換して速くしている |
| `timemap.rs` | 出力位置→入力位置の対応。一定倍率とピッチカーブの両方を表す |
| `curve.rs` | ピッチカーブ編集。時間ごとのピッチ比から時間マップを作る |
| `formant.rs` | ケプストラムによるスペクトル包絡の補正（一定の量と、時間で変わる量） |
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
| `formant_curve_planar` | フォルマントカーブに従った処理（フォルマントだけを動かし、ピッチと長さは変えない） |
| `analyze_f0` / `analyze_spectrogram` / `analyze_tempo` | F0 推定（設定つき）、スペクトログラム、テンポの候補（モノラル） |
| `output_ptr` / `output_u8_ptr` | 直前の結果の置き場所 |

進捗は、Worker が渡す `env.report_progress(p)` を wasm から呼んで通知する。

## Worker とのやりとり
- リクエストは `kind` で分ける: `process`（加工）、`curve`（ピッチカーブ）、`formant`（フォルマントカーブ）、`f0`、`spec`、`tempo`
- 応答は `{ id, channels }` / `{ id, bytes }` / `{ id, error }` / `{ id, progress }`
- `engine.ts` が `id` ごとに Promise を持ち、応答と対応づける
- 音声データは `transfer` で渡し、コピーを避ける
- Worker は加工用（`process` / `curve` / `formant`）と解析用（`f0` / `spec` / `tempo`）の2つ。それぞれの中では、リクエストは届いた順に処理される
- 中断（`cancelDsp`）は加工用の Worker だけを止める

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
