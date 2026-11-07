"""One current-user-authorized frontal landing. DPAPI stays inside the helper.

Fresh hash-bound first/last frames, one paid POST, no retry or provider fallback.
Saved budgets and the historical general paid hold are never modified.
"""
from pathlib import Path
from datetime import datetime,timezone,timedelta
from decimal import Decimal
import argparse,base64,hashlib,importlib.util,json,re,shutil,urllib.request,urllib.error

ROOT=Path(__file__).resolve().parents[3]
HERE=ROOT/'integrations/gpt-niang/animated'
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
m=module('front_landing_client','qwen-readable-wave.py')
budget=module('front_landing_budget','project-video-budget.py')
PLAN=ROOT/'work/gpt-front-landing-20261103-01'
BATCH='front-landing-20261103-01';NAME='frontlanding1080';COST=3.6
OUT=m.c.WORK/'wan3-front-landing-1080-20261103-01'
AUTH=PLAN/'authorization.json'
HUMAN='你这个飞行的落地做的不行，明明是正面的，为什么要给她强行贴上侧面的落地动画，你自己调用api单独生成属于这个动作的落地动画吧'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def sig(r):return(r['batch'],r['design'],Decimal(str(r['costCny'])))
def authorize():
    a=read(AUTH);now=datetime.now(timezone.utc)
    if not(a['active'] and a['humanMessage']==HUMAN and a['batch']==BATCH and a['model']==m.MODEL and a['endpoint']==m.c.BASE and a['maxRequests']==1 and a['maxNewReservationCny']==COST and a['automaticRetries'] is False):raise ValueError('SCOPED_AUTH_REQUIRED')
    if not datetime.fromisoformat(a['authorizedAt'])<=now<datetime.fromisoformat(a['submitBefore']):raise ValueError('SUBMIT_WINDOW_EXPIRED')
    for p,digest in a['files'].items():
        if sha(Path(p))!=digest:raise ValueError('SOURCE_OR_PROMPT_CHANGED')
    records=budget.reservations(m.c.WORK);old=[sig(r)for r in a['baselineReservations']];current=[sig(r)for r in records]
    if len(old)!=len(set(old)) or any(current.count(k)!=1 for k in old):raise ValueError('HISTORICAL_RESERVATIONS_CHANGED')
    extra=[r for r in records if sig(r)not in old]
    if len(extra)>1 or any(r['batch']!=BATCH or r['design']!=NAME or r['costCny']!=COST for r in extra):raise ValueError('UNALLOCATED_RESERVATION')
    if budget.total(records)>Decimal(str(a['cumulativeCapCny'])):raise ValueError('SCOPED_BUDGET_EXCEEDED')
    return a
def spec(name):
    if name!=NAME:raise ValueError('SINGLE_ACTION_ONLY')
    a=authorize()
    return {'model':m.MODEL,'action':'front-hover-to-front-idle-landing','durationRequested':3,'resolutionRequested':'1080P','estimatedReservationCny':COST,'seed':2026110309,'prompt':(PLAN/'prompt.txt').read_text(encoding='utf8').strip(),'referencePolicy':'first-last','firstFrameSha256':sha(PLAN/'first-frame.png'),'lastFrameSha256':sha(PLAN/'last-frame.png'),'firstClip':'frontpose','firstSourceFrame':179,'lastClip':'frontidle','lastSourceFrame':0,'finalArtworkApproved':False,'productionInstalled':False}
def initialize():
    if AUTH.exists() or OUT.exists() or (m.c.WORK/BATCH).exists():raise ValueError('FRESH_ROUND_REQUIRED')
    refs=read(PLAN/'references.json')
    for r in refs:
        if sha(Path(r['source']))!=r['sourceSha256'] or sha(PLAN/(r['role']+'-frame.png'))!=r['referenceSha256']:raise ValueError('REFERENCE_CHANGED')
    cfg=m.c.helper.config()
    if not(cfg['enabled'] and cfg['verified'] and cfg['region']=='qianwen'):raise ValueError('HELPER_NOT_READY')
    with budget.locked(m.c.WORK):
        records=budget.reservations(m.c.WORK)
        if any(r['status']!='downloaded' for r in records):raise ValueError('UNFINISHED_PRIOR_TASK')
        now=datetime.now(timezone.utc)
        files=[PLAN/'first-frame.png',PLAN/'last-frame.png',PLAN/'prompt.txt',Path(__file__)]+[Path(r['source'])for r in refs]
        a={'active':True,'batch':BATCH,'humanMessage':HUMAN,'authorizedAt':now.isoformat(),'submitBefore':(now+timedelta(minutes=90)).isoformat(),'maxRequests':1,'maxNewReservationCny':COST,'baselineReservations':records,'cumulativeCapCny':float(budget.total(records)+Decimal(str(COST))),'model':m.MODEL,'endpoint':m.c.BASE,'fundingEpoch':budget.EPOCH,'files':{str(p):sha(p)for p in files},'automaticRetries':False,'automaticTopUp':False,'providerSwitch':False,'generalPaidHoldPreserved':True,'savedBudgetConfigurationChanged':False,'scope':'current explicit user request: one dedicated front-facing landing, no other new generation'}
        m.c.helper.atomic_json(AUTH,a)
    return {'stage':'authorized','baselineCount':len(records),'baselineReservedCny':float(budget.total(records)),'maxNewReservationCny':COST}
def prepare():
    authorize()
    if OUT.exists() or (m.c.WORK/BATCH).exists():raise ValueError('FRESH_OUTPUT_REQUIRED')
    batch=m.c.WORK/BATCH;batch.mkdir();m.c.helper.atomic_json(batch/'authorization.json',{'id':BATCH,'active':True,'fundingEpoch':budget.EPOCH,'maxRequests':1,'scope':'current-user-dedicated-frontal-landing','humanMessage':HUMAN})
    OUT.mkdir()
    for name in ['first-frame.png','last-frame.png','references.json']:shutil.copyfile(PLAN/name,OUT/name)
    r={**spec(NAME),'stage':'prepared','paidCreationRequests':0,'postAttempted':False,'automaticRetries':0,'specSha256':m.digest(spec(NAME)),'generalPaidHoldPreserved':True,'budgetConfigurationChanged':False,'invoiceVerified':False}
    m.c.helper.atomic_json(OUT/'report.json',r);return {'stage':'prepared','referencePolicy':'two-distinct-real-endpoints','estimatedReservationCny':COST}
def payload():
    s=spec(NAME);media=[]
    for role in ['first','last']:
        p=OUT/(role+'-frame.png')
        if sha(p)!=s[role+'FrameSha256']:raise ValueError('COPIED_REFERENCE_CHANGED')
        media.append({'type':role+'_frame','url':'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode('ascii')})
    return {'model':m.MODEL,'input':{'prompt':s['prompt'],'media':media},'parameters':{'duration':3,'resolution':'1080P','ratio':'adaptive','audio':False,'watermark':False,'prompt_extend':False,'seed':s['seed']}}
def submit():
    authorize();r=read(OUT/'report.json');s=spec(NAME)
    if r['stage']!='prepared' or r.get('paidCreationRequests') or r.get('callId'):raise ValueError('NEVER_RESUBMIT')
    if r['specSha256']!=m.digest(s):raise ValueError('SPEC_CHANGED')
    cfg=m.c.helper.config();body=json.dumps(payload(),ensure_ascii=False).encode('utf8')
    try:
        with budget.locked(m.c.WORK):authorize();m.reserve_batch(NAME,COST)
        call=m.c.helper.reserve(dict(cfg,model=m.MODEL),COST);r['callId']=call;m.c.helper.atomic_json(OUT/'report.json',r)
    except Exception as e:
        r.update(stage='local-reservation-error',errorType=type(e).__name__);m.c.helper.atomic_json(OUT/'report.json',r);return r
    with m.database()as db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute("UPDATE calls SET status='post-attempted' WHERE design=? AND status='submitting'",(NAME,)).rowcount!=1:raise ValueError('NO_UNUSED_RESERVATION')
    r.update(stage='submitting',paidCreationRequests=1,postAttempted=True,submittedAt=m.c.stamp());m.c.helper.atomic_json(OUT/'report.json',r)
    try:
        request=urllib.request.Request(m.c.BASE+m.PATH,body,{'Authorization':'Bearer '+m.c.helper.load_key('video'),'Content-Type':'application/json','X-DashScope-Async':'enable'})
        with urllib.request.build_opener(m.c.helper.NoRedirect()).open(request,timeout=45)as response:raw=response.read(2*1024*1024+1)
        if len(raw)>2*1024*1024:raise ValueError('RESPONSE_TOO_LARGE')
        task=json.loads(raw).get('output',{}).get('task_id')
        if not isinstance(task,str)or not re.fullmatch('[A-Za-z0-9-]{1,100}',task):raise ValueError('NO_TASK_ID')
        r.update(stage='submitted',taskId=task,taskSubmissionAccepted=True);m.status(NAME,'submitted')
    except urllib.error.HTTPError as e:
        rejected=300<=e.code<500;r.update(stage='rejected'if rejected else'uncertain-no-retry',httpStatus=e.code);m.status(NAME,'rejected'if rejected else'uncertain');m.c.helper.finish(call,'rejected'if rejected else'uncertain',0 if rejected else COST)
    except Exception as e:
        r.update(stage='uncertain-no-retry',errorType=type(e).__name__);m.status(NAME,'uncertain');m.c.helper.finish(call,'uncertain',COST)
    m.c.helper.atomic_json(OUT/'report.json',r);return r
m.BATCH=BATCH;m.BATCH_DIR=m.c.WORK/BATCH;m.AUTH=m.BATCH_DIR/'authorization.json';m.PRICES={NAME:COST};m.folder=lambda _:OUT;m.authorize=authorize;m.spec=spec
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['initialize','prepare','submit','poll']);a=parser.parse_args()
    r={'initialize':initialize,'prepare':prepare,'submit':submit,'poll':lambda:m.poll(NAME)}[a.mode]()
    print(json.dumps({k:r[k]for k in ['stage','httpStatus','errorType','taskStatus','videoBytes','videoSha256','estimatedReservationCny','maxNewReservationCny','baselineCount','baselineReservedCny','referencePolicy']if k in r},ensure_ascii=False))
