import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { sanitizeRichHtml, richTextToPlainText } from './import-rich-text.mjs';

export const FIELDS = ['title','slug','excerpt','content','category','tags','seoTitle','seoDescription','source'];
export const LIMITS = {title:180,slug:160,excerpt:500,content:120000,category:80,seoTitle:180,seoDescription:320,source:120,coverImage:800};
const TAGS = new Set('p br h2 h3 h4 strong b em i u s ul ol li blockquote a img figure figcaption hr code pre'.split(' '));
const VOID = new Set(['br','hr','img']);
export const CONFIG = new Set(['automation/README.md','automation/EDITORIAL_PLAN_CN.md','automation/CODEX_TASK_PROMPT_CN.md','automation/CONFIG_AUDIT_20260930.md','automation/BLOG_IMPORT_RULES_V3.2.5.md','automation/BLOG_VALIDATION.md','automation/seo-topics.json','.github/workflows/blog-validation.yml','scripts/blog-validation.mjs','scripts/blog-validation.test.mjs','scripts/import-rich-text.mjs','scripts/blog-ci.mjs']);
// Exact documentation paths only; article scope remains unchanged.
CONFIG.add('automation/skills/de-ai-writing/SKILL.md');
CONFIG.add('automation/skills/de-ai-writing/UPSTREAM.md');
CONFIG.add('automation/skills/de-ai-writing/references/ai-trace-index.md');
CONFIG.add('automation/skills/de-ai-writing/references/discourse-pass.md');
CONFIG.add('automation/skills/de-ai-writing/references/narrative-pass.md');
CONFIG.add('automation/skills/de-ai-writing/references/syntax-pass.md');
CONFIG.add('automation/skills/de-ai-writing/references/translation-guardrails.md');
CONFIG.add('automation/skills/de-ai-writing/references/vocab-pass.md');
const check = (v, m) => { if (!v) throw new Error(m); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function parseJson(s) {
  // Reject duplicate keys: JSON.parse otherwise silently keeps the last value.
  const frames = []; let expectingKey = false;
  for (let i=0;i<s.length;i++) {
    const c=s[i]; if(c==='"') {let j=i+1;for(;j<s.length;j++){if(s[j]==='\\'){j++;continue;}if(s[j]==='"')break;}
      const token=s.slice(i,j+1); if(expectingKey&&frames.at(-1)?.type==='object'){const key=JSON.parse(token);check(!frames.at(-1).keys.has(key),'duplicate JSON key: '+key);frames.at(-1).keys.add(key);expectingKey=false;}i=j;
    } else if(c==='{'){frames.push({type:'object',keys:new Set()});expectingKey=true;}
    else if(c==='['){frames.push({type:'array'});expectingKey=false;}
    else if(c==='}'||c===']'){frames.pop();expectingKey=false;}
    else if(c===','){expectingKey=frames.at(-1)?.type==='object';}
  }
  return JSON.parse(s);
}
export function safeUrl(raw, image=false) {
  check(typeof raw==='string'&&raw===raw.trim()&&raw.length>0,'empty or untrimmed URL');
  check(!/[\u0000-\u0020\u007f\\]/.test(raw),'unsafe URL whitespace/control/backslash');
  check(!/&#|&(?!(?:amp;))/i.test(raw),'unsupported URL entity');
  const s=raw.replace(/&amp;/gi,'&');
  if(s.startsWith('/')){check(!s.startsWith('//'),'protocol-relative URL');return;}
  if(s.startsWith('#')&&!image)return;
  if(/^mailto:/i.test(s)&&!image){check(s.length>7,'empty mailto');return;}
  check(/^https?:\/\//i.test(s),'unsafe URL protocol');
  const u=new URL(s);check(!u.username&&!u.password&&!!u.hostname,'URL credentials/host');
  if(image)check(u.protocol==='https:'&&u.hostname==='www.yamatosub.com','unapproved image origin');
}
export function validateHtml(html) {
  const stack=[]; let pos=0;
  for(const m of html.matchAll(/<[^>]*>/g)) {
    check(!html.slice(pos,m.index).includes('<'),'malformed HTML');pos=m.index+m[0].length;
    const t=m[0].match(/^<(\/?)([a-z][a-z0-9]*)([^<>]*)>$/);check(t,'invalid HTML tag');
    const [,closing,tag,tail]=t;check(TAGS.has(tag),'unsafe HTML tag: '+tag);
    if(closing){check(tail.trim()===''&&!VOID.has(tag)&&stack.pop()===tag,'unbalanced HTML');continue;}
    const attrs=new Map();let rest=tail.replace(/\s*\/$/,'');
    while(rest.trim()) {const a=rest.match(/^\s+([a-z][a-z0-9-]*)="([^"<>]*)"/);check(a,'attributes must be double quoted');check(!attrs.has(a[1]),'duplicate attribute');attrs.set(a[1],a[2]);rest=rest.slice(a[0].length);}
    const allowed=tag==='a'?['href','title']:tag==='img'?['src','alt','title','width','height']:[];
    for(const [k,v]of attrs){check(allowed.includes(k),'unsafe HTML attribute: '+k);if(k==='href'||k==='src')safeUrl(v,k==='src');if(k==='title'||k==='alt')check(v.length<=(tag==='a'?300:500),'attribute too long');if(k==='width'||k==='height')check(/^\d{1,4}$/.test(v),'invalid image dimensions');}
    if(tag==='a')check(attrs.has('href'),'anchor missing href');
    if(tag==='img')check(attrs.has('src'),'image missing src');
    if(!VOID.has(tag))stack.push(tag);
  }
  check(!html.slice(pos).includes('<')&&stack.length===0,'malformed/unclosed HTML');
  return richTextToPlainText(sanitizeRichHtml(html.trim().slice(0,120000)));
}
export function validateArticle(a,{minimum=1200}={}) {
  check(object(a),'article must be object');
  check(Number.isInteger(minimum)&&minimum>=300&&minimum<=20000,'minimum must be 300..20000');
  for(const f of FIELDS)check(Object.hasOwn(a,f),'missing field: '+f);
  for(const f of Object.keys(a))check(FIELDS.includes(f)||f==='coverImage','unknown article field: '+f);
  for(const [f,max]of Object.entries(LIMITS)){if(f==='coverImage'&&!Object.hasOwn(a,f))continue;check(typeof a[f]==='string','string required: '+f);check(a[f]===a[f].trim(),'trim field: '+f);check(a[f].length<=max,'field too long: '+f);}
  for(const f of ['title','slug','content'])check(a[f].length>0,'empty field: '+f);
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug),'invalid editorial slug');
  check(a.source==='codex-scheduled-task','unexpected source');
  check(Array.isArray(a.tags)&&a.tags.length<=20,'tags array/max 20');
  for(const t of a.tags)check(typeof t==='string'&&t.trim()===t&&t.length>0&&t.length<=40,'invalid tag');
  if(a.coverImage)safeUrl(a.coverImage,true);
  const plain=validateHtml(a.content);check(plain.length>=minimum,`plain.length ${plain.length} below minimum ${minimum}`);
  return {plainLength:plain.length};
}
export function validateTopics(topics) {
  check(Array.isArray(topics),'topics array required');const names=new Set();
  for(const t of topics){check(object(t)&&typeof t.topic==='string'&&t.topic.trim(),'invalid topic');check(!names.has(t.topic),'duplicate topic');names.add(t.topic);check(typeof t.intent==='string'&&['pending','used'].includes(t.status),'invalid topic state');if(t.status==='used')check(/^\d{4}-\d{2}-\d{2}$/.test(t.usedAt??''),'usedAt required');}
}
export function validateTopicsDiff(old,now,{date,slug}={}) {
  validateTopics(old);validateTopics(now);check(now.length>=old.length,'removed topics');const used=[];
  for(let i=0;i<old.length;i++){
    const before=old[i],after=now[i];check(before.topic===after.topic,'reordered/replaced history');
    const transition=before.status==='pending'&&after.status==='used';
    for(const [k,v]of Object.entries(before))if(!(transition&&k==='status'))check(isDeepStrictEqual(after[k],v),'changed historical field: '+k);
    if(transition){for(const k of Object.keys(after))check(Object.hasOwn(before,k)||['usedAt','articleSlug','articleTitle'].includes(k),'unexpected topic field added');check(!['duplicate','deferred'].includes(before.editorialStatus),'unusable topic');check(after.usedAt===date&&after.articleSlug===slug,'topic/article association mismatch');used.push(after);}
    else check(isDeepStrictEqual(before,after),'unrelated existing topic changed');
  }
  check(used.length===1,'exactly one topic must become used');
  for(const t of now.slice(old.length))check(t.status==='pending'&&!Object.hasOwn(t,'usedAt'),'new topics must remain pending');
}
export function validateChanges(changes) {
  check(changes.length>0,'empty PR');
  check(changes.every(c=>['A','M'].includes(c.status)),'deletions/renames/type changes forbidden');
  const articles=changes.filter(c=>c.path.startsWith('automation/blog-inbox/'));
  if(articles.length){check(articles.length===1&&articles[0].status==='A','one NEW article required');check(changes.length===2&&changes.some(c=>c.path==='automation/seo-topics.json'&&c.status==='M'),'article PR scope violation');return 'article';}
  check(changes.every(c=>CONFIG.has(c.path)),'configuration scope violation');return 'configuration';
}
export function validateDuplicates(a,existing) {
  for(const b of existing)check(a.slug!==b.slug&&a.title.toLowerCase()!==b.title.toLowerCase(),'duplicate article title/slug');
}
export function validateHistory(history) {
  check(object(history)&&Array.isArray(history.articles),'historical article index required');
  const slugs=new Set(),titles=new Set();
  for(const a of history.articles){
    check(object(a)&&typeof a.title==='string'&&a.title.trim()===a.title&&a.title.length>0,'invalid historical title');
    check(typeof a.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug),'invalid historical slug');
    check(typeof a.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)&&!Number.isNaN(Date.parse(a.date+'T00:00:00Z'))&&new Date(a.date+'T00:00:00Z').toISOString().slice(0,10)===a.date,'invalid historical date');
    check(!slugs.has(a.slug)&&!titles.has(a.title.toLowerCase()),'duplicate historical title/slug');
    slugs.add(a.slug);titles.add(a.title.toLowerCase());
  }
  return history.articles;
}
export function validateDatePath(path,a,existingPaths) {
  const m=path.match(/^automation\/blog-inbox\/(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/);check(m&&m[2]===a.slug,'filename/slug mismatch');
  check(new Date(m[1]+'T00:00:00Z').toISOString().slice(0,10)===m[1],'invalid date');
  check(!existingPaths.some(p=>p.startsWith('automation/blog-inbox/'+m[1]+'-')),'same-day article already exists');return m[1];
}
function git(root,...args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:20*1024*1024});}
export function readAt(root,ref,path){check(/^[0-9a-f]{40}$/.test(ref),'full SHA required');const entry=git(root,'ls-tree',ref,'--',path).trim();check(entry.startsWith('100644 blob '),'file must be regular non-executable blob: '+path);return git(root,'show',ref+':'+path);}
function pathsAt(root,ref){return git(root,'ls-tree','-r','--name-only',ref,'--','automation/blog-inbox').trim().split('\n').filter(p=>p.endsWith('.json'));}
export function validateRepository({root,base,head,metadata,minimum=1200,runtimeConfirmed=false}) {
  check(/^[0-9a-f]{40}$/.test(base)&&/^[0-9a-f]{40}$/.test(head),'full base/head SHAs required');
  const parts=git(root,'diff','--no-renames','--name-status','-z',base,head).split('\0').filter(Boolean);const changes=[];for(let i=0;i<parts.length;i+=2)changes.push({status:parts[i],path:parts[i+1]});
  const mode=validateChanges(changes);
  if(mode==='configuration'){
    for(const c of changes){const s=readAt(root,head,c.path);if(c.path.endsWith('seo-topics.json')){const now=parseJson(s);validateTopics(now);const old=parseJson(readAt(root,base,c.path));check(now.length>=old.length,'removed topics');for(let i=0;i<old.length;i++)for(const[k,v]of Object.entries(old[i]))check(isDeepStrictEqual(now[i][k],v),'config rewrites topic history');}}
    return {mode,files:changes.map(c=>c.path),articleAutoMergeEligible:false};
  }
  check(runtimeConfirmed,'ONLINE MINIMUM UNCONFIRMED: set BLOG_MINIMUM_CHARACTERS and BLOG_MINIMUM_CONFIRMED after administrator verification');
  check(metadata?.complete===true&&metadata?.head===head&&Array.isArray(metadata.articles),'open PR inventory missing or stale');
  const path=changes.find(c=>c.path.startsWith('automation/blog-inbox/')).path;
  const a=parseJson(readAt(root,head,path));const result=validateArticle(a,{minimum});
  // Read the immutable index from the trusted base, never from PR-supplied metadata.
  const history=validateHistory(parseJson(readAt(root,base,'automation/article-history.json')));
  const paths=pathsAt(root,base);const existing=paths.map(p=>parseJson(readAt(root,base,p)));
  const oldTopics=parseJson(readAt(root,base,'automation/seo-topics.json'));
  validateTopics(oldTopics);
  const historicalPaths=history.map(x=>`automation/blog-inbox/${x.date}-${x.slug}.json`);
  const usedDates=oldTopics.filter(x=>x.status==='used').map(x=>`automation/blog-inbox/${x.usedAt}-used-topic.json`);
  const date=validateDatePath(path,a,[...paths,...historicalPaths,...usedDates,...metadata.articles.map(x=>x.path)]);
  check(typeof metadata.createdAt==='string'&&!Number.isNaN(Date.parse(metadata.createdAt)),'PR creation time required');
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(metadata.createdAt));
  check(date===local,'article date must match PR creation day in Asia/Shanghai');
  validateDuplicates(a,[...history,...existing,...metadata.articles.map(x=>x.article)]);
  validateTopicsDiff(oldTopics,parseJson(readAt(root,head,'automation/seo-topics.json')),{date,slug:a.slug});
  return {mode,path,date,...result,minimum,articleAutoMergeEligible:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const [root,base,head,metadataPath,minimum,confirmed]=process.argv.slice(2);const result=validateRepository({root,base,head,metadata:metadataPath?parseJson(readFileSync(metadataPath,'utf8')):undefined,minimum:Number(minimum||1200),runtimeConfirmed:confirmed==='true'});console.log(JSON.stringify(result,null,2));}
  catch(e){console.error('blog-validation: '+e.message);process.exitCode=1;}
}
