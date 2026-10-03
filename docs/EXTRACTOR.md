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
| メモリ | モデルは抽出のたびに読み込み、終わったら解放する（推論中は数百MB使うため、スマホでメモリを持ち続けない）。抽出の前に、処理していない加工と解析の Worker を止めて wasm のメモリを手放し（`releaseIdleDsp`）、再生していないプレーヤーの AudioBuffer（音声の複製）も手放す（`releasePlayers`。AudioContext は閉じない。プレーヤーは通常の再生と試聴などで 4 つある）。推論の Worker は止めずに使い続ける（下の「iOS Safari でのメモリ不足」）。待ち時間や作り直しは入れない。それでもメモリ不足（RangeError: out of memory、no available backend found）になったら、再読み込みしてから抽出するかを確かめる（下の「メモリが足りないとき」） |
| 高い帯域 | 約 11kHz より上は標準では消す。設定の「高音域を残す」で、1024 ビン目のマスクで延ばして残す（`highBand: 'edge'`） |
| 中断 | ステータスバーの × で止める。抽出の Worker は止めずに次のブロックで止め（上の「iOS Safari でのメモリ不足」）、途中までの結果は使わない（ほかの処理も同じ。`useTask`） |

### iOS Safari でのメモリ不足
iPad の PWA で、抽出が `no available backend found. ERR: [wasm] RangeError: Out of memory` になった（1 回だけ成功することもあった）。設定の「開発者向け」→「ボーカル抽出の診断」（`src/debug/diagnoseExtract.ts`、中身は `extractor/src/diagnose.ts`。単体の WeVocalExtractor にも同じものがある）で、iPad（Safari 26.6、PWA）を調べて分かったこと (2026-10-03):

| 調べたこと | 結果 |
| --- | --- |
| crossOriginIsolated / SharedArrayBuffer | どちらのアプリも false / なし（GitHub Pages は COOP/COEP を付けられない） |
| wasm のメモリを 1 つ作る（共有 / 共有でない、上限 256MB〜4GB） | どれも作れる。メモリの量そのものは足りている |
| 上限 4GB の**共有**メモリを同時に持てる数 | **2 個まで**。共有でないものは 64 個以上持てる |
| 共有メモリを増やす | 1GB 以上まで増やせる |
| 256MB を持つ Worker を作って止める、を続ける | 8 回続けても作れる（普通の共有メモリは止めればすぐ返る） |
| 28MB の ONNX Runtime の wasm のコンパイル | 0.1 秒で通る（機械語の置き場は原因ではない） |
| 実行環境を作る → 手放す（Worker を止める）、を続ける | 1 回目だけ通り、2 回目からは 0.0〜0.2 秒で失敗する。3 秒待っても失敗することが多い。モデル（fp16 / int8 / fp32）や計算の種類（wasm / webgpu）によらない。単体の WeVocalExtractor でも同じ |

**原因**: ONNX Runtime（`ort-wasm-simd-threaded`）は、スレッドを 1 にしても上限 4GB の共有メモリを作る。iOS はこれを同時に 2 個までしか持てず、Worker を止めてもその枠はすぐには返らない（いつ返るか決まっていない）。そのため実行環境を作り直すと枠が尽きる。単体の WeVocalExtractor が成功していたのは、再読み込み直後の 1 回目だったから。メモリの量や、画面の使うメモリが原因ではなかった。

**調べて分かったこと**: WebKit は、共有メモリの上限（`maximum`）の分を、作った時点でプロセス全体の予約の枠から差し引く。枠は iOS で約 6GB で、実際に使うメモリではなく帳簿上の枠なので、使っている量が小さくても尽きる。Worker を止めれば返るとされるが、ONNX Runtime の Worker では返るまでに時間がかかった（[Automattic/kandelo#1410](https://github.com/Automattic/kandelo/pull/1410)）。ONNX Runtime は一度 wasm の準備に失敗すると、同じ Worker では二度と準備できない（`previous call to initWasm() failed`）。

**対策 1**: ONNX Runtime が作るメモリの上限を 4GB から 1GB に下げる（ビルド時に書き換える。`extractor/ortMemory.ts`）。wasm は上限 4GB のメモリを読み込む宣言なので、小さい上限のメモリを渡しても動く。推論で使うのは数百MB。

**対策 2**: 推論の Worker はページで 1 つだけ作り、止めずに使い続ける（`extractor/src/index.ts` の `sharedWorker`）。手放すとき（`dispose`）はセッションだけを手放し、次に作るときは同じ Worker にモデルを入れ直す。中断は Worker を止めずに、次のブロックで止めるよう頼む（`cancel`）。Worker が落ちたときと、実行環境の準備に失敗したとき（同じ Worker では二度と準備できないため）だけ作り直す。

そのほかに行っていること:

| 分かったこと | 対策 |
| --- | --- |
| ONNX Runtime はメモリを先回りして確保する（メモリのアリーナ、メモリのパターン） | `enableCpuMemArena: false`、`enableMemPattern: false` にする（`extractor/src/worker.ts`） |
| WebKit では、AudioContext を閉じると再生のスレッドが残る不具合がある | 抽出の前に手放すのは再生用の音声の複製（AudioBuffer）だけにし、AudioContext は閉じない |
参考: [Crash-Proof Browser AI Inference on iPhone SE2](https://zenn.dev/kaz_sakai/articles/ios-safari-onnx-memory?locale=en)（ONNX Runtime Web と iOS Safari のメモリ）、[Automattic/kandelo#1410](https://github.com/Automattic/kandelo/pull/1410)（WebKit の wasm のメモリの予約と AudioContext の不具合）

### メモリが足りないとき（再読み込みして抽出）
抽出の本体は [vocalExtract.ts](../src/audio/vocalExtract.ts)（React に依存しない）。メモリ不足（RangeError: out of memory、no available backend found）で失敗したら、確認のうえ次のように行う（[cleanExtract.ts](../src/project/cleanExtract.ts)）。原因が分かる前に作ったもの。原因は共有メモリの枠だった（上の節）ので、Worker を使い続けるようにしてからは、これに頼ることは少ない見込み

1. 作業（自動保存と同じ中身）、対象の音声、抽出の内容を IndexedDB に置いて再読み込みする（自動保存が OFF でも、このときだけ置く）
2. 起動時（`main.tsx`）、作業を開く前に進み具合だけの画面（`CleanExtractScreen`）で抽出し、結果を IndexedDB に置いて再読み込みする
3. 起動時（`useEditor`）、結果を反映した作業を開く。自動保存の復元はしない。元に戻す履歴は、通常の再読み込みと同じく残らない

アプリ側の処理は [useVocalExtract.ts](../src/hooks/useVocalExtract.ts)（導入の確認 → 実行環境とモデルを読み込む → 範囲ごとに抽出して差し戻す）。
