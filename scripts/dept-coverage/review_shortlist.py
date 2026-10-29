"""
Individual review outcome for every shortlisted candidate. The reviewer is an AUTOMATED reader (robots-respecting crawler, see aims_scope.py): no person has examined any of this evidence,
and the output says so for every row (`manuallyVerified: false`). New reads are made only for candidates whose official URL was resolved this round through an ISSN-matched record; candidates
whose site was already read, did not answer or is disallowed are not requested again.
Provenance per row: `directEvidence` = text read on the journal's own site (publisher-declared); aggregator metadata (OpenAlex topics, OpenAlex/Wikidata homepage copies) is listed separately and
never counted as confirmation. Outcomes: scope-supported (second kind reached), ambiguous Electrical/Electronics, page read but scope not confirmed, site inaccessible, URL unresolved.
  python3 review_shortlist.py <run-id>
"""
import csv,json,os,sys,re,time,hashlib,urllib.parse
sys.path.insert(0,os.path.dirname(__file__))
import aims_scope as A
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
W=os.path.join(ROOT,'data','dept-coverage6','work'); D=os.path.join(ROOT,'docs','dept-coverage7-2026-10-29'); RUN=sys.argv[1]; TODAY=time.strftime('%Y-%m-%d',time.gmtime())
rows=list(csv.DictReader(open(os.path.join(ROOT,'docs','dept-coverage6-2026-10-29','manual-review-shortlist.csv'))))
res=json.load(open(f'{W}/resolved-urls.json')); s1=json.load(open(f'{W}/stage1b.json')); sc=json.load(open(f'{W}/scope.json'))
bykey={}
for l in ('ready','site'):
    for r in s1[l]: bykey[tuple(r['ids'])]=r
byiss={i:r for k,r in bykey.items() for i in k}
WEAK={'control system','control systems','transformer','transformers','sensor','sensors','electronic','electronics','communication system','communication systems','communication network','communication networks','applied microbiology','cell culture','recombinant','bioenergy','embedded system','embedded systems','magnetics','dielectric','dielectrics','power generation','power distribution'}
def strong(h,d):
    hh={k:[x for x in v if x not in WEAK] for k,v in (h or {}).items()}; own=len(hh.get(d,[])); oth=max([len(v) for k,v in hh.items() if k!=d]+[0]); return own,oth
def paths(final):
    p=urllib.parse.urlparse(final); base=f'{p.scheme}://{p.netloc}'; m=re.match(r'(.*?/index\.php/[^/]+)',p.path)
    roots=[base+m.group(1)] if m else [base]
    return [r+s for r in roots for s in ('/about','/about/editorialPolicies','/aims-and-scope','/aims-scope')][:4]
def read(url,dept):
    k,o=A.one({'key':'x','homepage':url})
    if o['status']!='ok': return o
    texts=[]; 
    for u in paths(o['pages'][0]['url']):
        st,h,f=A.get(u)
        if h:
            t=A.text_of(h); texts.append(t); o['pages'].append({'url':f,'status':st,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sha256':hashlib.sha256(t.encode()).hexdigest()})
            if len(texts)>=2: break
    full=' '.join(texts)
    for d,rx in A.PHR.items(): o['hits'][d]=sorted(set(o['hits'].get(d,[]))|{m.group(0).lower() for m in rx.finditer(full)})[:12]
    return o
out=[]
for r in rows:
    ids=tuple(x.strip() for x in r['issn'].split(';')); cand=byiss.get(ids[0]); d=r['department']
    key=cand['key'] if cand else None; o=sc.get(key) if key else None
    resolved=res.get(r['rank'],[]); newurl=None
    row={'rank':int(r['rank']),'department':d,'title':r['title'],'issn':r['issn'],'publisher':r['publisher'],'currentPublication':r['currentPublication'],'subjectSignal':r['oneStrongSubjectSignal'],'subjectSignalProvenance':'OpenAlex topic analysis of the journal\'s articles (aggregator, not the journal\'s own statement)' if 'OpenAlex' in r['oneStrongSubjectSignal'] else 'journal title / society (direct)',
         'officialUrl':r['officialUrl'] or '','urlProvenance':'','reviewer':f'automated reader (robots-respecting crawler, run {RUN})','manuallyVerified':False,'verificationDate':TODAY,'evidenceUrls':[],'directEvidence':'none','outcome':'','nextStep':''}
    if row['officialUrl']: row['urlProvenance']='listing / OpenAlex homepage copy (aggregator); not re-requested this round'
    if not row['officialUrl'] and resolved:
        cands=[x for x in resolved if x['url'].startswith('http')]
        if cands:
            pick=sorted(cands,key=lambda x:(not x['direct']))[0]; row['officialUrl']=pick['url']; row['urlProvenance']=f"{pick['source']}, matched on ISSN {pick['identifier']}"+('' if pick['direct'] else ' (aggregator / community copy, not publisher-declared)')
            o=read(pick['url'],d); newurl=True
    if not row['officialUrl']: row['outcome']='HOLD: official URL unresolved (no ISSN-matched record gives a homepage)'; row['nextStep']='A person searches the publisher or society site by ISSN and supplies the URL.'
    else:
        st=(o or {}).get('status','no entry'); stb=st.split(' (')[0]
        if stb=='ok':
            own,oth=strong(o.get('hits'),d); pages=[p for p in o.get('pages',[])]
            row['evidenceUrls']=[p['url'] for p in pages][:4]
            row['verificationDate']=(pages[0]['at'][:10] if pages else TODAY)
            if own>=3 and oth>=3: row['outcome']=f'HOLD: ambiguous between Electrical and Electronics ({own} vs {oth} department phrases on the official pages)'; row['directEvidence']='official pages read; scope text names both neighbouring departments'; row['nextStep']='A person decides Electrical vs Electronics from the aims and scope under the existing taxonomy.'
            elif own>=3 and own>=2*max(oth,1): row['outcome']=f'SCOPE SUPPORTED by the journal\'s own pages ({own} department phrases, clear lead): second kind reached by automated reading'; row['directEvidence']='official pages read (direct)'; row['nextStep']='Run the normal gates (publication, publisher, rename); a person may still confirm.'
            else: row['outcome']=f'HOLD: official pages read, scope not confirmed ({own} strong department phrase(s))'; row['directEvidence']='official pages read; no department scope statement found'; row['nextStep']='A person reads the journal\'s aims and scope at the URL and records the sentence that names the department.'
        elif stb.startswith('robots'): row['outcome']='HOLD: robots.txt disallows automated reading of the official page'; row['nextStep']='A person opens the URL and records the aims-and-scope sentence.'
        elif stb=='unreachable': row['outcome']='HOLD: official site did not answer'; row['nextStep']='A person opens the URL (or an alternative) and records the aims-and-scope sentence.'
        else: row['outcome']='HOLD: site not read ('+st+')'; row['nextStep']='A person opens the URL and records the aims-and-scope sentence.'
        if newurl and o and o.get('status')=='ok' and key: sc[key]=o
    out.append(row)
json.dump(sc,open(f'{W}/scope.json','w'),ensure_ascii=False)
json.dump(out,open(f'{D}/shortlist-review-outcomes.json','w'),indent=1,ensure_ascii=False)
with open(f'{D}/shortlist-review-outcomes.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=[k for k in out[0].keys()]); w.writeheader()
    for x in out: x2=dict(x); x2['evidenceUrls']=' | '.join(x['evidenceUrls']); w.writerow(x2)
import collections
print(collections.Counter(x['outcome'].split(':')[0]+':'+x['outcome'].split(':')[1][:55] for x in out).most_common(12))
