"""Read-only production audit -> new candidate config/registry. Never imports studio scripts.

This snapshots delivery identity; it does not claim those bytes can be rebuilt from
unattested historical recipes, nor does it grant artistic approval.
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def literal_assignment(path, target):
    for node in ast.walk(ast.parse(Path(path).read_text(encoding='utf-8-sig'))):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == target for t in node.targets):
            if target == 'PHASE3_TASKS':
                # Only task identity fields; do not evaluate prompt expressions,
                # import the generator or touch its credentials/network helpers.
                return [{ast.literal_eval(k): ast.literal_eval(v) for k, v in zip(item.keys, item.values)
                         if isinstance(k, ast.Constant) and k.value in ('id', 'cn_name', 'type')}
                        for item in node.value.elts]
            return ast.literal_eval(node.value)
    raise ValueError('Missing literal assignment: ' + target)


def preflight(config, registry):
    by_name = {n: c for c in registry['clips'] for n in c['aliases']}
    errors = []
    animations = config['animations']
    events = set(n for pool in animations.get('events', {}).values() for n in pool)
    seen = set()
    for cat in animations.get('categories', []):
        for name in cat['actions']:
            c = by_name.get(name)
            if not c:
                errors.append('Missing asset: ' + name)
                continue
            if name in events or not c['autoEligible']:
                errors.append('Ineligible daily entry: ' + name)
            if c['clipId'] in seen:
                errors.append('Duplicate content in daily categories: ' + name)
            seen.add(c['clipId'])
    for move in animations.get('moves', {}).get('actions', []):
        if not isinstance(move, dict) or not isinstance(move.get('name'), str):
            errors.append('moves.actions requires objects with name/params')
        elif move['name'] not in by_name:
            errors.append('Missing move asset: ' + move['name'])
    return errors


def prepare(config_path, media_dir, studio, out):
    out = Path(out).resolve()
    if not out.is_relative_to(ROOT / 'work'):
        raise ValueError('Candidate output must be inside this workspace/work')
    if out.exists() and any(out.iterdir()):
        raise ValueError('Use a new empty candidate directory')
    config = read_json(config_path)
    av = read_json(ROOT / 'work/gpt-niang-animation/motion/asset-validation.json')
    specs = literal_assignment(studio / 'scripts/normalize_step03.py', 'action_specs')
    source_map = {name: (key, mode) for name, key, mode in specs}
    source_map['奉茶收杯'] = ('teareturn', 'direct')
    tasks = literal_assignment(studio / 'scripts/generate_phase3_ecosystem.py', 'PHASE3_TASKS')
    task_map = {task['cn_name']: task for task in tasks}
    ai_returns = {'wave': 'wavereturn', 'thinking': 'thinkingreturn', 'lookaround': 'lookaroundreturn',
                  'happy': 'happyreturn', 'stretching': 'stretchingreturn', 'complimentavert': 'complimentreturn'}
    returns = {'抱臂回正': ('proudarms', []), '奉茶收杯': ('tea', ['cup']),
               '展扇收扇': ('fan', ['fan']), '提灯收灯': ('lantern', ['lantern'])}
    side = {'侧身呼吸', '重心微晃', '挪步站稳', '悠闲放松', '脚尖轻点', '乖巧回应', '安静歪头'}
    groups = {}
    for path in sorted(media_dir.glob('*.webm')):
        sha = digest(path)
        groups.setdefault(sha, []).append(path.stem)
    clips = []
    for sha, names in groups.items():
        canonical = next((n for n in names if n in source_map or n in task_map), names[0])
        key, mode = source_map.get(canonical, (None, None))
        paths = []
        if key in av['states']:
            info = av['states'][key]
            paths.append(Path(info.get('nativeRgbaMasterPath') or ROOT / 'integrations/gpt-niang/animated/assets/continuous-source' / info['matteSourceFile']))
        if key in ai_returns:
            paths.append(studio / 'work/candidates' / (ai_returns[key] + '-4s-v1') / 'matte-v1/action-matte-lossless.mkv')
        task = task_map.get(canonical)
        if task:
            paths.append(studio / 'work/phase3_generated' / task['id'] / 'trial.mp4')
        entry, exit_pose, props = 'unknown', 'unknown', []
        triggers, eligible = [], False
        kind = 'unreviewed'
        if key == 'frontidle':
            entry = exit_pose = 'front'; triggers = ['daily', 'manual']; eligible = True; kind = 'native-loop'
        elif key in ai_returns:
            entry = exit_pose = 'front'; triggers = ['daily', 'manual']; eligible = True; kind = 'native-return-composite'
        elif canonical in returns:
            entry, props = returns[canonical]; exit_pose = 'front'; triggers = ['transition']; kind = 'return-only'
        elif canonical in side:
            entry = exit_pose = 'side'; triggers = ['manual']; kind = 'side-pose'
        elif canonical == '正面转侧':
            entry, exit_pose = 'front', 'side'; triggers = ['transition']; kind = 'pose-bridge'
        elif canonical == '侧身转正':
            entry, exit_pose = 'side', 'front'; triggers = ['transition']; kind = 'pose-bridge'
        elif task and task['type'] in ('workStatus', 'balance'):
            entry = exit_pose = 'front'; triggers = ['event']; kind = 'event'
        elif mode == 'landing':
            entry, exit_pose = 'airborne-flutter-end', 'front'; triggers = ['landing']; kind = 'landing'
        elif mode in ('with_return', 'pair_proud', 'pair_tea'):
            entry = exit_pose = 'front'; triggers = ['manual']; kind = 'composite-needs-visual-review'
        sources = [{'path': str(p), 'sha256': digest(p) if p.is_file() else None} for p in paths]
        clips.append({'clipId': 'sha256:' + sha, 'sha256': sha, 'aliases': names,
                      'canonicalName': canonical, 'sourceKey': key, 'sources': sources,
                      'productionBuildAttested': False, 'kind': kind, 'purpose': kind,
                      'entryPose': entry, 'exitPose': exit_pose, 'requiredProps': props,
                      'producedProps': [], 'mirrorAllowed': None, 'loopSegment': None,
                      'interruptWindows': [], 'minimumDisplaySec': None, 'exitPath': None,
                      'gaitAnchors': [], 'landingAnchors': [], 'allowedTriggers': triggers,
                      'autoEligible': eligible, 'technicalStatus': 'hash-inventoried-only',
                      'visualStatus': 'pending-current-normal-speed-review',
                      'semanticEvidence': 'studio script declaration; not per-frame visual certification'})
    registry = {'schemaVersion': 1, 'character': 'gptniang', 'clips': clips,
                'sourceConfigSha256': digest(config_path),
                'buildPolicy': 'candidate-only; no production writes; unknown semantics fail closed'}
    by_name = {n: c for c in clips for n in c['aliases']}
    candidate = json.loads(json.dumps(config))
    seen = set()
    removed = []
    for cat in candidate['animations']['categories']:
        kept = []
        for name in cat['actions']:
            clip = by_name.get(name)
            if clip and clip['autoEligible'] and clip['clipId'] not in seen:
                kept.append(name); seen.add(clip['clipId'])
            else:
                removed.append({'name': name, 'category': cat['id'], 'reason': 'unknown/unsafe entry, event/return/side, or duplicate content'})
        cat['actions'] = kept
    errors = preflight(candidate, registry)
    if errors:
        raise ValueError('\n'.join(errors))
    candidate['animations']['actionRegistry'] = registry
    out.mkdir(parents=True, exist_ok=True)
    for name, value in [('action-registry.json', registry), ('gptniang-config.candidate.json', candidate),
                        ('preflight.json', {'passed': True, 'errors': [], 'removedFromDailyOnly': removed,
                                            'productionFilesChanged': False, 'visualApproval': False})]:
        (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return {'files': sum(len(c['aliases']) for c in clips), 'uniqueClips': len(clips), 'dailyRemoved': len(removed), 'output': str(out)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--media', type=Path, required=True)
    parser.add_argument('--studio', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.config, args.media, args.studio, args.out), ensure_ascii=False))
