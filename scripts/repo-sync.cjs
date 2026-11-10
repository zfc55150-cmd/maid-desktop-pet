'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const option = process.argv[2];
const remote = 'origin';
const branch = 'main';
const upstream = 'refs/remotes/origin/main';

function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} failed`);
  return result.stdout;
}

function main() {
  if (process.argv.length > 3 || (option && !['--fetch', '--pre-push'].includes(option))) {
    throw new Error('Usage: node scripts/repo-sync.cjs [--fetch | --pre-push]');
  }
  const current = git('branch', '--show-current').trim();
  if (option) git('fetch', '--no-tags', remote, `refs/heads/${branch}:${upstream}`);
  const changes = git('status', '--porcelain=v1', '-z', '--untracked-files=all');
  const [ahead, behind] = git('rev-list', '--left-right', '--count', `HEAD...${upstream}`).trim().split(/\s+/).map(Number);
  console.log(`分支：${current || 'detached HEAD'} · 相对 ${option ? '刚获取的' : '本地记录的'} origin/main：领先 ${ahead}，落后 ${behind}`);
  console.log(changes ? '工作区：有未提交或未跟踪的文件（git status --short 查看）' : '工作区：干净');
  if (ahead && behind) console.log('历史已分叉。先核对两边的提交，再在独立分支整合；不要强制推送。');
  else if (behind) console.log('确认工作区干净后，可用 git merge --ff-only origin/main 快进。');
  else if (ahead) console.log('本地有待上传提交。推送前运行本脚本的 --pre-push 检查。');
  if (option !== '--pre-push') return;
  if (current !== branch || changes || behind || !ahead) throw new Error('推送检查未通过：需要在干净的 main 上、远端没有未整合提交、且本地有待上传提交。');
  git('diff', '--check', `${upstream}...HEAD`);
  const changed = git('log', '--format=', '--name-only', '--no-renames', '-z', `${upstream}..HEAD`).split('\0');
  const sensitive = /(?:^|\/)(?:state|work|dist|backups|node_modules|\.aws)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|chat\.json.*|main-config\.jsonc.*|api_credentials\.json|control-session\.json|[^/]+\.(?:zip|log|pem|pfx|key))$/i;
  if (changed.some(file => sensitive.test(file))) throw new Error('待上传的提交包含状态、凭据、日志或 ZIP 等文件名。请检查全部待上传提交。');
  const verify = spawnSync(process.execPath, ['scripts/verify.cjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (verify.status !== 0) throw new Error('源码校验未通过。');
  console.log('可以显式运行 git push origin HEAD:main。本次检查没有推送。');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
