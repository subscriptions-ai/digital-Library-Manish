"""
Ranked manual-review shortlist from the unresolved single-evidence candidates (round-5 state). A candidate is shortlisted only if
  identity    valid ISSN(s), a publisher (listed or from a title-matched Crossref/OpenAlex record), no catalogue duplicate or title conflict (they are net-new by construction)
  publication Crossref publisher deposits show >=3 works in 2024-26, in >=2 of those years, >=1 in 2025-26 (looked up here for the strongest candidates)
  subject     exactly the ONE kind of department evidence it has is strong (title specific term, OpenAlex topics strong, or a society list)
and its own site could not give a second kind (unreadable, robots-disallowed, no homepage, or a readable page without department text). Ranked by subject strength, then publication volume.
For each: the official URL to open and the exact missing evidence. Writes CSV + Markdown. No web page is crawled by this script (Crossref/OpenAlex/PubMed APIs only).
"""
import json,os,sys,csv,subprocess,re,collections
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
W=os.path.join(ROOT,'data','dept-coverage5','work'); OUT=os.path.join(ROOT,'docs','dept-coverage6-2026-10-29')
s1=json.load(open(f'{W}/stage1b.json')); s2=json.load(open(f'{W}/stage2b.json')); sc=json.load(open(f'{W}/scope.json')); cl=json.load(open(f'{W}/classified.json'))
have=json.load(open(f'{W}/pubevidence.json'))
H={h['key']:h for h in s2['held']}
cands=[r for l in ('ready','site') for r in s1[l] if H.get(r['key'],{}).get('why','').startswith('one kind')]
def strength(r):
    v=cl.get(r['key']) or {}; d=r['dept']; f=r['families']; sh=v.get('shares',{}); lx=(v.get('lexicon') or {}).get('share',{})
    if 'society' in f: return 0.9,'society list + title/topics leg'
    if 'topics' in f:
        s=max(lx.get(d,0),sh.get(d,0)+(sh.get('AMBIGUOUS_ELECTRICAL',0) if d=='Electrical Engineering' else 0))
        ts=v.get('topicsStrict'); 
        return (0.6+s/2 if (ts and ts['dept']==d and ts['confidence']=='high') else s),f'OpenAlex topics: {round(s*100)}% of works in {d} topics'+(' (strict rule met)' if ts and ts['dept']==d and ts['confidence']=='high' else '')
    if 'title' in f: return 0.5,'specific department term in the title'
    return 0.2,'publisher list / catalogue grouping only'
rows=[]
for r in cands:
    st,why=strength(r)
    if st<0.5: continue
    rows.append((st,why,r))
rows.sort(key=lambda x:-x[0]); rows=rows[:250]
todo=[{'key':r['key'],'title':r['title'],'issn':r['ids'][0],'eissn':r['ids'][1] if len(r['ids'])>1 else None} for _,_,r in rows if r['key'] not in have]
print(len(cands),'single-evidence;',len(rows),'with a strong subject signal;',len(todo),'publication lookups needed',flush=True)
if todo:
    json.dump(todo,open(f'{W}/pub-in-sl.json','w')); subprocess.run([sys.executable,os.path.join(os.path.dirname(__file__),'publication_evidence.py'),f'{W}/pub-in-sl.json',f'{W}/pub-out-sl.json'],check=True)
    have.update(json.load(open(f'{W}/pub-out-sl.json'))); json.dump(have,open(f'{W}/pubevidence.json','w'))
def pub(r):
    e=have.get(r['key']) or {}; x=e.get('crossref')
    if not x or x['titleOverlap']<0.5: return None
    by=x['byYear']; n=sum(by.get(y,0) for y in('2024','2025','2026')); yrs=sum(1 for y in('2024','2025','2026') if by.get(y,0)>0); cur=sum(by.get(y,0) for y in('2025','2026'))
    return (n,yrs,cur,x.get('publisher')) if n>=3 and yrs>=2 and cur>=1 else None
WEAK={'control system','control systems','transformer','transformers','sensor','sensors','electronic','electronics','communication system','communication systems','communication network','communication networks','applied microbiology','cell culture','recombinant','bioenergy','embedded system','embedded systems','magnetics','dielectric','dielectrics','power generation','power distribution'}
def blocker(r):
    o=sc.get(r['key']) or {}; st=(o.get('status') or 'no entry').split(' (')[0]
    if st=='ok':
        h={k:[x for x in v if x not in WEAK] for k,v in (o.get('hits') or {}).items()}; n=len(h.get(r['dept'],[])); other=max([len(v) for k,v in h.items() if k!=r['dept']]+[0])
        if n>=3 and other>=3: return f'the site supports {r["dept"]} ({n} phrases) but also names a neighbouring department ({other} phrases): a person must choose Electrical vs Electronics under the existing taxonomy'
        return f'site readable but only {n} department phrase(s) on the pages read'
    return {'no homepage':'no official homepage found in any source','unreachable':'site did not answer','robots-disallowed':'robots.txt disallows automated reading'}.get(st,st)
out=[]
for st,why,r in rows:
    p=pub(r)
    if not p: continue
    d=r['dept']; hp=r.get('homepage') or ''
    pubn=p[3] or r.get('publisher')
    if not (pubn or '').strip(): continue
    url=hp if hp.startswith('http') else ''
    if 'springer.com/journal/' in url:
        m=re.search(r'journal/(\d+)',url); url=f'https://link.springer.com/journal/{m.group(1)}/aims-and-scope' if m else url
    missing=f'A person should open the official page and confirm in the journal\'s own aims and scope that it covers {d} (engineering / technical scope, not a general or multidisciplinary one); that would be the second, independent kind of evidence. '+('Needs an official homepage: search the publisher/society site by ISSN '+'/'.join(r['ids'])+'.' if not url else '')
    out.append({'rank':0,'department':d,'title':r['title'],'issn':'; '.join(r['ids']),'publisher':pubn,'currentPublication':f'{p[0]} Crossref works 2024-26 in {p[1]} years, {p[2]} in 2025-26','oneStrongSubjectSignal':why,'whyUnresolved':blocker(r),'officialUrl':url,'exactMissingEvidence':missing.strip(),'strengthScore':round(st,2),'volume':p[0]})
out.sort(key=lambda x:(-x['strengthScore'],-x['volume']))
for i,x in enumerate(out,1): x['rank']=i
os.makedirs(OUT,exist_ok=True)
with open(f'{OUT}/manual-review-shortlist.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(out[0].keys())); w.writeheader(); [w.writerow(x) for x in out]
print(len(out),'shortlisted; by department',dict(collections.Counter(x['department'] for x in out)))
with open(f'{OUT}/manual-review-shortlist.md','w') as f:
    f.write('# Manual-review shortlist (ranked)\n\nEach journal has confirmed identity (valid ISSN, publisher, net-new), current publication (Crossref deposits), and one strong subject signal, but no second independent kind of department evidence because its own site could not be read automatically. Nothing below is eligible yet. Ordered by subject strength, then recent volume; the full list with every column is `manual-review-shortlist.csv`.\n\n| # | Department | Journal | ISSN | Publisher | Strong signal | Why still unresolved | Official URL |\n|---|---|---|---|---|---|---|---|\n')
    for x in out[:40]: f.write(f"| {x['rank']} | {x['department'][:14]} | {x['title'][:60]} | {x['issn']} | {(x['publisher'] or '')[:28]} | {x['oneStrongSubjectSignal'][:60]} | {x['whyUnresolved']} | {x['officialUrl'][:70]} |\n")
    f.write('\n**Exact missing evidence for every row:** the journal\'s own aims-and-scope statement confirming the department (a second, independent kind of evidence). The person records the URL and the sentence; nothing else is needed for the pipeline to re-run (current publication, identity and publisher are already evidenced).\n')
