const fs=require('node:fs'), crypto=require('node:crypto');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node patch-interaction-order.cjs INPUT OUTPUT');
const bytes=fs.readFileSync(input),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const previous='3373cb0181da07f0815148abd0c0b84f3c47274db0efc040d7c80777d4187998';
if(sha(bytes)!==previous)throw new Error('Expected GPT 1.3.5 with the reviewed desktop-startup fix');
let source=bytes.toString('utf8');const nl=source.includes('\r\n')?'\r\n':'\n';
const anchor='$pressDown={param($sender,$event)';
if(source.split(anchor).length!==2)throw new Error('Expected one character press handler');
const fn=[
  'function Raise-WidgetForInteraction {',
  '  if(!$script:followHost -and $script:desktopTopmost){',
  '    # Raise once on an explicit press; idle placement never competes with peers.',
  '    [GptWidgetNative]::SetWindowPos($script:widgetHandle,[IntPtr](-1),0,0,0,0,0x13)|Out-Null',
  '  }',
  '}',
  anchor,
  '  Raise-WidgetForInteraction',
].join(nl);
source=source.replace(anchor,fn);fs.writeFileSync(output,Buffer.from(source,'utf8'));
console.log(JSON.stringify({previousSha256:previous,sha256:sha(fs.readFileSync(output))}));
