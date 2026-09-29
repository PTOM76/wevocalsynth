# WeVocalSynth
WeVocalSynthは、Webブラウザ上で音声素材のピッチおよび時間を編集するための音声加工ツールである。

インストール不要で、ブラウザだけでボーカルや音声素材の編集ができる。<br />
音声ファイルはサーバーへ送らず、処理はすべてブラウザ内で行う。

## できること
| 分類 | 機能 |
| --- | --- |
| 加工 | ピッチ変更（0.01半音単位）、時間伸縮、フォルマント保持、移動、ボーカル／楽器モード |
| ピッチ | 範囲の今の音程の表示と「音程を合わせる」、ピッチ曲線の表示とペンでの描き直し、半音上下、平らにする、音程に揃える、ビブラート |
| 編集 | 範囲選択（複数可）、切り取り、コピー、貼り付け、音量編集、元に戻す、やり直す、操作履歴 |
| テンポ | テンポ（BPM）の自動解析、拍の線と拍への吸着 |
| 確認 | 加工済みの試聴、スライダー操作をすぐ反映するループ試聴、原音との比較、スペクトログラム |
| 保存 | WAV / MP3 / Opus の書き出し、プロジェクトの保存（.wvsp）、作業の自動保存と復元 |
| その他 | PC/スマホ対応、オフラインで使える（PWA）、日本語/英語 |

## 技術スタック
| 項目 | 内容 |
| --- | --- |
| 画面 | React + TypeScript + MUI（Vite） |
| 音声処理 | Rust → WebAssembly（Web Worker で実行） |
| 再生 | Web Audio API、AudioWorklet |

## セットアップ
```bash
git clone git@github.com:PTOM76/wevocalsynth.git
cd wevocalsynth
npm install
npm run dev
```

音声処理（`dsp/`）を変えるときだけ Rust が要る。ビルド済みの `.wasm` をリポジトリに含めているので、画面だけなら Node.js だけで動く。

[Todofile](https://github.com/Pitan76/Todofile)を導入している場合は、クローン後、`todo setup` と `todo dev` で同様のセットアップが可能。

詳しくは [セットアップ](docs/SETUP.md)

## コードの場所
- 画面: `src/`
  - 組み立ては `src/App.tsx`、状態と操作は `src/hooks/useEditor.ts`
  - 言語ファイル: `src/i18n/`
- 音声処理（Rust）: `dsp/src/`
  - テスト: `dsp/src/tests/`

## ドキュメント
| ドキュメント名 | リンク先 |
| --- | --- |
| 使い方（利用者向け） | [docs/MANUAL.md](docs/MANUAL.md) |
| 開発環境構築 | [docs/SETUP.md](docs/SETUP.md) |
| 要件定義 | [docs/REQUIREMENT.md](docs/REQUIREMENT.md) |
| 決定事項 | [docs/DECISIONS.md](docs/DECISIONS.md) |
| コーディング規約 | [docs/CODING.md](docs/CODING.md) |
| アーキテクチャ設計 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| ドキュメントの書き方 | [docs/WRITING.md](docs/WRITING.md) |

## License
This project is licensed under the MIT License.

Third-party software:
- @breezystack/lamejs — LGPL-3.0
