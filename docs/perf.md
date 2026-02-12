# 性能基线与优化

- 开发态指标：右上角 `FPS` 实时显示。
- 当前基线（预期）：普通桌面 Chromium 稳定 55~60 FPS。
- 输入延迟：MVP 由键盘事件直接驱动，路径短。
- 词库优化（已落地）：
  - 构建期将 `xstr/*.dict.yaml` 编译为 `public/lexicon/*.json(.gz)`，避免首屏解析 YAML。
  - 首次仅加载 `starter` 启动包；输入后按首码懒加载分片（`a~z`）。
  - 分片通过 `IndexedDB` 做版本化缓存（`manifest.version` 失配自动失效）。
- 后续优化建议：
  - 分片从“首码”升级为“首两码”自适应策略（减少单分片峰值）
  - 候选缓存 LRU
  - Three.js 材质池进一步复用
