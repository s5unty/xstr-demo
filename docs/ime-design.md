# IME 设计（MVP）

## 数据结构
- `LexiconMap = Map<code, CandidateItem[]>`
- `raw: string` 当前码表缓冲
- `page: number` 当前页
- `pageSize: number` 候选页大小（默认 4）

## 查询策略
- 精确匹配：`raw -> lexicon[raw]`
- 候选排序：按 `weight` 降序
- 分页：`slice(page * pageSize, ...)`
- 词典来源：运行时直接解析 `xstr/cqkm_42.dict.yaml` 与 `xstr/cqkm_42.phrase.dict.yaml`
- 连续码流组合：当 `raw` 无直接词条时，基于码表 Trie 做分段组合（Beam Search），可将连续短码合成词语串

## 上屏规则
- `1~4` 直选当前页候选
- `Space` 或 `Enter` 默认上屏当前页第 1 候选
- 上屏后清空 `raw` 并回到第 0 页

## 边界
- `raw` 支持字符：`a-z`、`;`
- 标点输入：读取 `xstr/symbols.yaml` 的 `punctuator.half_shape`，将半角按键映射为中文标点并直接上屏。
  - 示例：`,` -> `，`，`.` -> `。`，`<` -> `；`，`>` -> `！`，`?` -> `？`
- 连续输入支持 `A-Z` 作为补码；例如末段输入 `hrG` 可优先命中「和」
- `raw` 为空时 Backspace 不在 IME 内消费，交给游戏逻辑处理已上屏回退
- 非法按键不消费，透传
- TODO: 模糊音/联想/学习排序未实现（MVP 外）
