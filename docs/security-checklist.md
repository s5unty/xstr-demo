# 安全检查清单

- [x] 不依赖系统 IME，不触发浏览器 composition 流程
- [x] 不向外网发送用户输入内容
- [x] 依赖最小化（仅 three + vite + typescript）
- [x] 构建脚本仅本地文件读写
- [ ] TODO: 引入 `npm audit` 流程并在 CI 固化
