'use strict';
const fs=require('node:fs'),path=require('node:path'),{sha}=require('./app/file-integrity.cjs');
const stage=path.resolve(process.argv[2]),out=path.join(stage,'package'),read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'')),plan=read(path.join(stage,'promotion-plan.json'));
if(fs.existsSync(path.join(plan.target,'package-manifest.json')))throw Error('PACKAGE_ALREADY_INSTALLED');
const manifest=read(path.join(out,'package-manifest.json'));
fs.cpSync(path.join(__dirname,'app'),path.join(out,'app'),{recursive:true});function include(dir){for(const e of fs.readdirSync(path.join(out,dir),{withFileTypes:true})){const relative=dir+'/'+e.name;if(e.isDirectory())include(relative);else if(!manifest.files.some(f=>f.path===relative))manifest.files.push({path:relative});}}include('app');
for(const row of manifest.files){row.bytes=fs.statSync(path.join(out,row.path)).size;row.sha256=sha(path.join(out,row.path));}
fs.writeFileSync(path.join(out,'package-manifest.json'),JSON.stringify(manifest,null,2));
Object.assign(plan.active,{mainSha256:sha(path.join(out,'app/main.cjs')),manifestSha256:sha(path.join(out,'package-manifest.json'))});
const archive=read(path.join(stage,'rollback-backup.json'));
// The archive's manifest supplies exact hashes for files outside the previous deployment list.
const all=read(path.join(stage,'old-files.json'));
const gui=new Set(['audio.ps1','character-gallery.ps1','characters.ps1','color-theme.ps1','completion-notifications.ps1','desktop-interaction.ps1','experience-controls.ps1','host-follow.ps1','host-layer.ps1','host-occlusion.ps1','host-ready.ps1','music.ps1','native-motion-adapter.ps1','pet-forms.ps1','pet-presentation.ps1','pet-throw.ps1','quote-layout.ps1','quotes.ps1','settings-store.ps1','ui-settings.ps1','update-ui.ps1']);
const retire=all.files.filter(f=>f.path.startsWith('assets/')||f.path.startsWith('tests/')||f.path==='widget.xaml'||f.path.startsWith('runtime/dragon-animation/')&&!f.path.endsWith('.mjs')||f.path.startsWith('runtime/')&&(f.path.endsWith('.cs')||gui.has(path.posix.basename(f.path))));
const retireNames=new Set(retire.map(f=>f.path));
const overlay=path.join(stage,'root-overlay');fs.mkdirSync(path.join(overlay,'runtime'),{recursive:true});
for(const relative of ['widget.ps1','runtime/start-widget.ps1','runtime/supervisor.ps1','runtime/supervisor-task.ps1'])fs.copyFileSync(path.join(__dirname,'compat',path.basename(relative)),path.join(overlay,relative));
const required=all.files.map(f=>f.path).filter(f=>!retireNames.has(f)&&f!=='runtime/install-files.json');required.push('active-version.json',...manifest.files.map(f=>'versions/'+plan.version+'/'+f.path),'versions/'+plan.version+'/package-manifest.json');
fs.writeFileSync(path.join(overlay,'runtime/install-files.json'),JSON.stringify(required,null,2));
const config=read(path.join(path.dirname(plan.target),'..','installation.json'));config.nodePath=path.join(plan.target,'node/node.exe');config.desktopVersion=plan.version;config.renderer='electron';
fs.writeFileSync(path.join(overlay,'installation.json'),JSON.stringify(config,null,2));
const mcp=read(path.join(path.dirname(plan.target),'..','.mcp.json'));mcp.mcpServers['gpt-niang-usage'].command=config.nodePath;
fs.writeFileSync(path.join(overlay,'.mcp.json'),JSON.stringify(mcp,null,2));
fs.copyFileSync(path.join(__dirname,'compat/README.md'),path.join(overlay,'README.md'));const metadata=read(path.join(path.dirname(plan.target),'..','package.json'));metadata.scripts={verify:'node versions/'+plan.version+'/app/package-doctor.cjs versions/'+plan.version};fs.writeFileSync(path.join(overlay,'package.json'),JSON.stringify(metadata,null,2));
const names=['widget.ps1','runtime/start-widget.ps1','runtime/supervisor.ps1','runtime/supervisor-task.ps1','runtime/install-files.json','installation.json','.mcp.json','README.md','package.json'];
plan.replacements=names.map(relative=>({path:relative,previousSha256:all.files.find(f=>f.path===relative).sha256,sha256:sha(path.join(overlay,relative))}));
plan.retire=retire;plan.rollback=archive;plan.files=manifest.files.length;plan.bytes=manifest.files.reduce((n,f)=>n+f.bytes,0);
fs.writeFileSync(path.join(stage,'promotion-plan.json'),JSON.stringify(plan,null,2));fs.writeFileSync(path.join(stage,'active-version.json'),JSON.stringify(plan.active,null,2));console.log(JSON.stringify({refreshed:true,files:plan.files,retire:retire.length,replacements:names.length}));
