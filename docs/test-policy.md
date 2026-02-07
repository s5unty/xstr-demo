# 回归测试制度

## 规则
1. 每次修复用户反馈问题，必须新增至少 1 条对应测试用例。  
2. 修复完成后，必须执行一次全量回归：`pnpm test`。  
3. 若本次改动涉及 UI 视觉/动效，除自动化外必须补充手工回归记录。  
4. 若全量回归失败，不允许标记“已修复”。
5. 每次提交修复结果时，必须在说明中包含：
   - 本次新增测试用例 ID/名称
   - 全量回归结果（`pnpm test` 的通过/失败结论）

## 执行命令
- 构建测试产物：`pnpm run test:build`
- 执行全量回归：`pnpm run test:run`
- 一键执行：`pnpm test`

## 用例维护
- 自动化回归清单：`tests/session-regression.test.cjs`
- 用例台账：`docs/test-cases.md`
- 本制度文档：`docs/test-policy.md`
