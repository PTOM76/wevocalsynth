# ボーカル抽出（WeVocalExtractor）
曲からボーカル（または伴奏）だけを取り出す機能。本体は別リポジトリの [WeVocalExtractor](https://github.com/PTOM76/wevocalextractor)（submodule の `extractor/`）で、WeVocalSynth には追加機能として組み込む。このドキュメントは WeVocalSynth 側のこと（リポジトリの分け方・追加機能の仕組み・配信・組み込み）をまとめる。(2026-10-01 時点)

関連: [アーキテクチャ](ARCHITECTURE.md) / [決定事項](DECISIONS.md)

## 抽出の本体について
抽出そのもの（方針・公開 API・処理の流れ・モデル・測った値）は、WeVocalExtractor のドキュメントにある（手元では `extractor/docs/`）。

- [設計](https://github.com/PTOM76/wevocalextractor/blob/main/docs/DESIGN.md): 方針・構成・公開 API・処理の流れ・実行方法
- [モデル](https://github.com/PTOM76/wevocalextractor/blob/main/docs/MODELS.md): Spleeter 2stems の種類（fp16 / int8 / fp32）・入出力・測った値・今後の候補

大まかには、Spleeter 2stems（ボーカル / 伴奏の2分離のモデル）を ONNX Runtime Web でブラウザの中で動かす。音声は外部に送らない。曲を約12秒ずつに分けて処理するので、スマホでも動く。

## リポジトリの構成
```text
wevocal-lib（Rust、submodule）    FFT・リサンプル（STFT も今後ここへ）
    ↑                     ↑（今後）
dsp/（PSOLA・F0 など）    extractor/ = wevocalextractor（TypeScript、submodule）
```

| リポジトリ | 役割 | 取り込み方 |
| --- | --- | --- |
| [wevocal-lib](https://github.com/PTOM76/wevocal-lib) | WeVocalSynth と WeVocalExtractor が使う信号処理の部品 | submodule ＋ `dsp/Cargo.toml` のパス依存 |
| [wevocalextractor](https://github.com/PTOM76/wevocalextractor) | ボーカル抽出の本体（UI なし） | submodule。ビルドして追加機能として配る |

- 共通の部品を Extractor 側に置かないのは、依存の向きを保つため。WeVocalSynth の基本機能（ピッチ変更・スペクトログラム）が、追加機能の Extractor に依存しないようにする
- submodule ＋パス依存にするのは、両方を同時に直しながら開発しやすいため
- clone するときは `--recursive` を付ける（付け忘れたら `git submodule update --init`）

## 追加機能の仕組み
ボーカル抽出は「追加機能」として、使いたい人だけが導入する。普段の起動を重くしないため、かつ導入した人はオフラインでも使えるようにするため。仕組みは汎用にし、ボーカル抽出をその第1号とする（[src/addons/](../src/addons/)）。

### 導入の流れ
```text
「ボーカルを抽出」を押す
 → 未導入なら確認ダイアログ（「追加機能です。導入しますか？（ダウンロード約 ○○MB）」）
 → 実行環境とモデルを取得して保存（進捗表示、中断可）
 → そのまま抽出を実行
```

### 作り
| 項目 | 内容 |
| --- | --- |
| マニフェスト | `addons/<id>/manifest.json` に ID・バージョン・読み込むファイル（`entry`、ファイルだけなら null）・ファイル一覧（大きさとハッシュ）を書く。確認ダイアログのダウンロード量と進捗もここから出す |
| 一覧 | 配信している追加機能は `ADDONS`（[addons.ts](../src/addons/addons.ts)）に並べる。`requires` で依存を書く |
| 導入 | `install` がファイルを1つずつ取得し、大きさとハッシュを確かめて保存する。マニフェストは最後に保存し、あれば導入済みとみなす。途中で失敗・中断したら、その追加機能をすべて消す |
| 保存先 | アプリ本体とは別の Cache Storage（`wevocalsynth-addons`）。アプリ本体のキャッシュは更新のたびに入れ替わるため分ける |
| 読み込み | Service Worker が `addons/` へのリクエストを保存先から返す（なければネットワーク）。`loadAddon` で `import()` し、ファイルは `addonFileUrl` で参照する |
| 確認ダイアログ | `useAddonInstall`（[AddonInstallDialog.tsx](../src/addons/AddonInstallDialog.tsx)）。機能を使う直前に `ensure(id)` を呼び、未導入ならダイアログを出す。依存するものも一緒に入れる |
| 更新・削除 | その機能の設定画面に置く（[AddonSection.tsx](../src/settings/AddonSection.tsx)）。配信中のバージョンと違えば「更新」を出す。勝手には取得しない。消すときは、どこからも使われなくなった依存も一緒に消す（`uninstallWithUnused`） |
| まとめて削除 | 設定の「データ」の「追加機能」と「すべてのデータ」。「オフライン用キャッシュ」の削除では消さない |
| 容量 | 導入できたら「データを削除されにくくする」を申請する（断られても使える） |

- Service Worker は保存先から返すだけで、自分では保存しない。workbox の CacheFirst は取得したものを勝手に保存するため、中断したファイルや更新確認で取ったマニフェストが残る
- 取得するときは URL にクエリを付ける（`?v=` / `?t=`）。付けないと、導入済みの古い版が Service Worker から返る
- 保存先から照合するときは `ignoreVary` を付ける。サーバーによって `Vary`（`Origin` / `Accept-Encoding`）が付き、条件次第で見つからないと判定されるため


## ボーカル抽出の追加機能
| 追加機能 | 中身 | 大きさ |
| --- | --- | --- |
| `vocal-extractor` | 実行環境。WeVocalExtractor（STFT の wasm を含む）と ONNX Runtime Web（WASM・WebGPU 対応の版） | 27MB（gzip で約 7MB） |
| `spleeter-fp16` | 軽量モデル。CPU のみ | 38MB |
| `spleeter-int8` | 標準モデル（既定）。CPU でも fp16 より速く、GPU も使える | 50MB |
| `spleeter-fp32` | 高精度モデル | 75MB |

- モデルは `vocal-extractor` に依存する。設定の一覧には出さず、モデルと一緒に導入・削除する
- `onnxruntime-web` は実行環境の中に含め、アプリ本体には入れない

### ビルド
| 場所 | 内容 |
| --- | --- |
| [scripts/build-addons.mjs](../scripts/build-addons.mjs) | 実行環境のビルド、モデルの取得（`.cache/addon-models/`、sherpa-onnx の配布物）、マニフェストの生成。バージョンは内容のハッシュ。再配布に要るライセンスの全文（`extractor/licenses/`）も各フォルダに入れる（[LICENSE-THIRD-PARTY.md](../LICENSE-THIRD-PARTY.md)） |
| [vite.addons.config.ts](../vite.addons.config.ts) | `extractor/` を `addons/vocal-extractor/` にビルドする。ライブラリモードは wasm を JS に埋め込む（76MB になった）ので使わない |

| コマンド | 出力先 |
| --- | --- |
| `npm run build:addons` | `dist/addons/`（`npm run build` の後。CI はこちら） |
| `npm run build:addons:dev` | `public/addons/`（git には入れない）。`npm run dev` でも試せ、`npm run build` でも `dist/` にコピーされる |

### 配信: GitHub Pages
モデルもアプリと同じ GitHub Pages から配る。リポジトリには入れず、デプロイ時に取得して `dist/addons/` に加える（リポジトリを大きくしないため。CI では actions/cache で使い回す）。

40MB のダミーファイルで確かめた結果 (2026-10-01、PC):

| 項目 | 結果 |
| --- | --- |
| 取得 | 約 13 MB/s（40MB で約3秒）。ハッシュ一致 |
| 圧縮 | gzip で配信される。重みのような縮まないデータでは効かない |
| `Content-Length` | 圧縮後の大きさ。進捗はマニフェストの大きさで出す（[決定事項](DECISIONS.md)） |
| `Cache-Control` | `max-age=14400`。更新はマニフェストのバージョンで判定するので影響しない |
| オフライン | Service Worker が制御しているページなら、保存先から返せた |

スマホの回線での速度・保存できる容量は未確認。

## WeVocalSynth への組み込み
| 項目 | 内容 |
| --- | --- |
| 入口 | 右クリックメニューと「編集」メニューの「ボーカルを抽出」「伴奏のみ残す」。ツールバーには、よく使うと分かるまで入れない |
| 対象 | 選択範囲があればその範囲、なければ全体（「ピッチの揺れを平らにする」と同じ） |
| 結果 | 対象の範囲を置き換え、操作履歴に積む（元に戻せる）。長さは変わらない |
| モード | ボーカルを取り出した直後は、処理モードを「ボーカル」にする。変更は普段どおりできる |
| 設定 | 設定の「ボーカル抽出」で、使うモデルと「GPU を使う」（既定 ON）を選ぶ。モデルの導入・削除もここ |
| 実行方法 | 「GPU を使う」が ON で、WebGPU が使え、モデルが対応していれば WebGPU、それ以外は WASM |
| メモリ | モデルは抽出のたびに読み込み、終わったら解放する（推論中は数百MB使うため、スマホでメモリを持ち続けない）。抽出の前に、処理していない加工と解析の Worker を止めて wasm のメモリを手放し（`releaseIdleDsp`）、再生していないプレーヤーの AudioBuffer（音声の複製）と AudioContext も手放す（`releasePlayers`。プレーヤーは通常の再生と試聴などで 4 つある）。止めた Worker のメモリはすぐには返らないので、300ms 待ってから始める。それでもメモリ不足（RangeError: out of memory、no available backend found）になったら、再読み込みや軽量モデルを勧める文言にする。wasm のメモリは縮まないので、長い音声を解析した後の Worker が残っていると、iOS（タブのメモリの上限が低い）で RangeError: out of memory になった。単体の WeVocalExtractor にはこの Worker がないので起きなかった |
| 高い帯域 | 約 11kHz より上は標準では消す。設定の「高音域を残す」で、1024 ビン目のマスクで延ばして残す（`highBand: 'edge'`） |
| 中断 | ステータスバーの × で止める。抽出の Worker ごと止め、途中までの結果は使わない（ほかの処理も同じ。`useTask`） |

アプリ側の処理は [useVocalExtract.ts](../src/hooks/useVocalExtract.ts)（導入の確認 → 実行環境とモデルを読み込む → 範囲ごとに抽出して差し戻す）。
