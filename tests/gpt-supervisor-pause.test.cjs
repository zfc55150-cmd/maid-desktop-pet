'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('GPT supervisor clears pre-boot normal pause on reboot while preserving same-boot and safeMode pauses', t => {
  if (process.platform !== 'win32') {
    t.skip('PowerShell supervisor pause helper is Windows-only');
    return;
  }
  const supervisorPath = path.resolve(__dirname, '../integrations/gpt-niang/product-electron/compat/supervisor.ps1');
  const source = fs.readFileSync(supervisorPath, 'utf8');
  const start = source.indexOf('function Get-WidgetSystemBootUtc');
  const end = source.indexOf('function Get-WidgetSupervisorRunningGui');
  assert.ok(start >= 0 && end > start, 'Expected Get-WidgetSystemBootUtc and Test-WidgetSupervisorPause in supervisor.ps1');
  const fnBlock = source.slice(start, end);

  const psScript = [
    fnBlock,
    "$boot = [DateTimeOffset]::Parse('2026-11-26T14:12:42Z').UtcDateTime",
    '$preBoot = [pscustomobject]@{ desktop = $true; at = "2026-11-20T04:58:02.661Z" }',
    '$sameBoot = [pscustomobject]@{ desktop = $true; at = "2026-11-26T15:00:00.000Z" }',
    '$safeModePreBoot = [pscustomobject]@{ desktop = $true; safeMode = $true; at = "2026-11-20T04:58:02.661Z" }',
    '$result = @{',
    '  preBoot = Test-WidgetSupervisorPause $preBoot @() $boot',
    '  sameBoot = Test-WidgetSupervisorPause $sameBoot @() $boot',
    '  safeModePreBoot = Test-WidgetSupervisorPause $safeModePreBoot @() $boot',
    '  nullPause = Test-WidgetSupervisorPause $null @() $boot',
    '}',
    '$result | ConvertTo-Json -Compress'
  ].join('\n');

  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const parsed = JSON.parse(res.stdout.trim());
  assert.deepEqual(parsed, {
    preBoot: false,
    sameBoot: true,
    safeModePreBoot: true,
    nullPause: false
  });
});
