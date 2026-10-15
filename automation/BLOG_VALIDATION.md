# blog-validation 合并前检查

本配置不更改 yamatosub-blog-import.yml，不调用导入接口，不使用导入令牌，不合并 PR。文章合并后继续沿用现有 main push → GitHub Actions → 网站草稿链路。

## 检查范围与信任边界

- 检查名固定为 `blog-validation`。所有面向 main 的 PR 都产生结果，不用文章 paths 过滤绕过范围检查。新增工作流同时在配置合并后运行 push 自测，并支持 workflow_dispatch。
- 日常稿只允许一个新增 `automation/blog-inbox/YYYY-MM-DD-slug.json` 和 `automation/seo-topics.json`；拒绝旧稿修改、删除、重命名、可执行文件及混入其他代码。
- 配置 PR 走明确文件白名单，不含现有发布工作流；运行候选验证脚本测试，仍需人工审核，结果返回 `articleAutoMergeEligible:false`。检查通过不授权自动合并配置。
- 安装后，文章 PR 的验证器与算法从 PR base commit 加载，文章分支只作为 git blob 数据读取，不执行文章 PR 中的脚本。首次配置 PR 没有 base 验证器，使用配置分支自测作为 bootstrap，需要人工审查。
- GitHub token 仅 contents/pull-requests read，测试子进程不继承 READ_TOKEN。无网站凭据，无写权限。不使用 pull_request_target；不存在文章提交后自动运行投稿脚本的流程。
- 启用 main 必需检查前，先合并本 PR 并确认 main push 自测成功；保护规则要求当前 head 检查、分支更新到最新 base，保留审核要求。不要将 import-draft 设为合并前检查。

## 投稿约定与导入源码

九个编辑约定字段：title、slug、excerpt、content、category、tags、seoTitle、seoDescription、source。coverImage 可选；不要求历史或新稿必须带 coverImage。服务端真正非空约束与编辑约定区分，见 automation/BLOG_IMPORT_RULES_V3.2.5.md。

服务端 trim/slice 后截断字符串，投稿检查主动拒绝超长，避免静默丢字。字段上限：title/seoTitle 180、slug 160、excerpt 500、content HTML 120000、category 80、seoDescription 320、source 120、可选 coverImage 800、tags 最多 20 个且每项 40。source 必须是 codex-scheduled-task。JSON 重复键、未知字段和自行写入 status 均拒绝。

scripts/import-rich-text.mjs 直接移植 3.2.5 lib/rich-text.ts，仅移除 TypeScript 类型标注；原文件 SHA-256 为 720a78ec6bf31aaad06b0a370211838ed4f3c337fa3c2bd89d19adb05e609c1f。安装包来源是用户的 yamatosub_3.2.5_full.zip；已同时核对 app/api/internal/blog-import/route.ts 与 lib/repositories/blog-automation.ts。若线上部署改过，必须先同步源码依据。

最低长度算法为：content trim/slice → sanitizeRichHtml → richTextToPlainText → plain.length。沿用 JavaScript UTF-16 单位，不是汉字数、HTML 长度或字节数。实体解码顺序、块级换行和空白合并复用原函数；测试涵盖 emoji、实体及边界。

源码默认 minimumCharacters=1200，运行时可设置 300–20000。迁移前已确认并在成功CI使用的值为1200；迁移时须再次核对后台现行值并设置新仓库Variables。本地默认值不证明新仓库配置已确认。

管理员先在网站“博客与 SEO 内容 → AI 自动内容入口”读取最低正文字符数，无需更改设置或提供令牌。然后在仓库 Settings → Secrets and variables → Actions → Variables 设置：

- BLOG_MINIMUM_CHARACTERS：已核实的整数（300–20000）。
- BLOG_MINIMUM_CONFIRMED：true，仅在上述值已确认且与当前部署一致后设置。

变量未设置或未确认时，文章 PR 检查失败并显示 ONLINE MINIMUM UNCONFIRMED，不能开启文章自动合并。配置 PR 的自测不受该阻塞影响。文章 PR 中给出本次后台值核验依据和日期，值变化时同步变量；本工具不能自动读取生产数据库。

HTML 检查比服务端清洗更严格：只允许源码白名单标签与输入属性，要求属性双引号、结构闭合；拒绝注释、事件/style/srcdoc、未知标签属性、重复属性及危险链接。拒绝协议相对 URL、反斜线、控制字符、URL 凭据和编码混淆；图片只允许站内路径或 https://www.yamatosub.com 来源。mailto 仅用于链接。服务端自动生成 rel/loading，稿件不用自行填写。若需其他图片来源，先独立配置审核。

## 重复、选题与日期

- 按 main 的现有稿件和其他未关闭 PR 的稿件核对重复 title（忽略大小写）/slug；API 分页读取，不完整或读取失败不当作没有重复。
- 同一天已有文章文件（main 或其他开放 PR）则拒绝；文件日期必须与 PR 创建时北京时间日期一致。历史关闭 PR、官网已发布文章和搜索意图重复由云端编辑规则另行核对，机器检查不声称涵盖生产数据库未公开稿件。
- 选题表仅一个 pending → used；usedAt 匹配文件日期，并新增 articleSlug 与本稿 slug 对应，可选 articleTitle。保留原主题次序、所有历史/未知字段；已用条目不可改。补题只能追加 pending 条目，不静默覆盖历史。
- 云端任务据此给本次使用主题写入 articleSlug；原有历史 used 条目无需补填。
- 标签/URL 格式校验不等同外部链接当前可访问。外部事实、官网重复、平台操作、链接可达性由编辑任务研究并在 PR 留证，不发送凭据到第三方站点。

## 配置启用顺序

1. 确认当前main包含完整规划、导入依据、验证器和工作流；旧配置PR编号不是本仓库启用门槛。
2. 检查本 PR 的 `blog-validation` 和合并到 main 后的 push 自测，记录实际结果；bootstrap 结果不冒充稿件端到端通过。
3. 确认后台 minimumCharacters，并设置以上两个非敏感仓库变量。
4. 管理员在 Settings → General → Pull Requests 勾选 Allow auto-merge；Settings → Branches → Add branch protection rule，匹配 main，启用 Require a pull request before merging、Require status checks to pass before merging，选择 blog-validation，启用 Require branches to be up to date before merging。保留已有审核数和其他限制，不添加绕过，不允许强推/删除；若已有规则则编辑原规则，不另造更弱规则。
5. 对未来本任务创建的文章 PR，编辑自检通过并创建 PR 后，先核对范围、同日唯一稿、无冲突、最新 head SHA、main 必需检查及现有审核要求。必需检查已触发且仍在等待时请求 GitHub 自动合并；若检查先于请求完成且 PR 已可合并，或自动合并请求因此被拒绝，重新核对上述条件及全部必需检查已成功后，通过正常 PR 合并操作并指定预期 head SHA；不能直接推 main、绕过保护或合并配置 PR。检查失败、状态无法核实或审核未满足时保留 PR，必要时取消尚存的自动合并请求，修复并重新检查后重试。合并后观察对应 SHA 的导入响应与网站草稿状态。

当前 GitHub 连接没有仓库设置/分支保护写工具，读完整保护细节也曾返回 403。上述第 4 步需要管理员手动完成；不能据此报告已开启。网站仍保持 draft，不更改 runtime.defaultStatus。

## 本地检查

```bash
node --test scripts/blog-validation.test.mjs
```

可用 scripts/blog-validation.mjs 的 CLI 读取完整 base/head SHA，必须提供已分页核对的 PR inventory；它不执行候选分支程序。检查通过只证明机器规则满足，不能替代来源研究、人工配置审核或生产导入响应。

## 精简迁移后的历史查重（2026-10-15）

历史正文未上传；验证器从 PR 的可信 base SHA 读取 `automation/article-history.json`，检查旧标题、slug 和同日稿件，并检查选题池已有 usedAt，不能用删去正文绕过去重。索引缺失或格式损坏时文章检查失败；日常文章 PR 不得修改索引。索引中的投递、公开状态未经重新核验，不作为成功凭据。搜索意图查重和最近六篇实际正文重心仍由编辑核对，自动检查不宣称覆盖这两项。

本配置 PR 只恢复验证：不会导入、公开或合并文章。配置 PR 上的检查成功与合并后 main 自测成功分开确认；运行时最低值未经管理员确认时，配置自测可运行，但文章检查必须失败。导入工作流、Secrets、Variables、分支保护和自动合并仍未恢复，原任务继续暂停。
