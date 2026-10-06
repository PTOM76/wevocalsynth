# Third-party notices
WeVocalSynth は MIT ライセンスで公開している。以下の部品は別のライセンスに従う。

## lamejs（@breezystack/lamejs）
- 用途: MP3 の書き出し
- ライセンス: LGPL-3.0（全文は `node_modules/@breezystack/lamejs/LICENSE`、配布元 https://github.com/nicktindall/lamejs の派生）
- 組み込み方: ビルド時に単独のファイル（`assets/lamejs-*.js`）に分け、MP3 を書き出すときだけ動的に読み込む。このファイルを差し替えれば、改変したエンコーダを使える

MP3 以外（WAV / Opus）の書き出しと、アプリのほかの部分は lamejs に依存しない。

## 追加機能（ボーカル抽出）
導入した人だけが取得する追加機能（`addons/`）に、次のものを含めて配っている。アプリ本体には含まない。

| 追加機能 | 含むもの | ライセンス |
| --- | --- | --- |
| `vocal-extractor` | WeVocalExtractor | MIT |
| `vocal-extractor-gpu` / `-cpu` | ONNX Runtime Web の wasm | MIT（Microsoft） |
| `spleeter-fp16` / `-int8` / `-fp32` | Spleeter 2stems の学習済みモデル（sherpa-onnx の ONNX 版） | 下記 |
| `uvr-mdx-voc-ft` / `uvr-mdx-inst-hq4` | UVR（Ultimate Vocal Remover）の MDX-Net の学習済みモデル（sherpa-onnx の ONNX 版） | MIT（Copyright (c) 2022 Anjok07, Aufr33）。UVR は、モデルを使うときに UVR とその開発者のクレジットを示すよう求めている |

モデルのライセンスの扱い（学習済みモデルに個別の記載がないこと、など）は、WeVocalExtractor の [LICENSE-THIRD-PARTY.md](https://github.com/PTOM76/wevocalextractor/blob/main/LICENSE-THIRD-PARTY.md) にまとめている（手元では `extractor/LICENSE-THIRD-PARTY.md`）。
ライセンスの全文は `extractor/licenses/` にあり、追加機能を作るときにそれぞれのフォルダ（`addons/<id>/licenses/`）にも入れて一緒に配っている。

## 追加機能（変換）
| 追加機能 | 含むもの | ライセンス |
| --- | --- | --- |
| `converter` | WeVocalConverter の動画の書き出し（`converter/src/video/`） | MIT |
| `converter` | Mediabunny（映像と音声を 1 つのファイルにまとめる。配布元 https://github.com/Vanilagy/mediabunny） | MPL-2.0。改変せずに使用しており、ファイル単位の条件のため、ほかの部分には及ばない |
