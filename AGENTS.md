# AGENTS.md

AI のエージェント向けの決まり。人向けの決まりは [docs/CODING.md](docs/CODING.md)。

## 訳文

- `src/i18n/*.json`（5 言語で約 220 KB）は直接開かない。`node scripts/i18n.mjs` で扱う
  - 探す: `list settings.`、`get menu.minimap`
  - 足す: `add <key> ja=… en=… ko=… zh_cn=… zh_tw=…`（同じ分類の最後に入る）
  - 変える、消す、名前を変える: `set`、`rm`、`mv`（`mv` はソースの参照も書き換える）
  - 終わったら `check`
- Analyzer、Converter、Extractor は `--dir analyzer/app/lang` のように指定する
