import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||major>=25||(major===22&&minor<14)){
  console.error('此项目需要 Node.js >=22.14 且 <25，建议安装 Node.js 24 LTS 后重新打开。');
  process.exit(1);
}
const lock=createHash('sha256').update(readFileSync('package-lock.json')).digest('hex');
const stamp='.runtime/website-dependencies.sha';
const prepared=existsSync('node_modules/vite/bin/vite.js')&&existsSync(stamp)&&readFileSync(stamp,'utf8')===lock;
function run(command,args){return new Promise(resolve=>{
  const child=spawn(command,args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
  child.on('error',error=>{console.error(error.message);resolve(1);});child.on('exit',code=>resolve(code??1));
});}
if(!prepared){
  console.log('正在准备网站依赖，首次需要联网…');
  if(await run('npm',['ci','--no-audit','--no-fund']))process.exit(1);
  mkdirSync('.runtime',{recursive:true});writeFileSync(stamp,lock);
}
process.exit(await run('npm',['run','dev']));
