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
| `vocal-extractor` | WeVocalExtractor と ONNX Runtime Web | MIT / MIT（Microsoft） |
| `spleeter-fp16` / `-int8` / `-fp32` | Spleeter 2stems の学習済みモデル（sherpa-onnx の ONNX 版） | 下記 |

モデルのライセンスの扱い（学習済みモデルに個別の記載がないこと、など）は、WeVocalExtractor の [LICENSE-THIRD-PARTY.md](https://github.com/PTOM76/wevocalextractor/blob/main/LICENSE-THIRD-PARTY.md) にまとめている（手元では `extractor/LICENSE-THIRD-PARTY.md`）。
ライセンスの全文は `extractor/licenses/` にあり、追加機能を作るときにそれぞれのフォルダ（`addons/<id>/licenses/`）にも入れて一緒に配っている。
