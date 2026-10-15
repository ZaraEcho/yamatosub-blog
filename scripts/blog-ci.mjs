// PR data is read with git/API; article branches never supply executable validation code.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]||'.');
const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const git=(...a)=>execFileSync('git',['-C',root,...a],{encoding:'utf8',maxBuffer:20*1024*1024});
const head=event.pull_request?.head.sha||process.env.GITHUB_SHA;
const base=event.pull_request?.base.sha;
const run=(script,args=[],cwd=root)=>{const env={...process.env};delete env.READ_TOKEN;return execFileSync('node',[script,...args],{cwd,stdio:'inherit',env});};
if(!event.pull_request){run('--test',['scripts/blog-validation.test.mjs']);console.log('Configuration smoke tests passed; no import or merge performed.');process.exit(0);}
const scriptsRoot=resolve(process.argv[3]||root);
const validator=resolve(scriptsRoot,'scripts/blog-validation.mjs');
const baseExists=existsSync(validator);
const changes=git('diff','--no-renames','--name-only',base,head).trim().split('\n');
const articleChange=changes.some(p=>p.startsWith('automation/blog-inbox/'));
if(!baseExists&&articleChange)throw Error('Trusted base validator missing: merge the configuration PR first');
const target=baseExists?validator:resolve(root,'scripts/blog-validation.mjs');
// Bootstrap self-tests are intentional for a configuration-only PR and need human review.
// Once installed, the validator below always comes from the base commit.
const { validateRepository,parseJson }=await import(target);
const modeResult=articleChange?null:validateRepository({root,base,head});
if(modeResult){
  // Run candidate tests only for explicitly allowlisted configuration changes, with no secrets.
  run('--test',['scripts/blog-validation.test.mjs']);
  console.log(JSON.stringify(modeResult));
  console.log('Configuration-only result; NOT eligible for article auto-merge.');
  process.exit(0);
}
const api=async path=>{const r=await fetch('https://api.github.com'+path,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+process.env.READ_TOKEN,'X-GitHub-Api-Version':'2022-11-28'}});if(!r.ok)throw Error('GitHub read failed '+r.status);return r.json();};
const repo=process.env.GITHUB_REPOSITORY,number=event.pull_request.number;
let prs=[];for(let page=1;;page++){const list=await api(`/repos/${repo}/pulls?state=open&per_page=100&page=${page}`);prs.push(...list);if(list.length<100)break;}
const articles=[];
for(const pr of prs){if(pr.number===number)continue;let files=[];for(let page=1;;page++){const batch=await api(`/repos/${repo}/pulls/${pr.number}/files?per_page=100&page=${page}`);files.push(...batch);if(batch.length<100)break;}
  for(const file of files.filter(f=>f.filename.startsWith('automation/blog-inbox/')&&f.filename.endsWith('.json')&&f.status!=='removed')){
    const r=await api(`/repos/${pr.head.repo.full_name}/contents/${file.filename}?ref=${pr.head.sha}`);
    if(r.encoding!=='base64')throw Error('Unsupported PR content encoding');
    articles.push({path:file.filename,article:parseJson(Buffer.from(r.content,'base64').toString('utf8')),pr:pr.number});
  }
}
const metadata={complete:true,head,articles,createdAt:event.pull_request.created_at};writeFileSync(resolve(root,'pr-inventory.json'),JSON.stringify(metadata));
const value=process.env.MINIMUM_CHARACTERS||'1200';
const confirmed=process.env.MINIMUM_CONFIRMED==='true'&&!!process.env.MINIMUM_CHARACTERS;
console.log(JSON.stringify(validateRepository({root,base,head,metadata,minimum:Number(value),runtimeConfirmed:confirmed}),null,2));
