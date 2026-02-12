# 词库格式

## 原始词典来源（构建输入）
- `xstr/cqkm_42.dict.yaml`（单字，列：`text<TAB>code<TAB>weight<TAB>stem`）
- `xstr/cqkm_42.phrase.dict.yaml`（词组，列：`text<TAB>code`）
- `xstr/cqkm_42.single.dict.yaml`（单字短码，用于提取字符优选短码）
- `xstr/Dvel-main.dict.yaml`（词频词库，用于生成连续词码）

## 构建产物（压缩分片传输）
- 产物目录：`public/lexicon/`
- 清单文件：`public/lexicon/manifest.json`
- 启动包：`public/lexicon/starter.json(.gz)`（首屏必加载）
- 分片包：`public/lexicon/shards/*.json(.gz)`（按首码懒加载）
- 构建命令：`pnpm run build:lexicon`

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

## 分片 JSON 结构（运行时）
- `codeCount`: 码表数量
- `entryCount`: 候选数量
- `codes`: `{ [code]: [[text, weight], [text, weight, syntheticShortFlag]] }`
