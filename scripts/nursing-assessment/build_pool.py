"""
Build the Nursing candidate pool from the accessible sources and de-duplicate it against the whole catalogue BEFORE any evidence is fetched.

  python3 build_pool.py <work-dir>

Reads (all under <work-dir>; nu/koreamed.json is KoreaMed/KAMJE, whose rename relations are linked into the ISSN clusters): nu/export.json (catalogue snapshot), nu/cinahl-complete.json + nu/cinahl-nursing-subject.json (EBSCO title lists, facts only),
nu/scielo-nursing.json, nlm/plan-nlm.json (NLM Nursing-subject serials the planner already found new), ji/oa-sources.ndjson + ji/oa-nonoa.ndjson (OpenAlex sources, with topics).
Identity is never decided by title alone and print/electronic/renamed/translated records are never counted as new journals:
  1. ISSN-clusters: every ISSN/eISSN/ISSN-L that appears together on one record (catalogue row, OpenAlex source, SciELO record, NLM record) is one journal (union-find).
  2. A candidate whose cluster holds a catalogue ISSN is 'held' (exact, print/electronic or cross-field).
  3. Otherwise the normalised title is compared with every catalogue title, and with the title stripped of subtitle/translation/edition parts: a match is 'title_conflict'
     (needs a person; it is not new and it is not auto-merged).
  4. Whatever is left is 'net_new', and candidates that share a cluster with each other are merged into one record with all their source references.
"""
import json,re,sys,collections,unicodedata
W=sys.argv[1]
norm=lambda t:re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()
def base(t):
    t=(t or '').lower(); t=re.split(r'\s[:=/|]\s|\s=\s|\s-\s|\(|\[',t)[0]
    t=re.sub(r'\b(english edition|online|print|international edition|revista|journal of the|the)\b','',t); return norm(t)
VALID=re.compile(r'^\d{4}-\d{3}[\dX]$')
class UF:
    def __init__(s): s.p={}
    def f(s,x):
        s.p.setdefault(x,x)
        while s.p[x]!=x: s.p[x]=s.p[s.p[x]]; x=s.p[x]
        return x
    def u(s,a,b): s.p[s.f(a)]=s.f(b)
uf=UF()
def link(ids):
    ids=[i for i in ids if i and VALID.match(i)]
    for i in ids[1:]: uf.u(ids[0],i)
    if ids: uf.f(ids[0])
    return ids
d=json.load(open(f'{W}/nu/export.json')); cat=d['all']
catIds=set(); catTitles=collections.defaultdict(list); catBase=collections.defaultdict(list)
for j in cat:
    ids=link([j['issn'],j['eissn']]); catIds.update(ids)
    t=norm(j['title']); 
    if t: catTitles[t].append(j)
    b=base(j['title'])
    if len(b)>=8: catBase[b].append(j)
# OpenAlex: ISSN-L clustering only
oa_nursing=[]
CORE_SUB={'Research and Theory','Issues, ethics and legal aspects','Leadership and Management'}
for fn in ['oa-sources.ndjson','oa-nonoa.ndjson']:
    for line in open(f'{W}/ji/{fn}'):
        s=json.loads(line); ids=link([s.get('issn_l')]+(s.get('issn') or []))
        tops=s.get('topics') or []; tot=sum(t['count'] for t in tops) or 1
        nt=[t for t in tops if (t['field']['display_name']=='Nursing' and t['subfield']['display_name'] in CORE_SUB) or re.search(r'nurs|midwif',t['display_name'] or '',re.I)]
        share=sum(t['count'] for t in nt)/tot
        if share>=0.5 and len(nt)>=3 and ids:
            oa_nursing.append({'source':'OpenAlex','title':s['display_name'],'issns':ids,'publisher':s.get('host_organization_name'),'homepage':s.get('homepage_url'),'ref':s['id'],'openalex':{'nursingShare':round(share,2),'nursingTopics':len(nt),'worksCount':s.get('works_count'),'isInDoaj':s.get('is_in_doaj')}})
cands=[]
# KoreaMed / KAMJE: old and new ISSN of a renamed journal are one journal
try: km=json.load(open(f'{W}/nu/koreamed.json'))
except Exception: km=[]
for r in km:
    link([r['issn']]+([r['nowPublishedAs']['issn']] if r.get('nowPublishedAs') else []))
# CINAHL
cc=json.load(open(f'{W}/nu/cinahl-complete.json')); sub={x['issn']:x for x in json.load(open(f'{W}/nu/cinahl-nursing-subject.json'))}
NARROW=re.compile(r'nurs|midwif|enfermer|enfermag|infirm|kango|pflege|sykepleie|verpleeg|keperawatan|hemşire|pielęgn',re.I)
for r in cc:
    ids=link([r['issn']]); 
    if not ids: continue
    isSub=r['issn'] in sub
    if r['type']!='Academic Journal': continue
    if isSub or NARROW.search(r['title'] or '') or NARROW.search(r['publisher'] or ''):
        cands.append({'source':'CINAHL','title':r['title'],'issns':ids,'publisher':r['publisher'],'homepage':None,'ref':'https://about.ebsco.com/title-lists (CINAHL Complete coverage list)','cinahl':{'policy':r['policy'],'type':r['type'],'peer':r['peer'],'idxStart':r['idxStart'],'idxStop':r['idxStop'],'country':r['country'],'nursingSubjects':sub[r['issn']]['subjects'] if isSub else None}})
for x in json.load(open(f'{W}/nu/scielo-nursing.json')):
    ids=link([x['issn'],x['eissn']]+(x['issns'] or []))
    cands.append({'source':'SciELO','title':x['title'],'issns':ids,'publisher':x['publisher'],'homepage':x['homepage'],'ref':x['evidenceUrl'],'scielo':{'status':x['status'],'wos':x['wos'],'areas':x['areas'],'collection':x['collection'],'country':x['country'],'retrieved':x['retrieved']}})
nlmNurs=set()
for r in json.load(open(f'{W}/nlm/subject-serials.json')):
    if 'Nursing' in r['subjects']:
        for i,_ in r['issn']: nlmNurs.add(i)
oaNurs={i for c in oa_nursing for i in c['issns']}
for r in km:
    ids=[r['issn']]+([r['nowPublishedAs']['issn']] if r.get('nowPublishedAs') else [])
    if not (NARROW.search(r['title']) or (r.get('nowPublishedAs') and NARROW.search(r['nowPublishedAs']['title'])) or any(i in nlmNurs or i in sub or i in oaNurs for i in ids)): continue
    ids=link(ids)
    t=(r['nowPublishedAs'] or r)['title']
    cands.append({'source':'KoreaMed','title':t,'issns':ids,'publisher':None,'homepage':None,'ref':r['evidenceUrl'],'koreamed':{'koreamedId':r['koreamedId'],'abbr':r['abbr'],'formerTitle':r['title'] if r.get('nowPublishedAs') else None,'retrieved':r['retrieved']}})
plan=json.load(open(f'{W}/nlm/plan-nlm.json'))
for r in plan['rows']:
    if r['domain']!='Nursing': continue
    ids=link([r['issn'],r['eissn']])
    cands.append({'source':'NLM Catalog','title':r['title'],'issns':ids,'publisher':r['publisherName'],'homepage':None,'ref':'nlm:'+str(r['sourceId']).replace('nlm:',''),'nlm':{'subjects':r['subjects'],'issued':r.get('issued')}})
cands+=oa_nursing
# classify
out=[];cnt=collections.Counter()
for c in cands:
    ids=c['issns']; root={uf.f(i) for i in ids}
    hit=next((j for j in cat if False),None)
    held=[i for i in catIds if False]
    c['_roots']=root
# build root -> catalogue rows
rootRows=collections.defaultdict(list)
for j in cat:
    for i in (j['issn'],j['eissn']):
        if i and VALID.match(i): rootRows[uf.f(i)].append(j)
for c in cands:
    rows=[]
    for r in c.pop('_roots'): rows+=rootRows.get(r,[])
    if rows:
        j=rows[0]; c['dedupe']='held'; c['held']={'id':j['id'],'status':j['status'],'domain':j['domain'],'title':j['title']}; 
        exact=any(i in catIds for i in c['issns']); c['heldVia']='exact ISSN/eISSN' if exact else 'linked through ISSN-L / print-electronic cluster'
    else:
        t=norm(c['title']); b=base(c['title'])
        m=catTitles.get(t) or (catBase.get(b) if len(b)>=8 else None)
        if m: c['dedupe']='title_conflict'; c['held']={'id':m[0]['id'],'status':m[0]['status'],'domain':m[0]['domain'],'title':m[0]['title'],'issn':m[0]['issn']}; c['heldVia']='same normalised title' if catTitles.get(t) else 'same base title (subtitle/translation/edition removed)'
        else: c['dedupe']='net_new'
    cnt[(c['source'],c['dedupe'])]+=1
# merge net_new by cluster
merged={}
for c in cands:
    if c['dedupe']!='net_new': continue
    k=uf.f(c['issns'][0]) if c['issns'] else None
    if k is None: continue
    m=merged.setdefault(k,{'title':c['title'],'issns':set(),'publisher':None,'homepage':None,'sources':[],'cinahl':None,'scielo':None,'nlm':None,'openalex':None,'koreamed':None})
    m['issns'].update(c['issns']); m['publisher']=m['publisher'] or c['publisher']; m['homepage']=m['homepage'] or c['homepage']
    m['sources'].append({'source':c['source'],'ref':c['ref'],'title':c['title']})
    for key in ('cinahl','scielo','nlm','openalex','koreamed'): m[key]=m.get(key) or c.get(key)
net=[{**m,'issns':sorted(m['issns'])} for m in merged.values()]
json.dump({'counts':{f'{a} / {b}':n for (a,b),n in sorted(cnt.items())},'netNew':net,'held':[c for c in cands if c['dedupe']=='held'],'titleConflicts':[c for c in cands if c['dedupe']=='title_conflict']},open(f'{W}/nu/pool.json','w'),ensure_ascii=False)
print(json.dumps({f'{a} / {b}':n for (a,b),n in sorted(cnt.items())},indent=1)); print('net-new merged journals:',len(net),'| multi-source:',sum(1 for m in net if len(m['sources'])>1))
