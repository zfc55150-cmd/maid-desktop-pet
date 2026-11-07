// Build a local fix from an exact upstream widget; preserve its original line endings.
const fs = require('node:fs');
const crypto = require('node:crypto');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node patch-desktop-startup.cjs INPUT OUTPUT');
const bytes = fs.readFileSync(input);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
let source = bytes.toString('utf8');
const newline = source.includes('\r\n') ? '\r\n' : '\n';
for (const [axis, parameter, start, end, dimension] of [
  ['Horizontal', 'Left', 'Left', 'Right', 'designWidth'],
  ['Vertical', 'Top', 'Top', 'Bottom', 'designHeight'],
]) {
  const anchor = `function Limit-Widget${axis}Position($Frame,[double]$Dpi,[double]$${parameter}) {`;
  if (source.split(anchor).length !== 2) throw new Error(`Expected one upstream function: ${axis}`);
  const guard = [
    anchor,
    '  # A hidden first frame has no screen transform yet. Clamp the whole canvas',
    '  # until Show connects the visual tree; later frames use character bounds.',
    '  if(![Windows.PresentationSource]::FromVisual($script:ui.Root.Parent)){',
    `    $maximum=[Math]::Max($Frame.${start},$Frame.${end}-$script:${dimension}*$script:displayScale*$Dpi)`,
    `    return [int][Math]::Round([Math]::Max($Frame.${start},[Math]::Min($maximum,$${parameter})))`,
    '  }',
  ].join(newline);
  source = source.replace(anchor, guard);
}
fs.writeFileSync(output, Buffer.from(source, 'utf8'));
console.log(JSON.stringify({previousSha256: sha(bytes), sha256: sha(fs.readFileSync(output))}));
