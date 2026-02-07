# 架构说明

## 模块分层
1. 渲染层 `src/render/*`：Three.js 场景、反馈动画。
2. 游戏逻辑层 `src/game/*`：状态机、对齐、计分。
3. 输入法引擎层 `src/ime/*`：码表缓冲、词典查询、候选选择。
4. 输入 UI 层 `src/ui/input/*`：DOM Overlay 文本、候选、指标。
5. 内容层 `src/content/*`：练习文本与难度内容。

## 关键数据流
`KeyboardEvent -> QuickCodeIme(raw/candidates) -> committedText -> GameEngine(compare/metrics) -> ThreeScene(feedback) + InputOverlay(render)`

## 最小接口
- `QuickCodeIme.handleKey(event): { committedText, consumed }`
- `QuickCodeIme.getSnapshot(): { raw, candidates, page }`
- `GameEngine.applyCommit(text): { compare, renderEvent }`
- `GameEngine.getSnapshot(): { state, confirmedText, metrics }`
- `ThreeScene.onFeedback(event)`
- `InputOverlay.renderIme/renderGame(snapshot)`
