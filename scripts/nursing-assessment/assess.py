"""
Nursing public-catalogue assessment (PREVIEW ONLY: reads local files, writes local files, touches no database).

  python3 assess.py <work-dir> [--jstage nu/jstage-evidence.json]

Inputs under <work-dir>: nu/export.json (catalogue snapshot), nu/scope-scored.json, nu/nr-evidence.json (NeedsReview publication facts), nu/nn-evidence.json (net-new publication facts),
nu/pool.json, nu/src/doaj.csv, nu/cinahl-complete.json, nu/scielo-nursing.json, nlm/nlm-records.json (NLM "currently indexed"), nlm/subject-serials.json, ji/*.ndjson (ISSN-L links), optional J-STAGE facts.

Publication evidence (reliable, official or indexer-backed; no single numeric minimum is a rejection rule on its own):
  P-A  any of:  (a) at least 3 works in 2024-2026 in Crossref/OpenAlex (title overlap >= 0.5) or PubMed;
                (b) at least 1 such work AND an independent "currently published" statement: NLM currently-indexed, CINAHL indexing without a stop date, DOAJ listing;
                (c) SciELO status "current" (the national platform that hosts the journal);
                (d) J-STAGE (JST, the host platform): at least 1 article in 2025-2026, or 3 in 2024-2026.
  P-B  something, but not enough to publish on: 1-2 recent works, or a currently-indexed statement with no recent work, or last work in 2023 -> hold for the official-site check
  P-C  nothing recent anywhere; P-I  recent works only under a title that does not match (identity unconfirmed)
Eligibility for MetadataOnly: scope tier A (tier B only with official aims-and-scope evidence, not yet collected), P-A, valid ISSN and a publisher, no catalogue duplicate/cluster collision,
no title conflict, one record per cluster.  Eligibility for Accepted (full text): ALSO a DOAJ declaration whose every licence allows commercial use (same rule as src/lib/doajCatalogue.ts).
"""
import json,re,sys,csv,collections,unicodedata
W=sys.argv[1]; JS=sys.argv[sys.argv.index('--jstage')+1] if '--jstage' in sys.argv else None
csv.field_size_limit(10**9)
VALID=re.compile(r'^\d{4}-\d{3}[\dX]$')
def issn_ok(v):
    if not v or not VALID.match(v): return False
    d=v.replace('-',''); s=sum(int(d[i])*(8-i) for i in range(7)); c=(11-s%11)%11
    return d[7]==('X' if c==10 else str(c))
norm=lambda t:re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()
def base(t):
    t=re.split(r'\s[:=/|]\s|\s=\s|\s-\s|\(|\[',(t or '').lower())[0]; t=re.sub(r'\b(english edition|online|print|international edition|revista|journal of the|the)\b','',t); return norm(t)
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
    for i in ids: uf.f(i)
    return ids
d=json.load(open(f'{W}/nu/export.json')); cat=d['all']; byId={j['id']:j for j in cat}
for j in cat: link([j['issn'],j['eissn']])
for fn in ['oa-sources.ndjson','oa-nonoa.ndjson']:
    for line in open(f'{W}/ji/{fn}'):
        s=json.loads(line); link([s.get('issn_l')]+(s.get('issn') or []))
rootRows=collections.defaultdict(list); titles=collections.defaultdict(list); bases=collections.defaultdict(list)
for j in cat:
    for i in {j['issn'],j['eissn']}:
        if i and VALID.match(i): rootRows[uf.f(i)].append(j['id'])
    titles[norm(j['title'])].append(j['id']); b=base(j['title']); 
    if len(b)>=8: bases[b].append(j['id'])
PUBLIC={'Accepted','MetadataOnly'}
# indexer / platform facts
nlmCurrent={i for r in json.load(open(f'{W}/nlm/nlm-records.json')) for i,_ in r['issn']}
nlmCountry={}
for r in json.load(open(f'{W}/nlm/subject-serials.json')):
    for i,_ in r['issn']: nlmCountry[i]=r.get('country')
cinCur={}
for r in json.load(open(f'{W}/nu/cinahl-complete.json')):
    cinCur[r['issn']]=not (r.get('idxStop') or '').strip()
sciCur={}
for x in json.load(open(f'{W}/nu/scielo-nursing.json')):
    for i in set([x['issn'],x['eissn']]+(x['issns'] or [])):
        if i: sciCur[i]=(x['status']=='C')
doaj={}
for r in csv.DictReader(open(f'{W}/nu/src/doaj.csv',encoding='utf8',errors='ignore')):
    for k in ('Journal ISSN (print version)','Journal EISSN (online version)'):
        v=(r.get(k) or '').strip()
        if v: doaj[v]=r
NC=re.compile(r'\bNC\b|-NC|non.?commercial',re.I)
def doajAccepted(ids):
    r=next((doaj[i] for i in ids if i in doaj),None)
    if not r: return None
    lic=[x.strip() for x in (r.get('Journal license') or '').split(',') if x.strip()]
    nc=bool(re.search(r'no commercial',r.get('License attributes') or '',re.I)) or any(NC.search(l) for l in lic)
    return {'listed':True,'licence':', '.join(lic),'acceptedEligible':bool(lic) and not nc}
jst=json.load(open(f'{W}/{JS}')) if JS else {}
def pubFrom(e):
    if not e: return None
    cr=e.get('crossref'); oa=e.get('openalex')
    if cr and cr.get('publisher') and cr['titleOverlap']>=0.5: return ('Crossref',cr['publisher'])
    if oa and oa.get('host') and oa['titleOverlap']>=0.5: return ('OpenAlex',oa['host'])
    return None
def recent(e):
    out=[]
    if not e: return out
    cr=e.get('crossref'); oa=e.get('openalex'); pm=e.get('pubmed')
    if cr and cr['titleOverlap']>=0.5: out.append(('crossref',sum(cr['byYear'].get(y,0) for y in ('2024','2025','2026')),cr))
    if oa and oa['titleOverlap']>=0.5: out.append(('openalex',sum(oa['byYear'].get(y,0) for y in ('2024','2025','2026')),oa))
    if pm: out.append(('pubmed',pm['articles2024to2026'],pm))
    return out
def pubclass(ids,e,key=None):
    rec=recent(e); mx=max([n for _,n,_ in rec],default=0)
    cur=[]; 
    if any(i in nlmCurrent for i in ids): cur.append('NLM currently indexed')
    if any(cinCur.get(i) for i in ids): cur.append('CINAHL indexing current')
    if e and e.get('openalex') and e['openalex'].get('isInDoaj'): cur.append('DOAJ listed')
    if any(i in doaj for i in ids): 
        if 'DOAJ listed' not in cur: cur.append('DOAJ listed')
    sc=any(sciCur.get(i) for i in ids)
    j=jst.get(key) if key else None
    why=[]
    if mx>=3: why.append(f'{mx} works 2024-26 ({",".join(s for s,n,_ in rec if n>=3)})')
    if mx>=1 and cur: why.append(f'{mx} recent work(s) + '+', '.join(cur))
    if sc: why.append('SciELO status current')
    if j and (j['articles2025to2026']>=1 or j['articles2024to2026']>=3): why.append(f"J-STAGE {j['articles2024to2026']} articles 2024-26")
    if why: return 'P-A',why,mx,cur
    # identity problem: recent works exist only in sources whose title does not match
    ident=False
    if e:
        for s in ('crossref','openalex'):
            x=e.get(s)
            if x and x['titleOverlap']<0.5 and sum(x['byYear'].get(y,0) for y in ('2024','2025','2026'))>=3: ident=True
    if ident and mx==0: return 'P-I',['recent works exist only under a different title'],mx,cur
    last=max([(e.get('crossref') or {}).get('lastDoiYear',0),(e.get('openalex') or {}).get('lastWorkYear',0)] if e else [0])
    if mx>=1 or cur or last>=2023: return 'P-B',[f'{mx} recent work(s)' if mx else ('currently indexed: '+', '.join(cur) if cur else f'last work {last}')],mx,cur
    return 'P-C',['no work in 2024-2026 in Crossref, OpenAlex or PubMed'+('' if not e else '')],mx,cur
sc=json.load(open(f'{W}/nu/scope-scored.json')); nre=json.load(open(f'{W}/nu/nr-evidence.json')); nne=json.load(open(f'{W}/nu/nn-evidence.json'))
res={'needsReview':[],'netNew':[],'jstageCandidates':[]}
# --- existing NeedsReview
for r in sc['needsReview']:
    ids=[i for i in (r['issn'],r['eissn']) if i]; e=nre.get(r['id'])
    P,why,mx,cur=pubclass(ids,e,r['id'])
    roots={uf.f(i) for i in ids if VALID.match(i)}; others=set()
    for rt in roots: others.update(rootRows.get(rt,[]))
    others.discard(r['id']); twins=[byId[o] for o in others]
    pubTwin=[t for t in twins if t['status'] in PUBLIC]; nrTwin=[t for t in twins if t['status']=='NeedsReview']
    tmatch=set(titles.get(norm(r['title']),[]))|set(bases.get(base(r['title']),[])); tmatch.discard(r['id']); tmatch-=others
    tconf_pub=[byId[o] for o in tmatch if byId[o]['status'] in PUBLIC]; tconf_nr=[byId[o] for o in tmatch if byId[o]['status']=='NeedsReview']
    s=r['scope']; reasons=[]
    if not issn_ok(r['issn']) or (r['eissn'] and not issn_ok(r['eissn'])): reasons.append(('invalid_issn','an ISSN fails the check digit'))
    pf=None
    if not (r['publisher'] or '').strip():
        pf=pubFrom(e)
        if not pf: reasons.append(('no_publisher','no publisher recorded and none in Crossref/OpenAlex under a matching title'))
    if pubTwin: reasons.append(('duplicate_of_public','same journal as public record '+pubTwin[0]['id'][:8]+' ('+pubTwin[0]['status']+'/'+str(pubTwin[0]['domain'])+')'))
    if tconf_pub: reasons.append(('title_conflict_public','same/base title as public '+tconf_pub[0]['title'][:40]))
    if nrTwin: reasons.append(('pair_in_review','print/electronic twin also in NeedsReview'))
    if tconf_nr: reasons.append(('title_conflict_review','same/base title as another NeedsReview record'))
    if s['tier'] in ('C','X'): reasons.append(('scope_insufficient','scope tier '+s['tier']+': no independent nursing evidence'))
    elif s['tier']=='B': reasons.append(('scope_needs_official_aims','scope tier B: needs the journal\'s aims-and-scope'))
    if P=='P-I': reasons.append(('identity_unconfirmed',why[0]))
    elif P!='P-A': reasons.append(('publication_'+P.replace('-','').lower(),(why[0]) if why else ''))
    dj=doajAccepted(ids)
    rec={'id':r['id'],'title':r['title'],'issn':r['issn'],'eissn':r['eissn'],'publisher':r['publisher'],'homepage':r['homepage'] or ((e or {}).get('openalex') or {}).get('homepage'),'basis':r['basis'],'scope':s,'publication':{'class':P,'why':why,'recentMax':mx,'currentlyPublishedStatements':cur,'crossref':(e or {}).get('crossref'),'openalex':(e or {}).get('openalex'),'pubmed':(e or {}).get('pubmed'),'jstage':jst.get(r['id'])},'doaj':dj,'holdReasons':reasons}
    rec['publisherFill']=({'source':pf[0],'value':pf[1],'mode':'fill-empty only'} if pf else None)
    rec['primary']=reasons[0][0] if reasons else None
    rec['metadataOnlyEligible']=not reasons
    rec['acceptedEligible']=bool(not reasons and dj and dj['acceptedEligible'])
    if reasons and all(k.startswith('publication_p') or k=='identity_unconfirmed' for k,_ in reasons) and s['tier'] in ('A','B') and nlmCountry.get(r['issn'])=='Japan': res['jstageCandidates'].append({'key':r['id'],'issn':r['issn'],'eissn':r['eissn']})
    res['needsReview'].append(rec)
# --- net-new
nrRoots=set()
for r in sc['needsReview']:
    for i in (r['issn'],r['eissn']):
        if i and VALID.match(i): nrRoots.add(uf.f(i))
for m in sc['netNew']:
    ids=m['issns']; key=ids[0]; e=nne.get(key); s=m['scope']; reasons=[]
    if m.get('skipReason'): P,why,mx,cur='P-C',[m['skipReason']],0,[]
    elif s['tier'] in ('C','X') : P,why,mx,cur='n/a',[],0,[]
    else: P,why,mx,cur=pubclass(ids,e,key)
    if not all(issn_ok(i) for i in ids): reasons.append(('invalid_issn','an ISSN fails the check digit'))
    pf=None
    if not (m['publisher'] or '').strip():
        pf=pubFrom(e)
        if not pf: reasons.append(('no_publisher','no publisher recorded and none in Crossref/OpenAlex under a matching title'))
    if s['tier'] in ('C','X'): reasons.append(('scope_insufficient','scope tier '+s['tier']))
    elif s['tier']=='B': reasons.append(('scope_needs_official_aims','scope tier B: needs the journal\'s aims-and-scope'))
    if P=='P-I': reasons.append(('identity_unconfirmed',why[0]))
    elif P not in ('P-A','n/a'): reasons.append(('publication_'+P.replace('-','').lower(),why[0] if why else ''))
    dj=doajAccepted(ids)
    rec={**{k:m[k] for k in('title','issns','publisher','homepage','sources')},'scope':s,'publication':{'class':P,'why':why,'recentMax':mx,'currentlyPublishedStatements':cur,'crossref':(e or {}).get('crossref'),'openalex':(e or {}).get('openalex'),'pubmed':(e or {}).get('pubmed'),'jstage':jst.get(key)},'doaj':dj,'holdReasons':reasons,'cinahl':m.get('cinahl'),'scielo':m.get('scielo'),'nlm':m.get('nlm')}
    if not rec['homepage']: rec['homepage']=((e or {}).get('openalex') or {}).get('homepage')
    rec['publisherFill']=({'source':pf[0],'value':pf[1],'mode':'fill-empty only'} if pf else None)
    rec['primary']=reasons[0][0] if reasons else None
    rec['metadataOnlyEligible']=not reasons; rec['acceptedEligible']=bool(not reasons and dj and dj['acceptedEligible'])
    if reasons and all(k.startswith('publication_p') or k=='identity_unconfirmed' for k,_ in reasons) and s['tier'] in ('A','B') and any(nlmCountry.get(i)=='Japan' for i in ids): res['jstageCandidates'].append({'key':key,'issn':ids[0],'eissn':ids[1] if len(ids)>1 else None})
    res['netNew'].append(rec)
json.dump(res,open(f'{W}/nu/assessment{"-final" if JS else ""}.json','w'),ensure_ascii=False)
for k in ('needsReview','netNew'):
    L=res[k]; print(f'\n{k}: {len(L)} | MetadataOnly-eligible {sum(1 for x in L if x["metadataOnlyEligible"])} | Accepted-eligible {sum(1 for x in L if x["acceptedEligible"])}')
    print('  publication classes:',dict(collections.Counter(x['publication']['class'] for x in L)))
    print('  primary hold reasons:',dict(collections.Counter(x['primary'] for x in L).most_common()))
print('\nJ-STAGE candidates (Japanese, A/B, otherwise held only for publication evidence):',len(res['jstageCandidates']))
