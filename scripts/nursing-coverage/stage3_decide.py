"""
Stage 3: publication evidence, identity, rename and non-journal checks, and ONE primary hold reason (+ secondary reasons) per candidate.

  python3 stage3_decide.py        reads work/stage1.json, work/evidence-api.json (or .partial), the catalogue snapshot
                                  writes work/stage3.json  and docs/nursing-coverage-2026-10-29/{candidates.json,candidates.csv,held.json,reconciliation.json}

Publication (no single threshold decides; fetch failures are never read as "inactive"):
  current    P-A: at least 3 works in 2024-26 (OpenAlex counts_by_year, Crossref, PubMed); or 1+ work AND an independent currently-published statement (NLM currently indexed,
             CINAHL indexing without a stop date, DOAJ listing); or SciELO status current; or J-STAGE's own latest publication date in 2025-26 and not suspended
  ceased     a catalogue says it ended (NLM dates closed, CINAHL indexing stopped before 2024, SciELO deceased, J-STAGE suspended) AND no work in 2024-26 was found
  uncertain  anything else: some evidence but not enough (P-B), nothing found (P-C), or recent works only under another title (P-I, identity unconfirmed)
Identity confirmed: valid ISSN check digits and at least two independent sources agree (a pooled source, or Crossref / OpenAlex / PubMed by ISSN with a matching title).
Primary reason order: invalid ISSN, title conflict, rename/continuation, non-journal, identity mismatch (recent works under another title), scope, publisher, ceased, uncertain publication, and last single-source identity.
"""
import json,os,sys,re,csv,collections,time,urllib.request,xml.etree.ElementTree as ET
sys.path.insert(0,os.path.dirname(__file__)); from common import *
cat=json.load(open(f'{RAW}/catalogue-snapshot.json'))['all']
ev={}
for fn in (f'{WORK}/evidence-api.json',f'{WORK}/evidence-api.json.partial'):
    if os.path.exists(fn): ev.update(json.load(open(fn)))
cands=json.load(open(f'{WORK}/stage1.json'))
issnRow={}
for j in cat:
    for i in (j['issn'],j['eissn']):
        if i: issnRow[i]=j
tit=[(toks(j['title']),norm(j['publisher']),j) for j in cat if len(toks(j['title']))>=2]; byTok=collections.defaultdict(list)
for k,(t,p,j) in enumerate(tit):
    for w in t: byTok[w].append(k)
def similar(c):
    out=[]; ct=toks(c['title']); pub=norm(c.get('publisher'))
    if len(ct)<2: return out
    for k in {i for w in ct for i in byTok.get(w,[])}:
        t,p,j=tit[k]; jac=len(ct&t)/len(ct|t)
        if j['issn'] in c['issns'] or j['eissn'] in c['issns']: continue
        same=bool(pub) and bool(p) and (pub==p or pub in p or p in pub)
        if jac>=0.8 or (jac>=0.6 and same): out.append({'title':j['title'],'status':j['status'],'domain':j['domain'],'jaccard':round(jac,2),'samePublisher':same})
    return sorted(out,key=lambda x:-x['jaccard'])[:3]
def nlm_relations(uid):
    url=f'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nlmcatalog&id={uid}&retmode=xml'
    for a in range(3):
        try: root=ET.fromstring(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=60).read()); break
        except Exception: root=None; time.sleep(2*(a+1))
    if root is None: return None
    out=[]
    for tr in root.iter('TitleRelated'):
        out.append({'type':(tr.findtext('TitleRelatedType') or '').strip(),'title':(tr.findtext('Title') or '').strip(),'issns':[(e.text or '').strip() for e in tr.iter('ISSN')]})
    return out
EVIN=set(json.load(open(f'{WORK}/evidence-input.json')) and [x['key'] for x in json.load(open(f'{WORK}/evidence-input.json'))]) if os.path.exists(f'{WORK}/evidence-input.json') else set()
EVIN2={x['key'] for x in json.load(open(f'{WORK}/evidence-input2.json'))} if os.path.exists(f'{WORK}/evidence-input2.json') else set()
def evidence_path(c):
    """Why a candidate did or did not enter publication-evidence collection (the 1,753 -> 1,091 + 662 reconciliation)."""
    if c['dedupe']!='net_new': return 'not a candidate (title conflict)'
    if c['scope']['tier'] in ('C','X'): return 'tier C: a title word is the only Nursing evidence (no calls)'
    oa=[s['facts'] for s in c['sources'] if s['source']=='OpenAlex']; js=[s['facts'] for s in c['sources'] if s['source']=='J-STAGE']; sc=[s['facts'] for s in c['sources'] if s['source']=='SciELO']
    nl=[s['facts'] for s in c['sources'] if s['source']=='NLM Catalog']; ci=[s['facts'] for s in c['sources'] if s['source']=='CINAHL']
    rec=max([sum(f['byYear'].get(y,0) for y in('2024','2025','2026')) for f in oa]) if oa else None
    cur=any(f['currentlyIndexed']=='Y' for f in nl) or any(f['indexingCurrent'] for f in ci) or bool(oa and any(f.get('isInDoaj') for f in oa))
    jsOK=any((f['currentPubdate'] or '')>='2025-01-01' and not f['suspended'] for f in js); scC=any(f['status']=='C' for f in sc)
    closed=any(re.search(r'-\s*\[?\s*c?\d{4}',(f['issued'] or '')) and not re.search(r'-\s*\]?\s*$',(f['issued'] or '')) for f in nl)
    stop=bool(ci) and all((not f['indexingCurrent']) and f['indexingStops'] for f in ci)
    if (rec is not None and rec>=3) or jsOK or scC or (rec is not None and rec>=1 and cur): return 'decided current from data already fetched (OpenAlex counts, J-STAGE date, SciELO status)'
    if (closed or stop) and not (rec and rec>=1): return 'a catalogue says it ended (NLM dates closed / CINAHL indexing stopped): no calls'
    return 'API evidence collected' if c['key'] in EVIN else 'API evidence not collected for this run (candidate arrived after the evidence input was written)'
def facts(c,src): return [s['facts'] for s in c['sources'] if s['source']==src]
def decide(c):
    oa,js,sc,nl,ci,dj,km=(facts(c,s) for s in('OpenAlex','J-STAGE','SciELO','NLM Catalog','CINAHL','DOAJ','KoreaMed'))
    e=ev.get(c['key']) or {}; cr=e.get('crossref'); oax=e.get('openalex'); pm=e.get('pubmed')
    yrs=('2024','2025','2026'); works={}
    for f in oa: works['OpenAlex (nursing-field fetch)']=max(works.get('OpenAlex (nursing-field fetch)',0),sum(f['byYear'].get(y,0) for y in yrs))
    if oax and oax['titleOverlap']>=0.5: works['OpenAlex by ISSN']=sum(oax['byYear'].get(y,0) for y in yrs)
    if cr and cr['titleOverlap']>=0.5: works['Crossref']=sum(cr['byYear'].get(y,0) for y in yrs)
    if pm: works['PubMed']=pm['articles2024to2026']
    mx=max(works.values(),default=0)
    cur=[]
    if any(f['currentlyIndexed']=='Y' for f in nl): cur.append('NLM currently indexed')
    if any(f['indexingCurrent'] for f in ci): cur.append('CINAHL indexing current')
    if dj or any(f.get('isInDoaj') for f in oa) or (oax and oax.get('isInDoaj')): cur.append('DOAJ listed')
    jsOK=[f for f in js if (f['currentPubdate'] or '')>='2025-01-01' and not f['suspended']]; scC=[f for f in sc if f['status']=='C']
    ended=[]
    if any(re.search(r'-\s*\[?\s*c?\d{4}',(f['issued'] or '')) and not re.search(r'-\s*\]?\s*$',(f['issued'] or '')) for f in nl): ended.append('NLM publication dates are closed')
    if ci and all((not f['indexingCurrent']) and f['indexingStops'] for f in ci): ended.append('CINAHL indexing stopped')
    if sc and all(f['status']=='D' for f in sc): ended.append('SciELO status deceased')
    if js and all(f['suspended'] for f in js): ended.append('J-STAGE marks it suspended')
    why=[]
    if mx>=3: why.append(f'{mx} works in 2024-26 ('+', '.join(k for k,v in works.items() if v>=3)+')')
    if 0<mx and cur: why.append(f'{mx} recent work(s) + '+', '.join(cur))
    if scC: why.append('SciELO status current')
    if jsOK: why.append(f"J-STAGE latest publication date {jsOK[0]['currentPubdate']}")
    ident_bad=False
    for x in (cr,oax):
        if x and x['titleOverlap']<0.5 and sum(x['byYear'].get(y,0) for y in yrs)>=3 and mx==0: ident_bad=True
    if why: pub='current'; pclass='P-A'
    elif ended and mx==0: pub='ceased'; pclass='ceased'
    elif ident_bad: pub='uncertain'; pclass='P-I'
    elif mx>=1 or cur: pub='uncertain'; pclass='P-B'
    else: pub='uncertain'; pclass='P-C'
    # latest confirmed date and its URL
    best=None
    for f in js:
        if f['currentPubdate']: d=f['currentPubdate']; 
        else: continue
        if not best or d>best[0]: best=(d,f['jstageUrl'],'J-STAGE current pubdate')
    for src,x,u in (('OpenAlex',oax,'https://api.openalex.org/sources/issn:'),('Crossref',cr,'https://api.crossref.org/journals/')):
        if x:
            ly=x.get('lastWorkYear') if src=='OpenAlex' else x.get('lastDoiYear')
            if ly: 
                d=str(ly)
                if not best or d>best[0][:4]: best=(d,u+x['via'],src+' last year with works')
    for f in oa:
        ys=[int(y) for y,n in f['byYear'].items() if n]
        if ys:
            d=str(max(ys))
            if not best or d>best[0][:4]: best=(d,'https://api.openalex.org/sources/'+f['oaId'],'OpenAlex last year with works')
    return {'class':pclass,'status':pub,'why':why,'works2024to2026':works,'currentStatements':cur,'endedStatements':ended,'latestConfirmed':({'date':best[0],'url':best[1],'basis':best[2]} if best else None),
            'crossref':{k:cr[k] for k in('via','title','publisher','totalDois','lastDoiYear','titleOverlap')} if cr else None,'openalexByIssn':{k:oax[k] for k in('via','title','host','homepage','worksCount','lastWorkYear','titleOverlap')} if oax else None,'pubmed':pm}
rows=[];cnt=collections.Counter()
for c in cands:
    p=decide(c); ids=c['issns']; reasons=[]
    # 1 identifiers
    if not all(issn_ok(i) for i in ids): reasons.append(('invalid_issn','an identifier fails the ISSN check digit'))
    # 2 catalogue title conflict
    if c['dedupe']=='title_conflict': reasons.append(('title_conflict',f"{c['conflict']['how']}: {c['conflict']['catalogueTitle'][:50]} ({c['conflict']['status']}/{c['conflict']['domain']})"))
    # 3 rename / continuation (similarity here; NLM relations for the survivors below)
    sim=similar(c) if c['dedupe']=='net_new' else []
    if sim: reasons.append(('rename_or_near_title',f"near-identical catalogue title: {sim[0]['title'][:50]} ({sim[0]['status']}/{sim[0]['domain']}, Jaccard {sim[0]['jaccard']})"))
    # 4 non-journal
    if NONJ.search(' '.join([c['title']]+c['altTitles'][:3])): reasons.append(('non_journal_risk','the title reads as a newsletter, proceedings, directory or similar serial'))
    # 5 identity
    srcs={s['source'] for s in c['sources']}|({'Crossref'} if p['crossref'] and p['crossref']['titleOverlap']>=0.5 else set())|({'OpenAlex by ISSN'} if p['openalexByIssn'] and p['openalexByIssn']['titleOverlap']>=0.5 else set())|({'PubMed'} if p['pubmed'] and p['pubmed']['articles2024to2026']>0 else set())
    if p['class']=='P-I': reasons.append(('identity_unconfirmed','recent works exist only under a different title'))
    # 6 scope
    t=c['scope']['tier']
    if t=='C': reasons.append(('scope_insufficient','a nursing word in the title is the only evidence'))
    elif t=='B': reasons.append(('scope_single_signal','one independent Nursing signal only; needs the journal\'s aims-and-scope'))
    # 7 publisher
    pub=c['publisher'] or (p['crossref'] or {}).get('publisher') or (p['openalexByIssn'] or {}).get('host')
    if not (pub or '').strip(): reasons.append(('no_publisher','no publisher in any source'))
    # 8/9 publication
    if p['status']=='ceased': reasons.append(('publication_ceased','; '.join(p['endedStatements'])+' and no work in 2024-26'))
    elif p['status']=='uncertain': reasons.append(('publication_uncertain' if p['class']=='P-B' else ('publication_no_evidence' if p['class']=='P-C' else 'identity_unconfirmed'),f"{p['class']}: "+('works '+json.dumps(p['works2024to2026'])+' '+'; '.join(p['currentStatements']) if p['class']=='P-B' else 'no work in 2024-26 and no current statement found')))
    if p['class']!='P-I' and len(srcs)<2: reasons.append(('single_source_identity','only one source knows this ISSN: identity not independently confirmed'))
    seen=set();rs=[]
    for k,w in reasons:
        if (k,w) not in seen: seen.add((k,w)); rs.append((k,w))
    homepage=c['homepage'] or (p['openalexByIssn'] or {}).get('homepage')
    row={**c,'evidencePath':evidence_path(c),'identityCheckCalls':c['key'] in EVIN2,'publication':p,'publisherResolved':pub,'homepageResolved':homepage,'holdReasons':rs,'primary':rs[0][0] if rs else None,'eligiblePreRename':not rs,'renameSimilar':sim}
    rows.append(row); cnt[row['primary'] or 'ELIGIBLE (before the NLM relation check)']+=1
json.dump(rows,open(f'{WORK}/stage3.json','w'),ensure_ascii=False)
print(json.dumps(cnt,indent=1))
