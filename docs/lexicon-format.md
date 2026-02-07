# 词库格式

## 运行时词典来源（直接读取）
- `xstr/cqkm_42.dict.yaml`（单字，列：`text<TAB>code<TAB>weight<TAB>stem`）
- `xstr/cqkm_42.phrase.dict.yaml`（词组，列：`text<TAB>code`）
- `xstr/cqkm_42.single.dict.yaml`（单字短码，用于提取字符优选短码）
- `xstr/Dvel-main.dict.yaml`（词频词库，用于生成连续词码）

## 解析规则
- 仅接收码表字符集合：`[a-z;]+`
- `code` 统一转小写
- 权重优先使用第 3 列；缺失时默认 `1`
- 相同 `code + text` 取最大权重
- 候选按 `weight` 降序排序
- 从 `single.dict` 提取形如 `nhE -> nh` 的短码，拼接生成词语连续码（如 `你好 -> nhhb`）

## 数据结构
- `LexiconMap = Map<string, CandidateItem[]>`
- `CandidateItem = { text: string; code: string; weight: number }`
