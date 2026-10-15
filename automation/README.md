# YamatoSub 自动博客投递

V3.2.3 提供 `/api/internal/blog-import`，用于把 Codex / ChatGPT 云端任务生成的文章安全导入博客。

推荐链路：Codex / ChatGPT Plus 云端定时任务 → GitHub `automation/blog-inbox/*.json` → GitHub Action → YamatoSub 导入接口 → 草稿。

## 文章 JSON 格式

```json
{
  "title": "SRT 字幕时间轴不准确怎么办？",
  "slug": "fix-srt-subtitle-timeline",
  "excerpt": "介绍字幕整体提前或延后时的检查与修复方法",
  "content": "<h2>...</h2><p>...</p>",
  "category": "字幕教程",
  "tags": ["SRT", "时间轴", "字幕教程"],
  "seoTitle": "SRT 字幕时间轴不准确怎么办？| 大和字幕",
  "seoDescription": "...",
  "source": "codex-scheduled-task"
}
```

正文使用受限 HTML，站点导入时仍会再次清洗。重复 slug 或重复标题会被拒绝。

## GitHub Secrets

- `YAMATOSUB_BLOG_IMPORT_URL`: 例如 `https://www.yamatosub.com/api/internal/blog-import`
- `YAMATOSUB_BLOG_IMPORT_TOKEN`: 在 Admin → 博客与 SEO 内容 → AI 自动内容入口生成

建议先把“导入后状态”设置为“仅保存草稿”，观察两周后再决定是否自动发布。
