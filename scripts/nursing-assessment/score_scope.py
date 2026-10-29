"""
Nursing scope tiers for (a) the existing NeedsReview Nursing records and (b) the net-new pool. Scope evidence only; publication evidence is separate.

  python3 score_scope.py <work-dir>

Independent subject-type signals (a title word is NOT one of them; it is the journal's own claim and is counted separately):
  NLM    the serial is found under the NLM subject "Nursing"
  CINAHL the title is in the CINAHL "Nursing" discipline subject list (a plain CINAHL listing is NOT evidence: CINAHL also indexes allied health and general medicine)
  SCIELO the SciELO record carries the Web of Science area NURSING
  OA     OpenAlex topics: at least half of the journal's topic weight is nursing (3 core nursing topics or more)
  PUB    the publisher is a nursing body (name contains nurs/midwi/enfermer/...)
Tier A  two or more subject signals, or one subject signal plus a narrow nursing word in the title
Tier B  one subject signal and no title word, or a title word with partial OpenAlex support (>= 25% nursing topics)
Tier C  a title word only (the journal's own claim, nothing independent supports it)
Tier X  nothing
"""
import json,re,sys,collections
W=sys.argv[1]
NARROW=re.compile(r'nurs|midwif|enfermer|enfermag|infirm|kango|pflege|sykepleie|verpleeg|keperawatan|kebidanan|hemşire|hemsire|pielęgn|sestr',re.I)
PUB=re.compile(r'nurs|midwi|enfermer|enfermag|infirm|pflege|sykepleie|verpleeg|kango|keperawatan',re.I)
CORE_SUB={'Research and Theory','Issues, ethics and legal aspects','Leadership and Management'}
oa={}
for fn in ['oa-sources.ndjson','oa-nonoa.ndjson']:
    for line in open(f'{W}/ji/{fn}'):
        s=json.loads(line); tops=s.get('topics') or []; tot=sum(t['count'] for t in tops) or 1
        nt=[t for t in tops if (t['field']['display_name']=='Nursing' and t['subfield']['display_name'] in CORE_SUB) or re.search(r'nurs|midwif',t['display_name'] or '',re.I)]
        rec={'share':round(sum(t['count'] for t in nt)/tot,2),'topics':len(nt),'topField':None}
        for i in [s.get('issn_l')]+(s.get('issn') or []):
            if i: oa.setdefault(i,rec)
nlm={}
for r in json.load(open(f'{W}/nlm/subject-serials.json')):
    for i,_ in r['issn']: nlm[i]=r['subjects']
cin={x['issn']:x for x in json.load(open(f'{W}/nu/cinahl-nursing-subject.json'))}
cinAll={x['issn']:x for x in json.load(open(f'{W}/nu/cinahl-complete.json'))}
sci={}
for x in json.load(open(f'{W}/nu/scielo-nursing.json')):
    for i in set([x['issn'],x['eissn']]+(x['issns'] or [])):
        if i: sci[i]=x
def signals(title,publisher,ids):
    s={}
    s['NLM']=any('Nursing' in nlm.get(i,[]) for i in ids)
    s['CINAHL']=any(i in cin for i in ids)
    s['SCIELO']=any(i in sci and any('NURSING' in (w or '').upper() for w in sci[i]['wos']) for i in ids)
    o=next((oa[i] for i in ids if i in oa),None)
    s['OA']=bool(o and o['share']>=0.5 and o['topics']>=3); s['oaShare']=o['share'] if o else None
    s['PUB']=bool(PUB.search(publisher or '')); s['TITLE']=bool(NARROW.search(title or ''))
    n=sum([s['NLM'],s['CINAHL'],s['SCIELO'],s['OA'],s['PUB']])
    some=(s['oaShare'] or 0)>=0.25
    if n>=2 or (n>=1 and s['TITLE']): t='A'
    elif n==1 or (s['TITLE'] and some): t='B'
    elif s['TITLE']: t='C'
    else: t='X'
    s['subjectSignals']=n; s['tier']=t; return s
exp=json.load(open(f'{W}/nu/export.json'))
res={'needsReview':[],'netNew':[]}
for r in exp['nr']:
    ids=[i for i in (r['issn'],r['eissn']) if i]; res['needsReview'].append({'id':r['id'],'title':r['title'],'issn':r['issn'],'eissn':r['eissn'],'publisher':r['publisher'],'homepage':r['homepage'],'basis':r['basis'],'scope':signals(r['title'],r['publisher'],ids)})
pool=json.load(open(f'{W}/nu/pool.json'))
for m in pool['netNew']:
    m['scope']=signals(m['title'],m['publisher'],m['issns']); res['netNew'].append(m)
# Journals a catalogue says have ENDED are not sent for evidence calls (their reason is recorded and they stay held): NLM publication dates that are closed with no other live
# signal, or CINAHL indexing that stopped before 2024 with no live NLM/undated record.
def nlmstate(m):
    n=m.get('nlm')
    if not n: return None
    t=(n.get('issued') or '').strip()
    if not t: return 'undated'
    if re.search(r'-\s*\]?\s*$',t): return 'open'
    if re.search(r'-\s*\[?\s*c?\d{4}',t) or re.search(r'-\s*\[?\d{4}\]?\s*\.?$',t): return 'closed'
    return 'undated'
def cinstop(m):
    c=m.get('cinahl')
    if not c: return None
    st=(c.get('idxStop') or '').strip()
    if not st: return 'current'
    y=int(st[-4:]) if re.search(r'\d{4}$',st) else 0
    return 'stopped<2024' if y<2024 else 'stopped>=2024'
for m in res['netNew']:
    if m['scope']['tier'] in ('C','X'): continue
    st,cs=nlmstate(m),cinstop(m)
    if st=='closed' and cs in (None,'stopped<2024'): m['skipReason']='NLM publication dates are closed'
    elif cs=='stopped<2024' and st in (None,'closed','undated'): m['skipReason']='CINAHL stopped indexing before 2024'
json.dump(res,open(f'{W}/nu/scope-scored.json','w'),ensure_ascii=False)
for k in res: print(k,len(res[k]),dict(collections.Counter(x['scope']['tier'] for x in res[k])))
