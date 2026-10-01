# WeVocalSynth
WeVocalSynthは、Webブラウザ上で音声素材のピッチおよび時間を編集するための音声加工ツールである。

- https://wevocalsynth.pitan76.net/

<img width="600" alt="image" src="https://github.com/user-attachments/assets/397d3a1e-edca-466e-87da-d06de4418ccc" />
<img width="200" alt="image" src="https://github.com/user-attachments/assets/4314c95d-22d2-4b0c-b854-07e8ebb0998b" />


インストール不要で、ブラウザだけでボーカルや音声素材の編集ができる。<br />
音声ファイルはサーバーへ送らず、処理はすべてブラウザ内で行う。

## できること
| 分類 | 機能 |
| --- | --- |
| 加工 | ピッチ変更（0.01半音単位）、時間伸縮、フォルマント保持、移動、ボーカル/楽器モード |
| ピッチ | 範囲の今の音程の表示と「音程を合わせる」、ピッチ曲線の表示とペンでの描き直し、半音上下、平らにする、音程に揃える、ビブラート、MIDI の音程を当てはめる |
| 編集 | 範囲選択（複数可）、切り取り、コピー、貼り付け（ピッチの曲線にも）、音量編集、音量とフォルマントの曲線を描く、元に戻す、やり直す、操作履歴 |
| トラック | 複数トラック（複製/追加/分割/統合）、トラックごとの音量/パン（非破壊）、ミュート/ソロ、ほかのトラックを重ねて表示、レベルメーター |
| ボーカル抽出 | ボーカル・伴奏の抽出と2トラックへの分割（追加機能。ブラウザ内で処理） |
| 音声の作成 | 声、楽器の音色で、単音または MIDI のメロディから音声を作成して新しいトラックに追加（フォルマント/音量を指定、作成前に試聴） |
| テンポ | テンポ（BPM）の自動解析、拍の線と拍への吸着 |
| 確認 | 加工済みの試聴、スライダー操作をすぐ反映するループ試聴、原音との比較、帯パネルごとの表示（波形/スペクトログラム/ピッチ/音量/フォルマント） |
| 保存 | WAV / MP3 / Opus の書き出し（トラックを混ぜて書き出し）、プロジェクトの保存（.wvsp）、作業の自動保存と復元 |
| その他 | PC/スマホ対応、オフライン利用（PWA）、日本語/英語 |

## 技術スタック
| 項目 | 内容 |
| --- | --- |
| 画面 | React + TypeScript + MUI（[PevenMUI](https://github.com/PTOM76/pevenmui)、Vite） |
| 音声処理 | Rust → WebAssembly（Web Worker で実行） |
| 再生 | Web Audio API、AudioWorklet |

## セットアップ
```bash
git clone --recursive git@github.com:PTOM76/wevocalsynth.git
cd wevocalsynth
npm install
npm run dev
```

`extractor/`（ボーカル抽出）、`wevocal-lib/`（共有の信号処理）、`pevenmui/`（UI 部品）は submodule。`--recursive` を付け忘れたら `git submodule update --init` で取得する。
`--recursive` だと `extractor/pevenmui/` も取得されるが、直すのはルートの `pevenmui/` の方。紛らわしければ `extractor/` で `todo setup:nested` を実行して隠す。

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
| ファイル構成 | [docs/STRUCTURE.md](docs/STRUCTURE.md) |
| 機能の仕組み | [docs/INTERNALS.md](docs/INTERNALS.md) |
| アルゴリズム | [docs/ALGORITHM.md](docs/ALGORITHM.md) |
| ボーカル抽出 | [docs/EXTRACTOR.md](docs/EXTRACTOR.md) |
| ドキュメントの書き方 | [docs/WRITING.md](docs/WRITING.md) |

## License
This project is licensed under the MIT License.

Third-party software:
- @breezystack/lamejs — LGPL-3.0
