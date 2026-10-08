# ファイル構成
どのディレクトリ・ファイルが何を担当するかの一覧。コードのどこを見ればよいかを探すときに使う。

関連: [アーキテクチャ](ARCHITECTURE.md) / [機能の仕組み](INTERNALS.md) / [アルゴリズム](ALGORITHM.md)

## ディレクトリ
```
src/
├── App.tsx          画面の組み立てだけ
├── hooks/           状態と操作（useEditor がまとめる）
├── components/      画面部品
│   ├── waveform/    帯パネルの描画（Canvas）と表示範囲、ツールバーのボタン
│   ├── inspector/   PC の右側のインスペクタ
│   └── tracks/      トラックの欄（波形付きの一覧 / タブ）・右クリックメニュー・名前の変更・並び替え
├── audio/           音声データの処理と再生（React に依存しない関数が中心）。トラック・ミックス・MIDI・音声の作成、区間ごとのテンポ（tempoMap.ts）、書き出しの仕上げ（finish.ts）もここ
│   └── realtime/    ループ試聴の AudioWorklet
├── dsp/             Worker と wasm の橋渡し、wevocal_dsp.wasm
├── project/         プロジェクトファイル（.wvsp）、自動保存、メモリ不足のときの再読み込みでの抽出
├── addons/          追加機能の導入・保存・読み込み（docs/EXTRACTOR.md）
├── settings/        設定と設定画面（分類ごとのページ、追加機能、データの削除、アップデートの確認）
├── debug/           デバッグ表示（FPS・描画回数・メモリの内訳・DSP の時間・画面が止まった記録）
├── progress/        進み具合のゲージに表示する処理の種類（本体は PevenMUI）
├── pwa/             新しい版の確認
└── i18n/            訳文と t()
dsp/src/             Rust の DSP
wevocal-lib/         共有の信号処理（FFT・リサンプル・STFT・窓関数・速い近似の数値計算・F0 推定・テンポ解析・立ち上がりの検出）と、音声ファイルの読み込み（AIFF は自前）・書き出し、再生、録音、波形の表示の土台（TypeScript 側は `web/`）。submodule
extractor/           ボーカル抽出（WeVocalExtractor）。submodule。追加機能としてビルドする（docs/EXTRACTOR.md）。単体の Web ツールでもある
analyzer/            声の解析（WeVocalAnalyzer）。submodule。スペクトログラムを追加機能「解析」として使う（analyzer/docs/REQUIREMENT.md）
converter/           音声ファイルの形式の変換（WeVocalConverter）。submodule。今は Extractor を写した土台（準備中。converter/docs/REQUIREMENT.md）
pevenmui/            UI 部品（PevenMUI。テーマ・メニューバー・確認ダイアログ・分割バー・設定画面の部品・ダイアログを別の窓に表示する WindowDialog / WindowPortal・進み具合のゲージ・ファイルを開く画面と最近使用したファイル・IndexedDB）。submodule
```
## ファイルの一覧

各ファイルの 1 行目の説明を並べたもの。`npm run map -- --write` で書き出す（手で直さない）。説明を変えるときは、そのファイルの 1 行目を直す。

<!-- map:start -->
```
src/
  App.tsx  （説明なし）
  appConfig.ts  アプリの定義（名前、URL、保存のキー）。Worker からも読み込める
  appInfo.ts  アプリの定義。vite.config.ts からも読み込むので、ほかのファイルを import しない（使い方は appConfig.ts の app）
  licenses.ts  「ライセンス情報」に表示する、使っている部品とモデルの一覧
  links.ts  外部へのリンク（URL は appInfo.ts）
  main.tsx  （説明なし）

src/addons/
  addons.ts  （説明なし）

src/audio/
  detectMode.ts  音声がボーカルか楽器かを判定し、モードごとの既定の処理方式を決める
  edit.ts  音声の編集の計算（範囲への加工、切り取りと挿入、音量、フェード、反転、曲線の書き込み）
  finish.ts  書き出しの仕上げ（ノーマライズと両端のフェード）
  kanaCut.ts  歌から一音（あ、い、う…）ずつ切り出す。文字化と読みは追加機能「歌詞の文字化」、境目は追加機能「解析」が行う（memo/kana-cut.md）
  kanaOut.ts  一音ずつ切り出したものの出し方（五十音順のトラック、UTAU の音源）。memo/kana-voice.md の 3.5
  midi.ts  標準 MIDI ファイル（.mid、形式 0 / 1）の読み込み。ピッチに当てはめるための音符（高さと、秒単位の始まり・終わり）だけを取り出す。
  mix.ts  トラックを足し合わせて 1 つにする（統合と書き出し）
  multiRange.ts  複数の選択範囲の整理、切り出し、範囲ごとの加工
  noteBlocks.ts  ピッチの線を音符ブロックに区切る
  notes.ts  音名（C から B まで、シャープ表記）
  originalStore.ts  原音を IndexedDB に退避してメモリを節約する
  pitchTools.ts  ピッチの曲線の一括操作（平らにする、音程に揃える、ビブラート、MIDI に合わせる）
  sampler.ts  音声を MIDI の音符に並べて新しいトラックを作る
  silence.ts  無音で区切って、音のある所を探す
  spectrogram.ts  スペクトログラムの計算を追加機能「解析」に頼む
  synth.ts  音を 0 から作る（声の母音、楽器の波形）
  tempoChange.ts  （説明なし）
  tempoMap.ts  テンポが途中で変わる曲のための、区間ごとのテンポと拍の位置
  timeMap.ts  編集の前の時刻を、編集の後の時刻に写す（読みの帯などの位置を、音声の編集に追従させる）
  tracks.ts  トラックの形と、保存する設定（フェーダー、鳴らし方、EQ）の変換
  types.ts  音声（Clip）の型と長さ、時間の表記の変換
  useLivePosition.ts  再生中の位置を、部品の中だけで決まった間隔で読む
  usePlayer.ts  再生（全トラックのミックス、ループ、音量メーター、フェーダーと EQ）
  video.ts  動画の書き出しを追加機能「変換」に頼む
  vocalExtract.ts  ボーカル抽出の本体（モデルの選択と実行環境。React に依存しない）

src/audio/realtime/
  granularProcessor.ts  リアルタイム試聴用の AudioWorklet。グラニュラー方式でピッチ変更・時間伸縮を行う。
  useRealtimePreview.ts  範囲をループ再生しながら、ピッチと伸縮率の変更をすぐ反映する（AudioWorklet）

src/commands/
  edit.ts  編集のコマンド（元に戻す、切り取りなど、選択、マーカー、音量）
  file.ts  ファイルのコマンド（開く、保存、書き出し、設定）
  help.ts  ヘルプのコマンド（ユーザーガイド、ショートカット、更新の確認など）
  index.ts  コマンドの一覧と、メニューの項目を作る関数
  menus.ts  メニューバーと右クリックメニューの並び（項目はコマンドの id。docs/DECISIONS.md の「メニューの構成」）
  play.ts  再生のコマンド（再生、ループ、移動）
  tools.ts  ツールのコマンド（ボーカル抽出、音声の作成、録音、ピッチの道具）
  track.ts  トラックのコマンド（選んでいるトラックに効く）
  types.ts  コマンド（操作）の型。メニュー、右クリック、ショートカット、ツールバーが id で参照する（memo/commands.md）
  view.ts  表示のコマンド（帯の表示、拡大縮小、追従）

src/components/
  AboutDialog.tsx  「このアプリについて」のダイアログ
  AlgorithmMenu.tsx  処理方式の一覧と選ぶメニュー（従来の方式と試験的な方式の表示を含む）
  AppDialogs.tsx  （説明なし）
  AppHeader.tsx  スマホの上部バー（プロジェクト名とメニュー）
  AppIcon.tsx  アプリのアイコン（public/icon.svg）。GitHub Pages ではサブパスで配信されるため BASE_URL から組み立てる
  CleanExtractScreen.tsx  メモリが足りないときの抽出の画面（再読み込みの直後に表示する）
  EditPanel.tsx  加工の欄（ピッチ、長さ、フォルマント、処理方式、試聴と適用）
  EmptyState.tsx  何も開いていないときの画面（開く、最近使用したファイル、音声の作成、録音）
  ExportDialog.tsx  音声の書き出しのダイアログ
  HistoryDialog.tsx  編集の履歴のダイアログ（押した段へ戻る）
  KanaCutDialog.tsx  （説明なし）
  LevelMeter.tsx  音量メーター（wevocal-lib の部品にテーマの色を渡す）
  LiveTime.tsx  再生中の時間の表示（部品の中だけで更新する）
  MarkerTempoDialog.tsx  マーカーからのテンポを決めるダイアログ
  MidiDialog.tsx  MIDI に合わせてピッチの曲線を作るダイアログ
  MobileEditBar.tsx  スマホで範囲を選んだときの編集のボタンの列
  MobilePlayBar.tsx  スマホの下の再生バー
  MoraLane.tsx  （説明なし）
  PitchControl.tsx  ピッチの変更量のスライダーと入力欄
  PitchToolDialogs.tsx  ピッチの一括操作のダイアログ（音程に揃える、ビブラート）
  PitchToolHost.tsx  ピッチの一括操作のダイアログを開く場所
  PresetMenu.tsx  加工のプリセットのメニュー
  RecordDialog.tsx  録音のダイアログ（入力元、レベル、録音したものを新しいトラックへ）
  RepeatDialog.tsx  選択範囲を繰り返すダイアログ
  SamplerDialog.tsx  MIDI の音符に並べるダイアログ（サンプラー）
  SelectionField.tsx  選択範囲の開始と終了の入力欄
  ShortcutsDialog.tsx  ショートカットの一覧のダイアログ
  SilenceDialog.tsx  無音を挿入するダイアログ
  SoundSelectDialog.tsx  無音で区切って選択するダイアログ
  stableMemo.ts  関数の props が作り直されても描き直さない memo
  StatusBar.tsx  PC の下のステータスバー（プロジェクト名、形式、選択範囲、BPM、原音と加工後）
  SynthDialog.tsx  音を 0 から作るダイアログ
  TempoChangeDialog.tsx  （説明なし）
  TempoField.tsx  BPM の表示と入力（タップで測る、再解析）
  Toolbar.tsx  PC の上のツールバー（再生、編集、表示のボタン）
  UpdatePrompt.tsx  新しい版が公開されたときの通知
  VideoExportDialog.tsx  動画の書き出しのダイアログ
  videoPrefs.ts  動画の書き出しで覚えておく選択（既定値）
  VolumePanel.tsx  音量の欄（トラックのフェーダーと、範囲の音量の編集）
  Waveform.tsx  波形と帯（スペクトログラム、ピッチ、音量、フォルマント）の Canvas と、その上の操作

src/components/inspector/
  Inspector.tsx  インスペクタ（右の欄）の部品（折りたたむ欄、行、数値の入力）

src/components/tracks/
  RenameDialog.tsx  名前の変更のダイアログ（トラック、プロジェクト）
  TrackLanes.tsx  トラックの欄（波形付きの一覧）
  trackMenu.ts  トラックの右クリックメニュー
  TrackPanel.tsx  トラックの欄の外枠（一覧とタブの切り替え、たたむ）
  TrackTabs.tsx  トラックの欄（タブの形）
  useTrackArea.tsx  トラックの欄と、右クリックメニュー、名前の変更のつなぎ込み
  useTrackDrag.ts  トラックの選択（修飾キーで複数）とドラッグでの並び替え

src/components/waveform/
  curveLane.ts  曲線の帯（音量、フォルマント）の縦軸と描画
  draw.ts  波形の欄の描画（波形、目盛り、帯、選択範囲、再生位置、マーカー）
  useLaneDivider.ts  上下の帯の境目のドラッグ
  useLanePen.ts  ペンで帯に曲線を描く
  useNoteDrag.ts  音符ブロックのドラッグ（移動と端の伸縮）
  usePitchGrab.ts  ピッチの線を掴んで上下に動かす
  WaveformToolbar.tsx  波形の上のツールバー（拡大縮小、ペン、掴む、ピッチの道具）

src/constants/
  ui.ts  画面の定数（選択肢の表、小さいボタンの見た目）

src/debug/
  DebugOverlay.tsx  デバッグ表示（FPS、描画回数、メモリ、DSP の時間）
  debugStats.ts  デバッグ表示用の計測値。計測はいつも行う（数を足すだけなので軽い）ので、
  diagnoseExtract.ts  ボーカル抽出の診断の本体
  ExtractDiagnose.tsx  ボーカル抽出の診断の画面（設定の開発者向け）

src/dsp/
  engine.ts  DSP の Worker への頼みごと（加工、解析）と、Worker の管理
  parallel.ts  長い音を区間に分けて並列に加工する（試験的）
  worker.ts  wasm の DSP エンジンをメインスレッド外で実行する Worker

src/effects/
  index.ts  エフェクトの表と、表の順に掛ける関数（書き出し、再生）
  types.ts  エフェクトの型。トラックに掛けるもの（EQ、フェーダー）は、どれもこの形で表（index.ts）に登録する

src/effects/eq/
  eq.ts  トラックのグラフィック EQ の計算（再生と書き出しに掛ける）
  EqDialog.tsx  トラックのグラフィック EQ のダイアログ
  EqGraph.tsx  グラフィック EQ のグラフ（なぞって値を描く）

src/effects/fader/
  fader.ts  フェーダー（音量、パン、位相の反転）。書き出しの計算と、再生のノード

src/hooks/
  editActions.ts  音声を書き換える操作（加工の適用、テンポの伸縮、区間の伸縮、サンプラー、曲線の書き込み）
  useAppMenus.ts  メニューバーと右クリックメニューを、並び（commands/menus.ts）とコマンドから作る
  useAutosave.ts  作業状態の自動保存と、起動時の復元
  useClipAnalysis.ts  表示しているときだけ音声を解析して結果を持つ（ピッチ、スペクトログラム）
  useClipCommands.ts  音声の編集の操作（切り取り、コピー、貼り付け、削除、無音の挿入、音量、パンなど）
  useDialogs.ts  ダイアログの開閉と、開くときに渡す値
  useDocument.ts  開いている文書（プロジェクト）: 名前、テンポ、マーカー、トラックと元に戻す、未保存の印、保存先、タイトル（memo/document.md）
  useEditor.ts  （説明なし）
  useEditorKeys.ts  キーの割り当てと、フォーカスしている帯（波形かピッチ）に効く切り取りなど。キーの処理はコマンド（src/commands/）
  useFormantCurve.ts  フォルマントの帯に描いた曲線と、その試聴
  useHistory.ts  元に戻す、やり直す（差分で持ち、メモリの上限で古い段を捨てる）
  useLaneCurve.ts  帯に描く曲線（音量、フォルマント）の値
  useLanes.ts  帯の表示と、フォーカスしている帯
  useMarkers.ts  （説明なし）
  useNumberDraft.ts  数値の入力欄を、打っている途中の文字のまま扱う
  useOutput.ts  プロジェクトの保存と、音声の書き出し
  usePitchClipboard.ts  ピッチの曲線の切り取り、コピー、貼り付け
  usePitchTarget.ts  ペンで描いた目標のピッチ
  usePitchTools.ts  ピッチの曲線の一括操作と、その試聴
  usePitchVoicing.ts  ピッチを出す所と消す所の指定
  usePlayback.ts  通常の再生と試聴の切り替え（片方を始めたらもう片方を止める）
  usePreview.ts  加工の結果を前もって作る（試聴と適用を速くする）
  useRangeNote.ts  選択範囲の音程を解析する
  useSeek.ts  矢印キーと Home、End での再生位置の移動（拍に合わせる）
  useSelectionExport.ts  選択範囲の書き出し（外へのドラッグ、フォルダーへの保存）と、書き出しの保存先フォルダー
  useStartup.ts  起動時の処理（自動保存からの復元、ファイルから起動、抽出から戻る）
  useTask.ts  時間のかかる処理を、処理中の印、進み具合、通知、中断付きで実行する
  useTempo.ts  （説明なし）
  useTracks.ts  トラックの操作（追加、複製、削除、選択）と、鳴らし方（ミュート、ソロ）
  useVideoExport.ts  動画の書き出し（追加機能「変換」）
  useVocalExtract.ts  ボーカル抽出の操作（モデルの確認、実行、結果をトラックへ）
  useVoiceSplit.ts  和音を 2 つの声に分ける操作（試作）

src/i18n/
  i18n.ts  多言語化（訳文の JSON をまとめて t() を出す）

src/progress/
  jobs.ts  進み具合のゲージに表示する処理の種類

src/project/
  autosave.ts  作業状態を IndexedDB に保存する
  autosaveWorker.ts  自動保存の書き込み専用の Worker。
  cleanExtract.ts  メモリが足りないときの抽出（再読み込みしてから抽出する）
  extractGuard.ts  抽出のあとにアプリが落ちたかを、次の起動で知る印
  idb.ts  このアプリの IndexedDB。画面（メインスレッド）と自動保存の Worker の両方から使う
  projectFile.ts  プロジェクトファイル（.wvsp）の読み書き
  storage.ts  ブラウザ内に保存しているデータの確認と削除（設定の「データ」）

src/pwa/
  updateCheck.ts  新しい版の確認

src/settings/
  DataSection.tsx  設定の「データ」（使用量と削除）
  keymap.ts  Synth の操作の一覧と既定のキー
  OutputDeviceRow.tsx  設定の「音声の出力先」の行
  ProjectSection.tsx  設定の「プロジェクト」（名前とテンポ）
  settings.ts  設定の保存と読み込み、Context
  SettingsDialog.tsx  設定のダイアログ（PevenMUI の設定画面に、分類と中身を渡す）
  SettingsPages.tsx  （説明なし）
  settingsSearch.ts  設定画面の分類の並びと、検索の対象
  ShortcutSection.tsx  設定の「キーとマウス」のショートカットの割り当て

src/settings/items/
  debug.ts  設定の項目の定義（開発者向け、音声処理、試験的機能）
  define.ts  設定の項目を定義する関数（check、choice、number、value）
  display.ts  設定の項目の定義（表示と、表示メニューの切り替え）
  general.ts  設定の項目の定義（全般、編集、キーとマウス、ファイル）
  index.ts  設定の項目をまとめ、型と既定値を作る
  process.ts  （説明なし）
  SettingRow.tsx  項目の定義から設定画面の 1 行を作る
  stored.ts  設定の項目の定義（画面の操作で覚えておく値）

dsp/src/
  curve.rs  ピッチカーブ編集: 時間ごとに変わるピッチ比で、長さを変えずにピッチを変える。
  ffi.rs  wasm 向け C ABI。wasm-bindgen を使わず、Worker から素の `WebAssembly.instantiate` で呼べる関数だけを公開する。
  formant.rs  スペクトル包絡（フォルマント）補正。
  hpss.rs  打楽器分離（HPSS）を使った時間伸縮（Driedger, Müller, Ewert 2014）。
  kana.rs  声の素材から一音を作る（試験的。memo/kana-voice.md）。今は母音だけ。
  lib.rs  WeVocalSynth の DSP エンジン。
  pipeline.rs  ピッチ変更・時間伸縮・フォルマント補正をまとめた処理の流れ。
  psola.rs  TD-PSOLA（Time-Domain Pitch-Synchronous Overlap-Add）による時間伸縮。ボーカル向け。
  pv.rs  identity phase locking（Laroche & Dolson）付き Phase Vocoder による時間伸縮。
  segment.rs  区間に分けて並列に加工する（試験的。memo の WebGPU の設計の 9.）。
  sms.rs  正弦波と雑音のモデル（SMS、Spectral Modeling Synthesis）による時間伸縮。愛称は Specraw。できるだけ可逆な方式。
  sola.rs  2乗誤差で区切り位置を探す、クロスフェード方式の時間伸縮（SOLA）。
  sola2.rs  SOLA の改良版（SOLAv2）。声のある所は、切り貼りの単位を声の 1 周期にし、近くの周期と混ぜて少しずつ移り変わらせる。
  timemap.rs  伸縮処理で使う、出力位置 → 入力位置の時間対応。
  wsola.rs  WSOLA（Waveform Similarity Overlap-Add）による時間伸縮。

dsp/src/tests/
  analysis.rs  F0 推定・スペクトログラムのテスト。
  consonant.rs  声の子音（破裂音）のテスト。母音・閉鎖（無音）・破裂（短い雑音）・息（弱い雑音）を繰り返す音を伸ばし、
  curve.rs  ピッチカーブ編集のテスト。
  formant.rs  フォルマント補正のテスト。
  mod.rs  テスト共通の信号生成・計測ヘルパ。
  roundtrip.rs  往復の劣化（可逆性）のテスト。+n 半音のあと -n 半音、×a のあと ×1/a で、どれだけ元の音に戻るかを方式ごとに測る。
  segment.rs  区間に分けて並列に加工する試作の確認（segment.rs）
  sola_params.rs  SOLAv2・v3 の調整できる値（`sola2::Params`）を、組み合わせごとに測って比べる。
  stretch.rs  時間伸縮・ピッチ変更のテスト。
  voices.rs  和音を 2 つの声に分ける試作の確認（memo/harmony-split.md）。結果は `cargo test voices -- --nocapture` で表示する

dsp/src/voices/
  detect.rs  和音を 2 つの声に分けるための、フレームごとの声（F0 と倍音の振幅）の推定（memo/harmony-split.md）
  mod.rs  和音を 2 つの声に分ける（試作。memo/harmony-split.md）。
```
<!-- map:end -->

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
| `pipeline.rs` | 上の流れ。`Algorithm`（WSOLA=0 / Phase Vocoder=1 / PSOLA=2 / SOLA=3 / PSOLAv2=4 / WSOLAv2=5 / Phase Vocoder v2=6 / HPSS=7 / SOLAv2=8 / SOLAv3=9 / SMS=10）と `Formant`（追従 / 保持＋移動） |
| `psola.rs` | PSOLA。声の周期（ピッチマーク）に合わせて切り貼りする。目印の置き方（`Marking`）で PSOLAv2 にもなる |
| `sola.rs` | SOLA。50ms のブロックを 10ms の sin クロスフェードでつなぎ、区切り位置を2乗誤差で探す |
| `sola2.rs` | SOLAv2 / SOLAv3。声のある所は 1 周期ずつ切り貼りし、近くの周期と混ぜる（v3 は前後約 3 周期を平均する。ボーカルの既定）。声のない所の繰り返しは 1 回おきに逆向きにする |
| `hpss.rs` | HPSS。メディアンフィルタで打楽器の成分と伸びる成分に分け、Phase Vocoder と短い窓の OLA で伸ばして加える |
| `wsola.rs` | WSOLA。フレーム 46ms・50% オーバーラップ・探索幅 ±12ms。類似度を正規化した WSOLAv2（`wsola2_map`）も |
| `sms.rs` | SMS（愛称 Specraw。試験的）。正弦波の軌跡と帯域ごとの雑音に分けて鳴らし直す、できるだけ可逆な方式の試作 |
| `pv.rs` | Phase Vocoder（identity phase locking）。フレーム 2048・75% オーバーラップ。楽器の既定。位相の回転を複素数の掛け算にし、隣り合う2フレームを1回の FFT で変換して速くしている |
| `timemap.rs` | 出力位置→入力位置の対応。一定倍率とピッチカーブの両方を表す |
| `curve.rs` | ピッチカーブ編集。時間ごとのピッチ比から時間マップを作る |
| `formant.rs` | ケプストラムによるスペクトル包絡の補正（一定の量と、時間で変わる量） |
| `f0.rs`（wevocal-lib） | YIN による F0 推定（16kHz に間引き、10ms 間隔）。探す範囲・有声判定・無音判定は `Params` で変えられる。`crate::f0` で使用できる |
| `tempo.rs`（wevocal-lib） | テンポ解析。スペクトルの増加量（オンセット強度）の、時間方向の周波数成分から BPM の候補と1拍目の位置を求める。`crate::tempo` で使用できる |
| `ffi.rs` | wasm 向けの C ABI |

FFT（radix-2。回転因子を段ごとに連続して並べ、SIMD を活用できるようにしている）とリサンプル（窓付き sinc 補間。上げるときはカットオフを下げて折り返しを防ぐ）は `wevocal-lib` にある。`crate::fft` / `crate::resample` で今までどおり使用できる。周期的な Hann 窓（`wevocal_lib::window::hann`）、速い近似の ln / exp、位相の折り返し、中央値（`wevocal_lib::math`）、F0 推定（`f0`）、テンポ解析（`tempo`）、立ち上がりの検出（`onset`）も `wevocal-lib` にあり、ほかのソフトでも使用できるようにしている。

### wasm の公開関数

| 関数 | 内容 |
| --- | --- |
| `alloc_f32` / `free_f32` | wasm メモリ上の f32 配列の確保・解放 |
| `process_planar` | ピッチ変更・時間伸縮・フォルマント（全チャンネル） |
| `process_curve_planar` | ピッチカーブに従った処理 |
| `formant_curve_planar` | フォルマントカーブに従った処理（フォルマントだけを動かし、ピッチと長さは変えない） |
| `analyze_f0` / `analyze_tempo` | F0 推定（設定つき）、テンポの候補（モノラル）。スペクトログラムは追加機能「解析」（analyzer/ の dsp） |
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
| `npm run build:addons` | 追加機能（ボーカル抽出の実行環境とモデル、解析、変換）を `dist/addons/` に作る。`npm run build` の後に実行する |
| `npm run build:addons:dev` | 同じものを `public/addons/` に作る（git には入れない）。`npm run dev` でも追加機能を試せる。一度作れば `npm run build` でも `dist/` にコピーされる |

| `npm run docs:shots` | 画面の画像（`docs/images/`）を撮り直す（`scripts/screenshots/`。docs/WRITING.md の「画像」） |
| `node scripts/docs-to-dokuwiki.mjs` | `docs/MANUAL.md` を分けて `docs/wiki/` のページを作り直し、DokuWiki の記法にして `dist/dokuwiki/` に書き出す |

`.wasm` はリポジトリに含めているので、Rust がない環境でも `npm install && npm run dev` で動く。
