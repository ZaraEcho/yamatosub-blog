// Port of YamatoSub 3.2.5 lib/rich-text.ts; only TypeScript annotations removed.
const ALLOWED_TAGS = new Set([
  "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li", "blockquote", "a", "img", "figure", "figcaption", "hr", "code", "pre"
]);

const VOID_TAGS = new Set(["br", "img", "hr"]);

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeUrl(value, type) {
  const url = value.trim();
  if (!url) return "";
  if (url.startsWith("/") || url.startsWith("#")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (type === "link" && /^mailto:/i.test(url)) return url;
  return "";
}

function sanitizeAttributes(tag, raw) {
  const attrs = [];
  const pattern = /([a-zA-Z0-9:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = pattern.exec(raw))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (name.startsWith("on") || name === "style" || name === "srcdoc") continue;
    if (tag === "a" && name === "href") {
      const href = safeUrl(value, "link");
      if (href) attrs.push(`href="${escapeAttribute(href)}"`);
    } else if (tag === "a" && name === "title") {
      attrs.push(`title="${escapeAttribute(value.slice(0, 300))}"`);
    } else if (tag === "img" && name === "src") {
      const src = safeUrl(value, "image");
      if (src) attrs.push(`src="${escapeAttribute(src)}"`);
    } else if (tag === "img" && ["alt", "title"].includes(name)) {
      attrs.push(`${name}="${escapeAttribute(value.slice(0, 500))}"`);
    } else if (tag === "img" && ["width", "height"].includes(name) && /^\d{1,4}$/.test(value)) {
      attrs.push(`${name}="${value}"`);
    }
  }
  if (tag === "a") attrs.push('rel="noreferrer noopener"');
  if (tag === "img") attrs.push('loading="lazy"');
  return attrs.length ? ` ${[...new Set(attrs)].join(" ")}` : "";
}

export function sanitizeRichHtml(input) {
  const source = String(input || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link|base)\b[^>]*\/?\s*>/gi, "");

  return source.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const closing = /^<\//.test(full);
    if (closing) return VOID_TAGS.has(tag) ? "" : `</${tag}>`;
    return `<${tag}${sanitizeAttributes(tag, rawAttrs)}>`;
  }).trim();
}

export function richTextToPlainText(input) {
  return String(input || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|h4|li|blockquote|figure)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeHtml(input) {
  return /<(p|h[1-6]|ul|ol|li|blockquote|figure|img|strong|em|br)\b/i.test(input);
}
