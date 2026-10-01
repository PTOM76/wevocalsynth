# ボーカル抽出（WeVocalExtractor）の設計
曲からボーカルだけを推定して取り出す機能の設計。リポジトリの分け方、追加機能として配る仕組み、処理の流れ、WeVocalSynth への組み込み方をまとめる。(2026-10-01 時点、未実装)

関連: [アーキテクチャ](ARCHITECTURE.md) / [決定事項](DECISIONS.md)

## 方針
- 音源分離（混ざった音から楽器ごとの音を推定して分けること）は、機械学習のモデルで行う。声と楽器は同じ周波数帯域に重なるため、EQ や FFT だけでは分けられない
- 分け方は「ボーカル / 伴奏」の2つで十分とする。4ステム（ボーカル・ドラム・ベース・その他）は要らない
- 評価の基準は「単体の分離ソフトとして最高品質か」ではなく、「後段の F0（基本周波数、声の高さ）解析とピッチ・時間編集に十分なボーカルを、ブラウザで軽く作れるか」
- 推論は端末上で行い、音声を外部に送らない。静的ホスティングだけで動く、という WeVocalSynth の前提を守るため

## リポジトリの構成
```text
wevocal-lib（共通ライブラリ、Rust crate、別リポジトリ）
  fft / stft・逆stft / 窓関数 / resample
      ↑                         ↑
wevocalsynth の dsp          wevocalextractor（別リポジトリ）
  （PSOLA・F0 など）            （分離の前処理・後処理と推論の呼び出し）
```

| リポジトリ | 役割 | WeVocalSynth からの取り込み方 |
| --- | --- | --- |
| `wevocal-lib` | 両方が使う信号処理の部品 | git submodule ＋ `Cargo.toml` のパス依存 |
| `wevocalextractor` | ボーカル抽出。UI を持たないライブラリと、単体で試すデモページ | git submodule。ビルドして追加機能として配る |

- STFT（短時間フーリエ変換）などを Extractor 側に置かないのは、依存の向きを保つため。WeVocalSynth の基本機能（ピッチ変更・スペクトログラム）が、追加機能の Extractor に依存するのを避ける
- submodule ＋パス依存にするのは、両方を同時に直しながら開発しやすいため
- WASM はそれぞれ別にビルドする。共通部分は両方の `.wasm` に入るが、小さいので問題にならない

### wevocal-lib へ移すもの
| 今の場所 | 扱い |
| --- | --- |
| [dsp/src/fft.rs](../dsp/src/fft.rs) の `Fft` | そのまま移す |
| [dsp/src/resample.rs](../dsp/src/resample.rs) の `resample` / `resample_with` | そのまま移す |
| STFT / 逆STFT | 汎用の関数は今は無い（[spec.rs](../dsp/src/spec.rs) は表示用）。新しく書いて置く |

移した後は、[pv.rs](../dsp/src/pv.rs) なども共通の関数に寄せていく。置き換えは [dsp/src/tests/](../dsp/src/tests/) が通ることを確かめながら行い、既存の処理結果は変えない。

## wevocalextractor の構成
```text
wevocalextractor/
  src/
    index.ts      公開 API（UI なし、React に依存しない）
    worker.ts     推論は専用の Worker で行う
    models/       モデルごとの定義（入力形式・STFT の設定・後処理）
  demo/           単体で試す最小ページ（将来の GUI の土台）
```

- 受け渡しは `Float32Array[]`（チャンネルごとのサンプル）とサンプルレートだけにする。将来、単体のアプリにしてもそのまま使えるようにするため
- モデルファイルはリポジトリに含めない。導入時に取得する（[追加機能の仕組み](#追加機能の仕組み)）

公開 API の案:
```ts
const ex = await createExtractor({ model: 'light', backend: 'auto' }) // auto: 使えれば WebGPU、なければ WASM
const { vocal, instrumental } = await ex.separate(channels, sampleRate, {
  onProgress: (p) => {}, signal, // 中断できるようにする
})
ex.dispose()
```

## 処理の流れ
```text
デコード済みの音声
 → モデルのサンプルレートへ変換（wevocal-lib の resample）
 → 数秒ずつのチャンクに分ける（前後を重ねる）
 → STFT → ONNX Runtime Web で推論（マスクまたはスペクトルを推定）→ 逆STFT
 → 重ねた部分をクロスフェードでつなぐ
 → 元のサンプルレートに戻す
```

- チャンクに分けるのは必須。1曲を丸ごと推論するとスマホではメモリが足りずタブが落ちる。チャンク単位にすると、進捗表示と中断もそのまま作れる
- STFT の設定（窓の長さ・ずらし幅）はモデルの学習時と同じでないと品質が崩れるため、`models/` の定義に持たせる

## 対象の環境とモデル
スマホでも動くことを必須にする。モデルは利用者が選び、選んだものだけを導入する（モデルごとに別の追加機能として配る）。

### 採用するモデル: Spleeter 2stems（sherpa-onnx の ONNX 版）
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases/tag/source-separation-models) が変換したものをそのまま使う。変換の作業（Python・TensorFlow）は要らない。

| モデル | 大きさ（ボーカル用＋伴奏用） | 実行方法 | 扱い |
| --- | --- | --- | --- |
| fp16 | 39MB | WASM のみ | 標準。ダウンロードが一番小さい |
| int8 | 52MB | WASM・WebGPU | 選べる。WASM で fp16 より約1割速い |
| fp32 | 79MB | WASM・WebGPU | 選べる |

- 設定の「ボーカル抽出のモデル」で選ぶ。未導入のモデルで抽出しようとしたら、導入の確認ダイアログを出す
- モデルごとの導入・削除は、設定の「追加機能」でいつでもできる（使わなくなったモデルだけ消せる）
- 実行方法は自動で決める: WebGPU が使え、モデルが対応していれば WebGPU、それ以外は WASM
- 入出力: `[2ch, 分割数, 512 フレーム, 1024 ビン]` の振幅スペクトログラム。ボーカル用・伴奏用の2つのモデルを両方動かし、比率のマスク（`v² / (v² + a²)`）を元の STFT に掛けて逆STFT する
- STFT: 44.1kHz、n_fft 4096、hop 1024、Hann 窓、center なし
- 1024 ビン（約 11kHz）より上はモデルが扱わない。sherpa-onnx はマスクを 0 にしている。1024 ビン目の値で延ばす方法も試せるようにしてあり、どちらを標準にするかは未定
- ライセンス（sherpa-onnx: Apache-2.0、Spleeter の重み: MIT のはず）は、配る前に原文で確かめる

### 測った値 (2026-10-01、PC・Chrome・1スレッド、45秒の曲)
| 構成 | RTF（処理時間 ÷ 音声の長さ） | 推論 | STFT＋逆STFT（JS） |
| --- | --- | --- | --- |
| fp16 / WASM | 0.19〜0.21 | 約5秒 | 約3.6秒 |
| int8 / WASM | 0.17〜0.18 | 約4.5秒 | 約3.4秒 |
| fp16 / WebGPU | 0.09（ただし出力がすべて 0） | 0.3秒 | 約3.7秒 |

- 2分の曲は fp16 / WASM で約23秒、JS ヒープ約210MB（ほとんどは出力のボーカル・伴奏 2ch ずつ。アプリではボーカルだけ返して減らす）
- STFT＋逆STFT を JS で書いた今は、処理時間の4割を占める。wevocal-lib（Rust、SIMD）に移して縮める
- 音質は「後段の加工に十分」（聴いた印象）
- スマホ・int8 / fp32 の WebGPU の速さは未測定
- 実験のコードは `experiments/vocal-extractor/`（git には入れていない）

### 実行方法
| 実行方法 | 扱い |
| --- | --- |
| WebGPU | 使えて、モデルが対応していれば使う |
| WASM（マルチスレッド） | 当面は使わない。COOP/COEP ヘッダーが要り、GitHub Pages では設定できない。Service Worker で回避する方法は、今の PWA との兼ね合いを要検証 |
| WASM（シングルスレッド） | どこでも動く。動作保証の最低線 |

### 後で試す候補
| 候補 | 所感 |
| --- | --- |
| UVR の MDX-Net 系 | sherpa-onnx に ONNX 版（28〜64MB）がある。Spleeter より約10倍遅い。重みのライセンスはモデルごとに確かめる |
| Demucs（htdemucs） | 高品質だが重い。スマホの標準には向かない |

## 追加機能の仕組み
ボーカル抽出は「追加機能」として、使いたい人が導入する。普段の起動を重くしないため、かつ導入した人はオフラインでも使えるようにするため。仕組みは汎用にし、ボーカル抽出をその第1号とする。

### 導入の流れ
```text
「ボーカルを抽出」を押す
 → 未導入なら確認ダイアログ（「追加機能です。導入しますか？（ダウンロード約 ○○MB）」）
 → JS・WASM・モデルを取得して保存（進捗表示、中断可）
 → そのまま抽出を実行
```

### 作り（実装済み: [src/addons/](../src/addons/)、2026-10-01）
| 項目 | 内容 |
| --- | --- |
| マニフェスト | `addons/<id>/manifest.json` に ID・バージョン・読み込むファイル（`entry`）・ファイル一覧（大きさとハッシュ）を書く。確認ダイアログのダウンロード量と進捗もここから出す |
| 一覧 | 配信している追加機能は `ADDONS`（[addons.ts](../src/addons/addons.ts)）に並べる |
| 導入 | `install` がファイルを1つずつ取得し、大きさとハッシュを確かめて保存する。マニフェストは最後に保存し、あれば導入済みとみなす。途中で失敗・中断したら、その追加機能をすべて消す |
| 保存先 | アプリ本体とは別の Cache Storage（`wevocalsynth-addons`）。アプリ本体のキャッシュは更新のたびに入れ替わるため分ける。「オフライン用キャッシュ」の削除では消さず、「すべてのデータ」の削除では消す |
| 読み込み | Service Worker が `addons/` へのリクエストを保存先から返す（なければネットワーク）。`loadAddon` で `import()` する |
| 確認ダイアログ | `useAddonInstall`（[AddonInstallDialog.tsx](../src/addons/AddonInstallDialog.tsx)）。機能を使う直前に `ensure(id)` を呼び、未導入ならダイアログを出す |
| 更新・削除 | 設定の「追加機能」（[AddonSection.tsx](../src/settings/AddonSection.tsx)）。配信中のバージョンと違えば「更新」を出す。勝手には取得しない |
| 容量 | 導入できたら「データを削除されにくくする」を申請する（断られても使える） |
| ビルド | 追加機能ごとに `dist/addons/<id>/` に出力する。アプリ本体のプリキャッシュには入れない（`globIgnores`） |

Service Worker は保存先から返すだけで、自分では保存しない。workbox の CacheFirst は取得したものを勝手に保存するため、中断したファイルや更新確認で取ったマニフェストが残る。
取得するときは URL にクエリを付ける（`?v=` / `?t=`）。付けないと、導入済みの古い版が Service Worker から返る。

#### 確認用の追加機能
`test`（[scripts/gen-addon-test.mjs](../scripts/gen-addon-test.mjs) で作る、40MB のダミー＋`index.js`）。設定 → 開発者向け → デバッグ表示を ON にすると、設定の「追加機能」に出る。
- 本番ビルド: デプロイ時に `dist/addons/test/` に作る
- 開発サーバー: `node scripts/gen-addon-test.mjs public` で `public/addons/test/` に作る（git には入れない）

### 置き場所: GitHub Pages
モデルもアプリと同じ GitHub Pages から配る。リポジトリには入れず、GitHub Releases に置いたものをデプロイ時に取得して `dist/addons/` に加える（リポジトリを大きくしないため）。

40MB のダミーファイルで確かめた結果 (2026-10-01、PC):

| 項目 | 結果 |
| --- | --- |
| 取得 | 約 13 MB/s（40MB で約3秒）。ハッシュ一致 |
| 圧縮 | gzip で配信される。重みのような縮まないデータでは効かない |
| `Content-Length` | 圧縮後の大きさ。進捗はマニフェストの大きさで出す（[決定事項](DECISIONS.md)） |
| `Cache-Control` | `max-age=14400`。更新はマニフェストのバージョンで判定するので影響しない |
| オフライン | Service Worker が制御しているページなら、保存先から返せた |

- 保存先から照合するときは `ignoreVary` を付ける。サーバーによって `Vary`（`Origin` / `Accept-Encoding`）が付き、条件次第で見つからないと判定されるため
- スマホの回線での速度・保存できる容量は未確認

## WeVocalSynth への組み込み
- 入口: 右クリックメニューと「編集」メニューの「ボーカルを抽出」。ツールバーには、よく使うと分かるまで入れない
- 対象: 選択範囲があればその範囲、なければ全体（「ピッチの揺れを平らにする」と同じ）
- 結果: 対象の範囲を置き換え、操作履歴に積む（元に戻せる）。同じ処理で「伴奏だけ残す」も作れる
- モード: 抽出した直後は、最初の選択を「ボーカル（PSOLA）」にする。変更は普段どおりできる
- `onnxruntime-web` は追加機能の中に含め、アプリ本体には入れない

## 未確定のこと
- WASM のマルチスレッドを使うか
