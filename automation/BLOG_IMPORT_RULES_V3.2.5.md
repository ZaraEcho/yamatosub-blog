# 大和字幕 3.2.5 博客导入规则核对

供网页任务补充配置 PR 和实现文章检查。依据用户提供的本地 3.2.5 安装包源码核对，未读取生产数据库，未验证当前线上文件是否另有修改。本说明没有令牌或密码。

## 来源

- app/api/internal/blog-import/route.ts
- lib/rich-text.ts
- lib/repositories/blog-automation.ts

如果线上代码已修改，以当前部署源码为准。后台最低正文长度、导入开关、默认分类和草稿/公开状态属于运行时配置，不应当从源码默认值推断生产实际值。

## 字段约定

博客仓库 automation/README.md 示例有九个字段：title、slug、excerpt、content、category、tags、seoTitle、seoDescription、source。

服务端还接受可选 coverImage，但 README 并未要求它。不要把“十字段”写成九字段稿件会被拒绝的检查规则。服务端强制非空的是清理后的 title、slug 和正文纯文本；仓库可以建立更严格的九字段稿件规范，但应说明这是编辑规范而不是服务端全部必填项。

## 字符串处理

服务端 clean 对字符串先 trim，再按 JavaScript slice(0, max) 截断。不是超过以下长度就直接报错。建议稿件验证器超长时拒绝并要求修订，避免服务端静默截断；这属于更严格的投稿检查。

| 字段 | 截断长度，JavaScript 字符串长度单位 |
| --- | --- |
| title | 180 |
| slug | 160，随后还有规范化 |
| excerpt | 500 |
| content | 120000，指清理前 HTML 字符串，不是正文字数 |
| category | 80 |
| seoTitle | 180 |
| seoDescription | 320 |
| source | 120 |
| coverImage，可选 | 800 |
| 每个 tag | 40 |

tags 仅在数组时读取，逐项清理，去掉空项后最多取 20 个。投稿验证可以要求所有项目本来就是字符串。

slug 在 trim/截断后转小写，将空白转连字符，只保留英文 a-z、数字、汉字 U+4E00—U+9FFF 和连字符，再合并连续连字符并去掉两端连字符。编辑规则仍建议小写英文加连字符，以稳定匹配文件名。

## 正文最低长度

处理顺序：

1. content 经 clean 截断至 120000。
2. sanitizeRichHtml 清洗 HTML。
3. richTextToPlainText 生成纯文本。
4. 使用 plain.length 与 runtime.minimumCharacters 比较。

plain.length 是 JavaScript UTF-16 字符串长度，不是只统计汉字、不计空格的字数，也不是 UTF-8 字节数。不要把原始 HTML 长度当最低正文长度。

源码默认 minimumCharacters 为 1200，运行时设置限制在 300—20000。当前线上实际值需由管理员在“博客与 SEO 内容 / AI 自动内容入口”的现行设置中确认。截图应遮挡令牌，只需提供最少字符数。

pure-text 算法依次把 br 和指定块级结束标签换为换行、其余标签换为空格，解码 nbsp/amp/lt/gt/quot/&#39;，将连续空白合并成一个空格，再 trim；最终取 .length。验证器宜复用当前源码算法并增加测试，不要用不同的通用 HTML 解码器猜测边界。

## HTML 清洗

允许标签：p、br、h2、h3、h4、strong、b、em、i、u、s、ul、ol、li、blockquote、a、img、figure、figcaption、hr、code、pre。

去掉注释，以及 script/style/iframe/object/embed/form/input/button/textarea/select/meta/link/base 等标签或相应内容。其他非白名单标签去掉。

保留的输入属性：

- a：href、title；title 最多 300。
- img：src、alt、title、width、height；alt/title 最多 500，width/height 为 1—4 位数字。
- 丢弃事件属性、style、srcdoc 和其余不允许属性。
- 服务端自动添加 a 的 rel="noreferrer noopener" 和 img 的 loading="lazy"。

链接允许 / 开头、# 开头、http:// 或 https://；a 还允许 mailto:。图片不允许 mailto:。这描述的是现有实现，不等于严格的 URL 安全分析。稿件验证可以更严格，例如拒绝 // 开头的协议相对 URL、未知图片来源和不必要的 HTML；不要直接从 PR 执行脚本。

## 分类、重复与导入结果

- 请求分类只有在已存在的博客分类集合中才采用；否则使用后台 defaultCategory。
- 重复 slug，或 lower(title) 相同，会返回 409，error=DUPLICATE_ARTICLE。
- source 用于审计，不控制发布状态。状态取后台 runtime.defaultStatus，投稿 JSON 不应自行改变网站导入模式。
- 成功响应包含 ok=true、id、slug、status。CI 成功不等于已经公开发布，应看业务响应。
- 导入开关关闭返回 403；令牌不匹配返回 401；其他异常返回 400。不要要求管理员把导入令牌发到聊天或提交仓库。

## 配置 PR 应更正

将“README 的十个字段”改为“README 约定的九个字段，可选 coverImage 另行处理”。记录上述源码依据，确认线上最低正文长度后再完成验证器。严格投稿要求和服务器实际行为分别说明。
