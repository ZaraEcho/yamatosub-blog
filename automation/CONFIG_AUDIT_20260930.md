# 博客配置状态（2026-10-15）

仓库：ZaraEcho/yamatosub-blog。此路径保留作配置白名单兼容。

- 规则、选题与16篇历史查重索引保留，不上传历史正文、不重投。
- 验证器与原导入工作流已恢复；管理员确认最低正文字符数1200，连接测试核对Variables为1200/true并返回HTTP 200、ok=true、status=draft。
- 测试运行：https://github.com/ZaraEcho/yamatosub-blog/actions/runs/38706194704 。测试slug为import-connection-test-20261015，不是正式日常稿。
- 用户明确决定不设分支保护。任务不在检查等待时启用GitHub自动合并；最新head的blog-validation与其他适用检查全部成功后，复核范围、当天唯一性、最新main/head、无冲突与现存审核要求，正常expected-head合并。失败或无法确认保留PR，不直接推main。
- GitHub没有服务器端强制检查保护；此约束由任务主动执行，不冒充保护已开启。没有修改工作流、安全设置或凭据。
- 原任务每天北京时间08:00（UTC+8，Asia/Shanghai），沿用唯一任务，不创建替代。网站保持草稿模式。

- 2026-10-16 用户修正：历史正文缺失时使用索引与选题记录保守查重和计数，避开相近题继续执行，不再因这类缺口暂停原任务。当天唯一性、候选事实核验和最新提交检查保持严格。
