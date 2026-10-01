# ボーカル抽出の実験
Spleeter 2stems（sherpa-onnx が ONNX に変換したもの）を、ブラウザの ONNX Runtime Web で動かす実験。アプリ本体とは依存を分けている。設計は [docs/EXTRACTOR.md](../../docs/EXTRACTOR.md)。

## 準備
```sh
cd experiments/vocal-extractor
npm install
# モデル（git には入れない）
mkdir -p models && cd models
for v in fp16 int8; do
  curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/sherpa-onnx-spleeter-2stems-$v.tar.bz2 | tar xj
done
```

## 使い方
| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 確認ページ（同じネットワークのスマホからも開ける） |
| `COI=1 npm run dev` | COOP/COEP ヘッダー付き。WASM のマルチスレッドを試す |
| `node inspect.mjs <onnx>` | モデルの入出力の形と、1回の推論時間（Node / CPU） |

## ファイル
| ファイル | 内容 |
| --- | --- |
| `stft.js` | STFT / 逆STFT（n_fft 4096、hop 1024、Hann 窓、center なし） |
| `main.js` | 512 フレームずつ STFT → 推論 → マスク → 逆STFT。処理時間の内訳を出す |
