"""
Merge every source of this run into ONE pool of journals (a journal found by several sources counts once) and set it against the WHOLE production catalogue.

  python3 build_pool.py            reads data/dept-coverage/raw/*, writes data/dept-coverage/work/pool.json and a counts report

Clustering: two records are the same journal when they share ANY ISSN (ISSN, e-ISSN, ISSN-L, in any column), so print/electronic pairs and ISSN-L twins are one journal.
Against the catalogue (all statuses: Accepted, MetadataOnly, NeedsReview and every earlier import): a cluster that shares any identifier with a catalogue row is `held-identifier`;
a cluster whose normalised title (or an alternate title) equals a catalogue title under other identifiers is `title-conflict`. Neither is ever inserted. Only `net-new` goes on.
Nothing is written to any database.
"""
import json,os,sys,re,csv,glob,collections,unicodedata
sys.path.insert(0,os.path.dirname(__file__)); from ledger import RAW,ROOT
WORK=os.path.join(ROOT,'data','dept-coverage','work'); os.makedirs(WORK,exist_ok=True)
csv.field_size_limit(10**9)
def valid_issn(s):
    s=(s or '').upper()
    if not re.fullmatch(r'\d{4}-\d{3}[\dX]',s): return False
    d=s.replace('-',''); t=sum(int(d[i])*(8-i) for i in range(7)); c=(11-t%11)%11
    return d[7]==('X' if c==10 else str(c))
def nissn(s):
    s=re.sub(r'[^0-9Xx]','',str(s or '')).upper()
    return f'{s[:4]}-{s[4:]}' if len(s)==8 else None
def ntitle(t): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()

snap=json.load(open(os.path.join(RAW,'catalogue-snapshot.json')))
cat=snap['all']
byId={}; byTitle=collections.defaultdict(list)
for j in cat:
    for k in (j['issn'],j['eissn']):
        k=nissn(k)
        if k: byId.setdefault(k,j)
    byTitle[ntitle(j['title'])].append(j)

recs=[]   # one per source record
def add(**r): recs.append(r)
# --- OpenAlex (topic-evidence pools)
for f in sorted(glob.glob(os.path.join(RAW,'openalex-*.ndjson'))):
    grp=os.path.basename(f)[9:-7]
    for line in open(f):
        try: s=json.loads(line)
        except ValueError: continue            # a file still being written can end mid-line
        if s.get('type')!='journal': continue
        ids=[nissn(x) for x in (s.get('issn') or [])+[s.get('issn_l')] if x]; ids=[i for i in dict.fromkeys(ids) if i]
        cy={str(c['year']):c['works_count'] for c in (s.get('counts_by_year') or [])}
        add(src='OpenAlex',ref=s['id'],url=s['id'].replace('https://openalex.org/','https://api.openalex.org/sources/'),group=grp,title=s.get('display_name'),alts=s.get('alternate_titles') or [],issns=ids,
            issnl=nissn(s.get('issn_l')),publisher=s.get('host_organization_name'),country=s.get('country_code'),homepage=s.get('homepage_url'),isOa=s.get('is_oa'),inDoaj=s.get('is_in_doaj'),
            worksCount=s.get('works_count'),byYear=cy,topics=s.get('topics') or [],societies=s.get('societies') or [])
# --- Crossref members (official publisher lists as deposited)
for f in sorted(glob.glob(os.path.join(RAW,'crossref-*.ndjson'))):
    grp=os.path.basename(f)[9:-7]
    for line in open(f):
        s=json.loads(line); ids=[i for i in dict.fromkeys(nissn(x) for x in s['issns']) if i]
        add(src='Crossref member',ref=f"member:{s['member']}",url=f"https://api.crossref.org/journals/{ids[0]}" if ids else None,group=grp,title=s['title'],alts=[],issns=ids,publisher=s['publisher'],
            member=s['source'],recent2024=s['recent2024'],recent2025h2=s['recent2025h2'],totalDois=s['totalDois'])
# --- DOAJ
dj=os.path.join(RAW,'doaj.csv')
if os.path.exists(dj) and os.path.getsize(dj)>10**6:
    with open(dj,newline='',encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            ids=[i for i in dict.fromkeys([nissn(r.get('Journal ISSN (print version)')),nissn(r.get('Journal EISSN (online version)'))]) if i]
            if not ids: continue
            add(src='DOAJ',ref=r.get('URL in DOAJ'),url=r.get('URL in DOAJ'),group='doaj',title=r.get('Journal title'),alts=[r.get('Alternative title')] if r.get('Alternative title') else [],issns=ids,
                publisher=r.get('Publisher'),country=r.get('Country of publisher'),homepage=r.get('Journal URL'),keywords=[k.strip() for k in (r.get('Keywords') or '').split(',') if k.strip()],
                lcc=r.get('LCC Codes'),subjects=(r.get('Subjects') or '').split('|') ,inDoaj=True)
# --- NLM Catalog
nl=os.path.join(RAW,'nlm','subject-serials.json')
if os.path.exists(nl):
    for s in json.load(open(nl)):
        ids=[i for i in dict.fromkeys(nissn(x[0]) for x in s.get('issn',[])) if i]
        if not ids: continue
        add(src='NLM Catalog',ref=f"nlmcatalog:{s['uid']}",url=f"https://www.ncbi.nlm.nih.gov/nlmcatalog/{s['uid']}",group='nlm',title=s.get('title'),alts=[],issns=ids,publisher=s.get('publisher'),country=s.get('country'),
            nlmSubjects=s.get('subjects',[]),issued=s.get('issued'),indexing=s.get('indexing'),resource=s.get('resource'))
print('source records:',collections.Counter(r['src'] for r in recs))
# --- union-find over ISSNs
parent={}
def find(x):
    while parent.setdefault(x,x)!=x: parent[x]=parent[parent[x]]; x=parent[x]
    return x
for r in recs:
    ids=r['issns']
    for k in ids[1:]: parent[find(k)]=find(ids[0])
clusters=collections.defaultdict(list)
for r in recs:
    if r['issns']: clusters[find(r['issns'][0])].append(r)
print('clusters (distinct journals by ISSN):',len(clusters))
out=[]; cls=collections.Counter()
for root,rs in clusters.items():
    ids=list(dict.fromkeys(i for r in rs for i in r['issns']))
    hit=next((byId[i] for i in ids if i in byId),None)
    title=next((r['title'] for r in rs if r['src']=='OpenAlex' and r['title']),None) or next((r['title'] for r in rs if r['title']),'')
    c={'ids':ids,'validIssn':all(valid_issn(i) for i in ids),'title':title,'sources':[{k:v for k,v in r.items() if k in('src','ref','url','group','member')} for r in rs],'records':rs}
    if hit: c['class']='held-identifier'; c['heldAs']={'id':hit['id'],'title':hit['title'],'status':hit['status'],'domain':hit['domain']}
    else:
        tl=[ntitle(r['title']) for r in rs]+[ntitle(a) for r in rs for a in r.get('alts',[])]
        th=next((byTitle[t][0] for t in dict.fromkeys(tl) if t and byTitle.get(t)),None)
        if th: c['class']='title-conflict'; c['heldAs']={'id':th['id'],'title':th['title'],'status':th['status'],'domain':th['domain'],'issn':th['issn']}
        else: c['class']='net-new'
    cls[c['class']]+=1; out.append(c)
print(dict(cls))
json.dump({'builtFrom':snap['at'],'catalogueRows':len(cat),'counts':dict(cls),'clusters':out},open(os.path.join(WORK,'pool.json'),'w'),ensure_ascii=False)
