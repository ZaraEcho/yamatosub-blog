import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateArticle,validateHtml,validateChanges,validateTopicsDiff,validateDuplicates,validateDatePath,validateRepository,validateHistory,parseJson } from './blog-validation.mjs';
import { sanitizeRichHtml,richTextToPlainText } from './import-rich-text.mjs';
const article=()=>({title:'日剧字幕排查示例',slug:'subtitle-example',excerpt:'自写测试示例',content:'<p>'+'字'.repeat(1200)+'</p>',category:'字幕教程',tags:['SRT'],seoTitle:'字幕排查',seoDescription:'检查字幕的示例',source:'codex-scheduled-task'});
const before=()=>[{topic:'日剧字幕排查',intent:'教程',status:'pending',custom:{keep:true}},{topic:'历史主题',intent:'教程',status:'used',usedAt:'2026-09-29',extra:'保留'}];
const after=()=>[{...before()[0],status:'used',usedAt:'2026-09-30',articleSlug:'subtitle-example'},before()[1]];
test('nine fields, no cover required; optional empty cover accepted',()=>{assert.equal(validateArticle(article()).plainLength,1200);assert.equal(validateArticle({...article(),coverImage:''}).plainLength,1200);});
test('safe optional cover accepted',()=>validateArticle({...article(),coverImage:'https://www.yamatosub.com/example.png'}));
test('unknown and missing fields rejected',()=>{assert.throws(()=>validateArticle({...article(),status:'published'}));const a=article();delete a.source;assert.throws(()=>validateArticle(a));});
test('1200 is default, configurable runtime value wins',()=>{assert.throws(()=>validateArticle({...article(),content:'<p>'+'字'.repeat(1199)+'</p>'}));assert.throws(()=>validateArticle(article(),{minimum:1300}));validateArticle(article(),{minimum:300});});
test('UTF-16 includes supplementary characters as two code units',()=>{assert.equal(validateArticle({...article(),content:'<p>'+'😀'.repeat(600)+'</p>'}).plainLength,1200);});
test('HTML length cannot replace plain length',()=>assert.throws(()=>validateArticle({...article(),content:'<p title="'+'x'.repeat(2000)+'">短</p>'})));
test('ported source algorithm: entity order, br, block ends, whitespace',()=>{assert.equal(richTextToPlainText('<p>A&nbsp;&amp;B</p><h2>C</h2><br> &amp;lt; &quot; &#39; &#x41;'), 'A &B C < " \' &#x41;');});
test('ported sanitizer removes dangerous content before counting',()=>{assert.equal(richTextToPlainText(sanitizeRichHtml('<script>evil</script><p>safe</p>')),'safe');});
test('all server-approved text formatting tags accepted',()=>validateHtml('<h4>标题</h4><blockquote><p><b>B</b><em>E</em><i>I</i><u>U</u><s>S</s><code>C</code><br></p></blockquote><pre>文本</pre><hr>'));
for(const unsafe of ['<script>bad</script>','<p onclick="x">字</p>','<p style="x">字</p>','<iframe>bad</iframe>','<svg></svg>','<!-- comment -->','<p><','<p>bad','<p></h2>','<a href="javascript:alert(1)">x</a>','<a href="//evil.com">x</a>','<a href="&#106;avascript:x">x</a>','<a href="https://good.com\\evil">x</a>','<img src="https://evil.com/x">','<a href="/ok" href="/bad">x</a>'])test('reject unsafe HTML '+unsafe,()=>assert.throws(()=>validateHtml(unsafe)));
test('safe internal and sourced external links accepted',()=>validateHtml('<p><a href="/guide">指南</a><a href="https://example.com/?a=1&amp;b=2" title="参考">参考</a><a href="mailto:test@example.com">邮件</a></p>'));
test('field lengths enforce submission limits, not server truncation',()=>assert.throws(()=>validateArticle({...article(),title:'字'.repeat(181)})));
test('tags must be strings with no silent truncation',()=>{assert.throws(()=>validateArticle({...article(),tags:[12]}));assert.throws(()=>validateArticle({...article(),tags:['x'.repeat(41)]}));assert.throws(()=>validateArticle({...article(),tags:Array(21).fill('x')}));});
test('JSON syntax and duplicate keys checked',()=>{assert.throws(()=>parseJson('{"a":1,"a":2}'));assert.throws(()=>parseJson('{"x":{"a":1,"a":2}}'));assert.throws(()=>parseJson('{"a":}'));assert.deepEqual(parseJson('{"x":[{"a":1},{"a":2}]}'),{x:[{a:1},{a:2}]});});
const changes=()=>[{status:'A',path:'automation/blog-inbox/2026-09-30-subtitle-example.json'},{status:'M',path:'automation/seo-topics.json'}];
test('new article plus topics accepted',()=>assert.equal(validateChanges(changes()),'article'));
test('old article modifications, deletions and mixed code forbidden',()=>{assert.throws(()=>validateChanges(changes().map(c=>({...c,status:'M'}))));assert.throws(()=>validateChanges([...changes(),{status:'M',path:'app/page.tsx'}]));assert.throws(()=>validateChanges([{status:'D',path:'automation/README.md'}]));});
test('configuration result is separate from article mode',()=>assert.equal(validateChanges([{status:'A',path:'.github/workflows/blog-validation.yml'}]),'configuration'));
test('existing import workflow cannot be changed in configuration mode',()=>assert.throws(()=>validateChanges([{status:'M',path:'.github/workflows/yamatosub-blog-import.yml'}])));
test('exact importer may be added only as configuration, never as article content',()=>{
  const importer={status:'A',path:'.github/workflows/yamatosub-blog-import.yml'};
  assert.equal(validateChanges([importer]),'configuration');
  assert.throws(()=>validateChanges([...changes(),importer]),/article PR scope/);
});
test('importer restoration does not permit arbitrary workflows or deleting existing importer',()=>{
  for(const c of [{status:'A',path:'.github/workflows/other.yml'},{status:'D',path:'.github/workflows/yamatosub-blog-import.yml'},{status:'M',path:'.github/workflows/yamatosub-blog-import.yml'}])assert.throws(()=>validateChanges([c]));
});
test('case-insensitive title and exact slug duplicate detection',()=>{assert.throws(()=>validateDuplicates(article(),[{title:article().title,slug:'other'}]));assert.throws(()=>validateDuplicates({...article(),title:'HELLO'},[{title:'hello',slug:'other'}]));assert.throws(()=>validateDuplicates(article(),[{title:'other',slug:article().slug}]));});
test('file slug, calendar day, same-day production validated',()=>{assert.equal(validateDatePath(changes()[0].path,article(),[]),'2026-09-30');assert.throws(()=>validateDatePath(changes()[0].path,article(),['automation/blog-inbox/2026-09-30-other.json']));assert.throws(()=>validateDatePath('automation/blog-inbox/2026-02-30-subtitle-example.json',article(),[]));});
test('only one paired topic transition; unknown historical fields retained',()=>validateTopicsDiff(before(),after(),{date:'2026-09-30',slug:'subtitle-example'}));
test('history rewrite and wrong usedAt/slug rejected',()=>{const a=after();a[1].extra='changed';assert.throws(()=>validateTopicsDiff(before(),a,{date:'2026-09-30',slug:'subtitle-example'}));assert.throws(()=>validateTopicsDiff(before(),after(),{date:'2026-10-01',slug:'subtitle-example'}));assert.throws(()=>validateTopicsDiff(before(),after(),{date:'2026-09-30',slug:'other'}));});
test('no transition, reordering, removed topic rejected',()=>{assert.throws(()=>validateTopicsDiff(before(),before(),{}));assert.throws(()=>validateTopicsDiff(before(),after().reverse(),{}));assert.throws(()=>validateTopicsDiff(before(),after().slice(0,1),{}));});
function fixture(fn,{history={articles:[]},historicalUsedAt}={}){const root=mkdtempSync(join(tmpdir(),'blog-validator-'));const git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8'}).trim();try{git('init','-q');git('config','user.email','test@example.com');git('config','user.name','Test');mkdirSync(join(root,'automation/blog-inbox'),{recursive:true});const old=before(),now=after();if(historicalUsedAt){old[1].usedAt=historicalUsedAt;now[1].usedAt=historicalUsedAt;}writeFileSync(join(root,'automation/article-history.json'),JSON.stringify(history));writeFileSync(join(root,'automation/seo-topics.json'),JSON.stringify(old));git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');writeFileSync(join(root,changes()[0].path),JSON.stringify(article()));writeFileSync(join(root,'automation/seo-topics.json'),JSON.stringify(now));git('add','.');git('commit','-qm','article');const head=git('rev-parse','HEAD');const metadata={complete:true,head,articles:[],createdAt:'2026-09-30T08:00:00Z'};fn({root,base,head,metadata});}finally{rmSync(root,{recursive:true,force:true});}}
test('integration: trusted git blobs validate a complete article PR',()=>fixture(o=>assert.equal(validateRepository({...o,runtimeConfirmed:true}).articleAutoMergeEligible,true)));
test('integration: default length does not claim online setting verified',()=>fixture(o=>assert.throws(()=>validateRepository(o),/ONLINE MINIMUM UNCONFIRMED/)));
test('integration: open PR collision blocked and stale inventory blocked',()=>fixture(o=>{assert.throws(()=>validateRepository({...o,runtimeConfirmed:true,metadata:{...o.metadata,articles:[{path:changes()[0].path,article:article()}]}}));assert.throws(()=>validateRepository({...o,runtimeConfirmed:true,metadata:{...o.metadata,head:'0'.repeat(40)}}));}));
test('integration: Beijing date checked against PR creation date',()=>fixture(o=>assert.throws(()=>validateRepository({...o,runtimeConfirmed:true,metadata:{...o.metadata,createdAt:'2026-09-29T15:00:00Z'}}),/creation day/)));

const styleDocs=['automation/skills/de-ai-writing/SKILL.md', 'automation/skills/de-ai-writing/UPSTREAM.md', 'automation/skills/de-ai-writing/references/ai-trace-index.md', 'automation/skills/de-ai-writing/references/discourse-pass.md', 'automation/skills/de-ai-writing/references/narrative-pass.md', 'automation/skills/de-ai-writing/references/syntax-pass.md', 'automation/skills/de-ai-writing/references/translation-guardrails.md', 'automation/skills/de-ai-writing/references/vocab-pass.md'];
test('fixed de-ai documentation paths accepted only in configuration mode',()=>{for(const path of styleDocs)for(const status of ['A','M'])assert.equal(validateChanges([{status,path}]),'configuration');});
test('style directory does not allow arbitrary documents, code or traversal',()=>{for(const path of ['automation/skills/de-ai-writing/extra.md','automation/skills/de-ai-writing/run.mjs','automation/skills/other/SKILL.md','automation/skills/de-ai-writing/../README.md'])assert.throws(()=>validateChanges([{status:'A',path}]),/configuration scope/);});
test('style docs cannot mix with daily article changes or be removed',()=>{for(const path of styleDocs){assert.throws(()=>validateChanges([...changes(),{status:'A',path}]),/article PR scope/);for(const status of ['D','R','T'])assert.throws(()=>validateChanges([{status,path}]),/deletions/);}});

const historical=(overrides={})=>({title:'旧字幕文章',slug:'older-subtitle',date:'2026-09-28',...overrides});
test('historical index requires valid entries and unique titles/slugs',()=>{
  assert.deepEqual(validateHistory({articles:[historical()]}),[historical()]);
  for(const h of [{}, {articles:[historical({date:'2026-02-30'})]}, {articles:[historical({slug:'../bad'})]}, {articles:[historical(),historical()]}])assert.throws(()=>validateHistory(h));
});
test('integration: historical title and slug collisions blocked without old article bodies',()=>{
  for(const entry of [historical({title:article().title}),historical({slug:article().slug})])fixture(o=>assert.throws(()=>validateRepository({...o,runtimeConfirmed:true}),/duplicate article/),{history:{articles:[entry]}});
});
test('integration: historical same-day article blocks a second draft',()=>fixture(o=>assert.throws(()=>validateRepository({...o,runtimeConfirmed:true}),/same-day article/),{history:{articles:[historical({date:'2026-09-30'})]}}));
test('integration: existing usedAt blocks same-day production even without an indexed article',()=>fixture(o=>assert.throws(()=>validateRepository({...o,runtimeConfirmed:true}),/same-day article/),{historicalUsedAt:'2026-09-30'}));
test('integration: missing trusted history fails closed',()=>fixture(o=>{
  const git=(...args)=>execFileSync('git',['-C',o.root,...args],{encoding:'utf8'}).trim();
  git('checkout','-q',o.base);git('rm','-q','automation/article-history.json');git('commit','-qm','missing index');const base=git('rev-parse','HEAD');
  git('cherry-pick',o.head);const head=git('rev-parse','HEAD');
  assert.throws(()=>validateRepository({...o,base,head,metadata:{...o.metadata,head},runtimeConfirmed:true}),/regular non-executable blob/);
}));
test('daily article PR cannot modify historical index',()=>assert.throws(()=>validateChanges([...changes(),{status:'M',path:'automation/article-history.json'}]),/article PR scope/));
