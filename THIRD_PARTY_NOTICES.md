# Third-party notices
WeVocalSynth は MIT ライセンスで公開している。以下の部品は別のライセンスに従う。

## lamejs（@breezystack/lamejs）
- 用途: MP3 の書き出し
- ライセンス: LGPL-3.0（全文は `node_modules/@breezystack/lamejs/LICENSE`、配布元 https://github.com/nicktindall/lamejs の派生）
- 組み込み方: ビルド時に単独のファイル（`assets/lamejs-*.js`）に分け、MP3 を書き出すときだけ動的に読み込む。このファイルを差し替えれば、改変したエンコーダを使える

MP3 以外（WAV / Opus）の書き出しと、アプリのほかの部分は lamejs に依存しない。
