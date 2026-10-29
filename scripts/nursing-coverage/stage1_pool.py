"""
Stage 1: pool every source, cluster by ISSN, de-duplicate against the whole catalogue (all statuses and departments, including the journals inserted in earlier runs), score Nursing scope.

  python3 stage1_pool.py        ->  data/nursing-coverage/work/stage1.json  and docs/nursing-coverage-2026-10-29/stage1-counts.json

Pooling rules (what each source contributes; the point is to miss nothing and then let independent signals decide):
  OpenAlex  sources with >= 25% nursing-topic weight, or a nursing word in the title/alternate titles (the field filter alone also returns Nutrition and Dietetics)
  CINAHL    EVERY "Academic Journal" of every edition's coverage list (magazines, trade publications, reports, books are not journals and are not pooled)
  NLM       every serial under the Nursing-specific headings
  DOAJ      Nursing/Midwifery subject, or a multilingual nursing term in title / alternative title / keywords
  SciELO    every journal of every collection;  KoreaMed every journal (renames linked);  J-STAGE every journal in the official list
A pooled record becomes a candidate only if independent nursing evidence supports it (tier A/B/C below); all others are counted as "no independent Nursing evidence" and dropped.
Identity: ISSN, eISSN and ISSN-L on one record, KoreaMed "now published as" pairs, and J-STAGE/SciELO/NLM/DOAJ/OpenAlex records that share an identifier are ONE journal.  A cluster that touches a
catalogue identifier is 'held'.  Otherwise the same normalised title, or the same base title (subtitle, translation or edition removed), as a catalogue journal is a 'title_conflict' (never net-new).
Scope tiers (a title word is the journal's own claim, not an independent signal):
  subject signals: NLM Nursing heading | CINAHL Nursing discipline | SciELO WoS area NURSING | OpenAlex topics >= 50% nursing (>= 3 topics) | DOAJ Nursing subject | a nursing society or association (KAMJE, J-STAGE organisation, publisher)
  A: two or more subject signals, or one plus a nursing word in the title.   B: exactly one subject signal, or a title word with 25-49% nursing topics.   C: a title word only.   X: nothing.
"""
import json,os,re,sys,glob,collections
sys.path.insert(0,os.path.dirname(__file__)); from common import *
os.makedirs(WORK,exist_ok=True); counts={}
uf=UF(); recs=[]
# ISSNs recovered by recover_issn.py (exact title + same publisher + unique Crossref journal); absent before that script has run
try: _rec=json.load(open(f'{WORK}/recovered-issns.json'))
except Exception: _rec=[]
recovered={f"{o['src']}|{norm(o['title'])}|{norm(o['publisher'])}":o['recovered'] for o in _rec if o.get('recovered')}
def add(src,title,issns,publisher=None,homepage=None,country=None,alts=None,facts=None):
    ids=uf.link([fmt_issn(i) for i in issns])
    if not ids and f"{src}|{norm(title)}|{norm(publisher)}" in recovered:
        ids=uf.link(recovered[f"{src}|{norm(title)}|{norm(publisher)}"]); facts=dict(facts or {}); facts['issnRecovered']='Crossref journal record, exact title + publisher, unique'
    recs.append({'src':src,'title':title or '','alts':[a for a in (alts or []) if a],'issns':ids,'publisher':publisher,'homepage':homepage,'country':country,'facts':facts or {}}); return recs[-1]
# --- catalogue
cat=json.load(open(f'{RAW}/catalogue-snapshot.json'))['all']; catIds=set()
for j in cat: catIds.update(uf.link([j['issn'],j['eissn']]))
# --- OpenAlex
CORE={'Research and Theory','Issues, ethics and legal aspects','Leadership and Management'}
n=0;pooled=0
for line in open(f'{RAW}/openalex-nursing.ndjson'):
    s=json.loads(line); n+=1; tops=s.get('topics') or []; tot=sum(t['count'] or 0 for t in tops) or 1
    nt=[t for t in tops if (t['field']=='Nursing' and t['subfield'] in CORE) or re.search(r'nurs|midwif',t['name'] or '',re.I)]
    share=sum(t['count'] or 0 for t in nt)/tot; alts=s.get('alternate_titles') or []
    by={str(c['year']):c['works_count'] for c in (s.get('counts_by_year') or [])}
    ids=[s.get('issn_l')]+(s.get('issn') or [])
    uf.link([fmt_issn(i) for i in ids])      # identity links even if not pooled
    if share>=0.25 or NARROW.search(s['display_name'] or '') or any(NARROW.search(a) for a in alts):
        add('OpenAlex',s['display_name'],ids,s.get('host_organization_name'),s.get('homepage_url'),s.get('country_code'),alts,{'oaId':s['id'].replace('https://openalex.org/',''),'share':round(share,2),'nTopics':len(nt),'worksCount':s.get('works_count'),'byYear':by,'isInDoaj':s.get('is_in_doaj')}); pooled+=1
counts['OpenAlex']={'read':n,'pooled':pooled}
# --- CINAHL
cin={};subj=set();n=0
for f in sorted(glob.glob(f'{RAW}/cinahl/*-coverage.json')):
    for r in json.load(open(f)):
        n+=1
        if r['type']!='Academic Journal': continue
        i=fmt_issn(r['issn']); 
        if not i: continue
        c=cin.setdefault(i,{'title':r['title'],'publisher':r['publisher'],'country':r['country'],'peer':r['peer'],'editions':set(),'policies':set(),'current':False,'stops':set()})
        c['editions'].add(r['edition']); c['policies'].add(r['policy'])
        if not (r['idxStop'] or '').strip(): c['current']=True
        else: c['stops'].add(r['idxStop'])
for f in sorted(glob.glob(f'{RAW}/cinahl/*-subject.json')):
    for r in json.load(open(f)):
        if r['discipline']=='Nursing' and fmt_issn(r['issn']): subj.add(fmt_issn(r['issn']))
for i,c in cin.items():
    add('CINAHL',c['title'],[i],c['publisher'],None,c['country'],None,{'editions':sorted(c['editions']),'policy':sorted(c['policies']),'indexingCurrent':c['current'],'indexingStops':sorted(c['stops'])[:3],'peer':c['peer'],'nursingDiscipline':i in subj})
counts['CINAHL']={'coverageRowsReadAcrossEditions':n,'distinctAcademicJournalIssns':len(cin),'nursingDisciplineIssns':len(subj)}
# --- NLM
NLMH=set(); 
nlm=json.load(open(f'{RAW}/nlm-nursing-serials.json'))
for r in nlm:
    pairs=[i for i,_ in r['issn']]
    hs=[h for h in r['headings'] if h!='Palliative Care']
    add('NLM Catalog',r['title'],pairs,r['publisher'],None,r['country'],r.get('altTitles'),{'uid':r['uid'],'headings':hs,'issued':r['issued'],'currentlyIndexed':r['currentlyIndexed']})
counts['NLM Catalog']={'read':len(nlm),'withValidIssn':sum(1 for r in recs if r['src']=='NLM Catalog' and r['issns'])}
# --- DOAJ
dj=json.load(open(f'{RAW}/doaj-nursing.json'))
for r in dj: add('DOAJ',r['title'],[r['issn'],r['eissn']],r['publisher'],r['url'],r['country'],[r['altTitle']],{'selectedBy':r['selectedBy'],'licence':r['licence'],'licenceAttributes':r['licenceAttributes'],'doajUrl':r['doajUrl']})
counts['DOAJ']={'read':len(dj)}
# --- SciELO
sc=json.load(open(f'{RAW}/scielo-all.json'))
for r in sc: add('SciELO',r['title'],[r['issn'],r['eissn']]+(r['issns'] or []),r['publisher'],r['homepage'],r['country'],None,{'collection':r['collection'],'status':r['status'],'wos':r['wos'],'areas':r['areas'],'evidenceUrl':r['evidenceUrl']})
counts['SciELO']={'read':len(sc)}
# --- KoreaMed + KAMJE
km=json.load(open(f'{RAW}/koreamed.json')); kamje=json.load(open(f'{RAW}/kamje-members.json')); kmap={norm(x['title']):x for x in kamje}
for r in km:
    ids=[r['issn']]+([r['nowPublishedAs']['issn']] if r['nowPublishedAs'] else []); t=(r['nowPublishedAs'] or r)['title']
    k=kmap.get(norm(t)) or kmap.get(norm(r['title']))
    add('KoreaMed',t,ids,None,None,'KR',[r['title'] if r['nowPublishedAs'] else None,r['abbr']],{'koreamedId':r['koreamedId'],'formerTitle':r['title'] if r['nowPublishedAs'] else None,'evidenceUrl':r['evidenceUrl'],'societyKo':(k or {}).get('societyKo'),'kamjeMember':bool(k)})
counts['KoreaMed']={'read':len(km),'renameRelations':sum(1 for r in km if r['nowPublishedAs']),'kamjeMemberRows':len(kamje)}
# --- J-STAGE
js=json.load(open(f'{RAW}/jstage-journals.json'))
for r in js: add('J-STAGE',r['title'],[r['issn'],r['eissn'],r['issnL']],r['organization'],r['url'] or r['jstageUrl'],'JP',None,{'cd':r['cd'],'organization':r['organization'],'currentPubdate':r['currentPubdate'],'suspended':r['suspended'],'totalArticles':r['totalArticles'],'pubmed':r['pubmed'],'jstageUrl':r['jstageUrl'],'type':r['type']})
counts['J-STAGE']={'read':len(js)}
# --- clusters
cl=collections.defaultdict(list); noissn=[]
for r in recs:
    if r['issns']: cl[uf.f(r['issns'][0])].append(r)
    else: noissn.append(r)
counts['recordsPooled']=len(recs); counts['recordsWithoutValidIssn']=collections.Counter(r['src'] for r in noissn)
rootRows=collections.defaultdict(list)
for j in cat:
    for i in {j['issn'],j['eissn']}:
        if i and VALID.match(i): rootRows[uf.f(i)].append(j)
ctitle=collections.defaultdict(list); cbase=collections.defaultdict(list)
for j in cat:
    ctitle[norm(j['title'])].append(j)
    b=base(j['title'])
    if len(b)>=8: cbase[b].append(j)
runIssns={}
for f,label in (('docs/nursing-expansion-2026-10-28/manifest-frozen.json','Nursing expansion run (80)'),('docs/import-manifests/nlm-2026-10-28-247b5154/passed.json','NLM import run (70)')):
    try:
        for r in json.load(open(os.path.join(ROOT,f)))['rows']:
            for i in (r['issn'],r.get('eissn')):
                if i: runIssns[i]=label
    except Exception: pass
prev={}
for f in ('docs/nursing-assessment-2026-10-28/held.json','docs/nursing-expansion-2026-10-28/frozen-hand-and-rename-holds.json'):
    try:
        for h in json.load(open(os.path.join(ROOT,f))):
            ids=h.get('issns') or [h.get('issn')]
            for i in ids:
                if i: prev[i]={'set':h.get('set') or 'rename/hand hold','primary':h.get('primary') or h.get('reason'),'scopeTier':h.get('scopeTier'),'publicationClass':h.get('publicationClass')}
    except Exception: pass
out=[];nrout=[];stat=collections.Counter();bysrc=collections.defaultdict(collections.Counter)
def sig(group):
    s={'NLM':False,'CINAHL':False,'SCIELO':False,'OA':False,'DOAJ':False,'SOCIETY':False,'TITLE':False}; ev={}
    for r in group:
        f=r['facts']
        if r['src']=='NLM Catalog' and f.get('headings'): s['NLM']=True; ev['nlmHeadings']=f['headings']
        if r['src']=='CINAHL' and f.get('nursingDiscipline'): s['CINAHL']=True
        if r['src']=='SciELO' and any('NURSING' in (w or '').upper() for w in f.get('wos',[])): s['SCIELO']=True; ev['scieloWos']=f['wos']
        if r['src']=='OpenAlex' and f.get('share',0)>=0.5 and f.get('nTopics',0)>=3: s['OA']=True
        if r['src']=='DOAJ' and f['selectedBy'].get('doajSubject'): s['DOAJ']=True
        if r['src']=='KoreaMed' and f.get('societyKo') and '간호' in f['societyKo']: s['SOCIETY']=True; ev['kamjeSociety']=f['societyKo']
        if r['src']=='J-STAGE' and PUBWORD.search(f.get('organization') or ''): s['SOCIETY']=True; ev['jstageOrganization']=f['organization']
        if r['src'] not in('J-STAGE','KoreaMed') and PUBWORD.search(r['publisher'] or ''): s['SOCIETY']=True; ev.setdefault('publisher',r['publisher'])
        if NARROW.search(r['title'] or '') or any(NARROW.search(a) for a in r['alts']): s['TITLE']=True
    share=max([r['facts'].get('share',0) for r in group if r['src']=='OpenAlex'] or [0])
    n=sum(s[k] for k in('NLM','CINAHL','SCIELO','OA','DOAJ','SOCIETY'))
    if n>=2 or (n>=1 and s['TITLE']): t='A'
    elif n==1 or (s['TITLE'] and share>=0.25): t='B'
    elif s['TITLE']: t='C'
    else: t='X'
    return {**s,'subjectSignals':n,'oaShare':share,'tier':t,'evidence':ev}
for root,group in cl.items():
    ids=sorted({i for r in group for i in r['issns']}); rows=[]
    for i in ids: rows+=rootRows.get(uf.f(i),[])
    rows=list({q['id']:q for q in rows}.values())
    for r in group: bysrc[r['src']]['records']+=1
    srcs=sorted({r['src'] for r in group})
    if rows:
        j=rows[0]; exact=any(i in catIds for i in ids)
        for q in rows:
            if q['status']=='NeedsReview' and q['domain']=='Nursing':      # existing record: re-scored with the new sources, preview only
                nrout.append({'id':q['id'],'title':q['title'],'issn':q['issn'],'eissn':q['eissn'],'scope':sig(group),'sources':[{'source':r['src'],'facts':r['facts']} for r in group]})
        stat['held in catalogue']+=1
        lab={runIssns[i] for i in ids if i in runIssns}
        for l in lab: stat['  of which inserted by: '+l]+=1
        for s in srcs: bysrc[s]['held in catalogue']+=1
        continue
    titles={r['title'] for r in group}|{a for r in group for a in r['alts']}
    m=None;how=None
    for t in titles:
        if ctitle.get(norm(t)): m=ctitle[norm(t)]; how='same normalised title'; break
    if not m:
        for t in titles:
            b=base(t)
            if len(b)>=8 and cbase.get(b): m=cbase[b]; how='same base title (subtitle, translation or edition removed)'; break
    s=sig(group)
    if s['tier']=='X': stat['no independent Nursing evidence']+=1; [bysrc[x].update(['no independent Nursing evidence']) for x in srcs]; continue
    c={'key':ids[0],'issns':ids,'title':sorted(group,key=lambda r:('KoreaMed J-STAGE NLM Catalog SciELO DOAJ OpenAlex CINAHL'.split().index(r['src'].split()[0]) if r['src'].split()[0] in 'KoreaMed J-STAGE NLM Catalog SciELO DOAJ OpenAlex CINAHL'.split() else 9))[0]['title'],'altTitles':sorted({a for r in group for a in r['alts']}|{r['title'] for r in group}),'publisher':next((r['publisher'] for r in group if r['publisher']),None),'homepage':next((r['homepage'] for r in group if r['homepage']),None),'country':next((r['country'] for r in group if r['country']),None),
       'sources':[{'source':r['src'],'facts':r['facts']} for r in group],'scope':s,'previously':next((prev[i] for i in ids if i in prev),None)}
    if m: c['dedupe']='title_conflict'; c['conflict']={'how':how,'catalogueTitle':m[0]['title'],'status':m[0]['status'],'domain':m[0]['domain'],'id':m[0]['id']}; stat['title conflict']+=1; [bysrc[x].update(['title conflict']) for x in srcs]
    else: c['dedupe']='net_new'; stat['net-new candidate (tier %s)'%s['tier']]+=1; [bysrc[x].update(['net-new candidate']) for x in srcs]
    out.append(c)
counts['clusters']=len(cl); counts['summary']=dict(stat); counts['bySource']={k:dict(v) for k,v in bysrc.items()}
counts['previouslyHeld']=sum(1 for c in out if c['previously'])
json.dump(out,open(f'{WORK}/stage1.json','w'),ensure_ascii=False); json.dump(nrout,open(f'{WORK}/stage1-nr.json','w'),ensure_ascii=False); json.dump(counts,open(f'{OUT}/stage1-counts.json','w'),indent=1,ensure_ascii=False)
print(json.dumps(counts['summary'],indent=1)); print({k:dict(v) for k,v in bysrc.items()}); print('previously-held candidates present:',counts['previouslyHeld'])
