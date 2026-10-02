# ひとしずくの旅 — The Journey of a Single Drop of Light

約3分の連続アニメーション（HTML + Canvas、外部アセットなし、BGMも生成）。
一滴の光が、深海 → 水面 → 空 → 雨 → 大地 → 木と四季 → 星 → 海へ還る、という一つながりの旅をたどります。

- 見る: `index.html` をブラウザで開く（または `dist/hitoshizuku.html` の単一ファイル版）
- 操作: スペース=再生/停止、← →=5秒移動、M=ミュート、F=全画面
- 仕組みと設計: [`docs/DESIGN.md`](docs/DESIGN.md)
- 開発ツール: `tools/shot.mjs`（フレーム確認）、`tools/check.mjs`（決定性）、`tools/perf.mjs`（負荷）、`tools/build.mjs`（単一HTML生成）
