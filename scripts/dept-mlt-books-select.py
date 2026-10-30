"""
Medical Laboratory Technology BOOKS, selection from the OTHER sources (NLM Catalog, Open Library, Open Textbook Library, Crossref, and the app's own staged DOAB/OAPEN/NCBI/Pressbooks rows).
READ-ONLY and offline; writes outside the repository. Every pool record gets ONE outcome (mutually exclusive, reconciles to the pool):
  held-in-production     a DOI, ISBN-10/13, fingerprint, source record id, or normalised title + agreeing author already in production (any status, incl. the 217 inserted today)
  excluded               a false-positive / out-of-scope phrase (plant, veterinary, forensic, dental, eye, engineering, clinical specialty ...) or a reader hold
  duplicate-in-pool      the same book already taken from a higher-ranked source (licensed sources first)
  before-year-policy     published before 2001, or no year
  not-latin-script-title no English title
  one-kind-only / no-evidence   fewer than two DIFFERENT kinds of evidence (TITLE, KEYWORD, CLASS, DESC)
  candidate              two or more kinds
Rows are Draft ONLY, department Medical Laboratory Technology. A licence is claimed only when the SOURCE RECORD declares one (Open Textbook Library, Crossref); otherwise none.
  python3 scripts/dept-mlt-books-select.py <evidenceDir>   (reads books/raw2/*, books/raw/stage-net-new.json; writes books/select2/candidates.json)
"""
import json,os,sys,re,collections,datetime,unicodedata
D=sys.argv[1]; RAW=D+'/books/raw2'; OUT=D+'/books/select2'; os.makedirs(OUT,exist_ok=True); MIN_YEAR=2001; DEPT='Medical Laboratory Technology'
def norm(s): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',s or '').encode('ascii','ignore').decode().lower().replace('&',' and ')).strip()
def key_title(t): return re.sub(r'^(the|a|an) ','',norm(t))[:180]
STRONG=re.compile(r"(?<![\w])(clinical (?:laborator\w*|chemistry|biochemistry|pathology|microbiology|virology|cytology|haematolog\w*|hematolog\w*|immunology)|medical (?:laborator\w*|microbiology|parasitology|technolog\w*)|laboratory (?:medicine|hematolog\w*|haematolog\w*|diagnos\w*|science\w*|techniques|methods|manual|practice|safety|testing|management|investigation\w*)|diagnostic (?:microbiology|laborator\w*|pathology|cytopathology|hematology)|blood bank\w*|transfus\w*|immunohaematolog\w*|immunohematolog\w*|haemovigilance|hemovigilance|histopatholog\w*|cytopatholog\w*|cytolog\w*|histotechnolog\w*|phlebotom\w*|point[- ]of[- ]care|haematolog\w*|hematolog\w*|urinalysis|serolog\w*|molecular diagnostics|analis kesehatan|biomedical laborator\w*|clinical pathology|parasitology)(?![\w])",re.I)
KW=re.compile(r"clinical laboratory techniques|pathology, clinical|pathology, surgical|blood banks|blood transfusion|chemistry, clinical|cytodiagnosis|histological techniques|hematologic tests|blood coagulation tests|point-of-care testing|medical laboratory science|immunohematology|laboratory|clinical pathology|hematolog|haematolog|transfusion|phlebotom|diagnostic microbiology|clinical microbiology|serolog|cytolog",re.I)
EXCL=[('plant/agri/food/environment',r"\b(plant|plants|phyto\w*|crop\w*|agricultur\w*|soil|forest\w*|food|dairy|water|wastewater|marine|aquatic|fisher\w*|environmental|ecolog\w*|botan\w*)\b"),
 ('veterinary/animal',r"\b(veterinar\w*|animal\w*|canine|equine|bovine|poultry|livestock|zoonos\w*|fish|avian|wildlife)\b"),
 ('forensic',r"\b(forensic\w*|medico.?legal|legal medicine|toxicolog\w*)\b"),
 ('dental/oral',r"\b(dental|dentistry|oral|endodont\w*|periodont\w*|orthodont\w*)\b"),
 ('eye',r"\b(ophthalm\w*|optometr\w*|retina\w*|cornea\w*|glaucoma)\b"),
 ('engineering/physics/materials',r"\b(physics|engineering|materials?|industrial|sensors?|electro\w*|nano\w*|computer\w*|robotics|machine learning|artificial intelligence|metallurg\w*|geolog\w*)\b"),
 ('pharmacy/drug',r"\b(pharmac\w*|drug\w*|medicinal|therapeutic\w*)\b"),
 ('clinical specialty',r"\b(surgery|surgical(?! pathology)|nursing|midwifery|obstetric\w*|gynae\w*|gynec\w*|cardio\w*|neuro(?!patholog)\w*|psychiatr\w*|dermatolog\w*|orthop\w*|paediatric\w*|pediatric\w*|oncology|cancer|radiolog\w*|anesthe\w*|anaesthe\w*|rehabilitation|physiotherapy|nutrition|public health|epidemiolog\w*|critical care|intensive|emergenc\w*|trauma|neonat\w*)\b"),
 ('humanities/social',r"\b(history|ethic\w*|law|education|social|management|economics|policy|philosoph\w*|politic\w*|religio\w*|literature|language)\b"),
 ('non-clinical lab / research method',r"\b(laboratory (?:rat|mouse|mice|animal)\w*|budding yeast|analytical chemistry|imaging|mri|spectroscop\w*|optical|microscopy|mass spectrometry|ultrasonograph\w*|strategic (?:plan|ict)|monkeys?|aryan|nonclinical|research labs?|ivf|transplant\w*|malignan\w*|melanoma|viral cancers|ocular|hiv|statistical|molecular profiling|biomolecules|netter)\b"),
 ('proceedings/serial',r"\b(proceedings|conference|congress|symposium|newsletter|magazine|bulletin|annual report|abstracts?|annual meeting|meeting on|workshop|hands-on training|father of|point-of-care us)\b")]
EXCL=[(n,re.compile(p,re.I)) for n,p in EXCL]
# the same title-level holds a reader made on the OpenAlex list (clinical specialty, non-English, proceedings, mass publisher)
HOLD_SUB=['joint surgery','haemostasis in','obstetric hematology','in critical care','in the critically ill','twin-to-twin','massive transfusion','in trauma','in anaesthesia','autologous transfusion','history of blood','vascular laboratory','psychiatry','chapel and haeney','aptasensors','german society','transfusion in the intensive care','hemophilia']
HOLD_PUB=re.compile(r'bright sky',re.I)
NONEN=re.compile(r"\b(und|der|die|das|des|les|pour|dans|avec|aux|medycynie|labor(?:diagnostische|atorio|atoire)|wörterbuch|examens|sheng|jian yan|ke yi|dli|opyt|sovety|krwio\w*|ikhtiolog\w*|ci dian|klinikhandbuch)\b",re.I)
LABTITLE=re.compile(r"laborator|test|diagnos|blood|hematolog|haematolog|cytolog|patholog|specimen|urine|venipuncture|serolog|coagul|clinical|transfus|phlebot|histolog|microbiolog|biochem|body fluids|cbc",re.I)
LAB_WEAK_OK_WITH_STRONG=True
def authors_agree(a,b):
    x=set(w for w in norm(a).split() if len(w)>1); y=set(w for w in norm(b).split() if len(w)>1); return (not x or not y) or bool(x&y)
def doi_key(d): return re.sub(r'^https?://(dx\.)?doi\.org/','',(d or '').strip().lower()) or None
def isbn_forms(raw):
    d=re.sub(r'[^0-9Xx]','',re.sub(r'isbn(-1[03])?:?','',raw or '',flags=re.I)).upper()
    c13=lambda s: len(s)==13 and s.isdigit() and sum(int(c)*(3 if i%2 else 1) for i,c in enumerate(s))%10==0
    c10=lambda s: len(s)==10 and re.fullmatch(r'\d{9}[\dX]',s) and sum((10 if c=='X' else int(c))*(10-i) for i,c in enumerate(s))%11==0
    def to13(s): core='978'+s[:9]; return core+str((10-sum(int(c)*(3 if i%2 else 1) for i,c in enumerate(core))%10)%10)
    def to10(s):
        if not s.startswith('978'): return None
        core=s[3:12]; c=(11-sum(int(ch)*(10-i) for i,ch in enumerate(core))%11)%11; return core+('X' if c==10 else str(c))
    if len(d)==13 and c13(d): return [d]+([to10(d)] if to10(d) else [])
    if len(d)==10 and c10(d): return [to13(d),d]
    return []
# ── production identities ─────────────────────────────────────────────────────────────────────────────────────
P_DOI=set();P_ISBN=set();P_FP=set();P_SID=set();P_TITLE=collections.defaultdict(list)
for l in open(RAW+'/export.ndjson'):
    if l.startswith('{"t":"bcat"'):
        o=json.loads(l)
        if o['doi']: P_DOI.add(doi_key(o['doi']))
        for f in isbn_forms(o['isbn']): P_ISBN.add(f)
        if o['fingerprint']: P_FP.add(o['fingerprint'])
        if o['sid']: P_SID.add((o['source'] or '')+'|'+o['sid'])
        P_TITLE[key_title(o['title'])].append((o['authors'],o['year']))
    elif l.startswith('{"t":"legacy"'):
        o=json.loads(l); P_TITLE[key_title(o['title'])].append((o['authors'],None))
def held(r):
    d=doi_key(r['doi']); f=isbn_forms(r['isbn'])
    if d and d in P_DOI: return 'doi'
    if f and any(x in P_ISBN for x in f): return 'isbn'
    if r['fingerprint'] in P_FP: return 'fingerprint'
    if r['sourceRecordId'] and (r['source']+'|'+r['sourceRecordId']) in P_SID: return 'source-id'
    for a,y in P_TITLE.get(key_title(r['row']['title']),[]):
        if authors_agree(r['row']['authors'],a) and (y is None or r['row']['year'] is None or y==r['row']['year']): return 'title+author'
    return None
now=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
LICMAP=[(r'creativecommons\.org/publicdomain/zero','CC0',False),(r'creativecommons\.org/licenses/by-nc-nd','CC BY-NC-ND',True),(r'creativecommons\.org/licenses/by-nc-sa','CC BY-NC-SA',True),(r'creativecommons\.org/licenses/by-nc','CC BY-NC',True),(r'creativecommons\.org/licenses/by-nd','CC BY-ND',False),(r'creativecommons\.org/licenses/by-sa','CC BY-SA',False),(r'creativecommons\.org/licenses/by/','CC BY',False)]
def lic_from_url(u):
    for p,n,nc in LICMAP:
        if re.search(p,u or '',re.I): return n,nc
    return None,None
def lic_from_name(n):
    s=(n or '').lower().replace('_','-')
    for k,v in (('cc by-nc-nd',('CC BY-NC-ND',True)),('cc by-nc-sa',('CC BY-NC-SA',True)),('cc by-nc',('CC BY-NC',True)),('cc by-nd',('CC BY-ND',False)),('cc by-sa',('CC BY-SA',False)),('cc by',('CC BY',False)),('cc0',('CC0',False)),('public domain',('Public domain',False))):
        if k in s.replace('-',' ',1) or k in s: return v
    return None,None
def evidence(title,keywords,subject,desc,classes):
    kinds=[];why=[]
    if STRONG.search(title or ''): kinds.append('TITLE'); why.append('title:'+','.join(sorted(set(m.group(0).lower() for m in STRONG.finditer(title)))[:3]))
    kw=[k for k in (keywords or [])+([subject] if subject else []) if KW.search(k or '')]
    if kw: kinds.append('KEYWORD'); why.append('keyword:'+';'.join(kw[:3]))
    if any(re.match(r'\s*QY\s*\d',c) or re.match(r'\s*RB\d',c) or re.search(r'\b616\.07',c) for c in classes or []): kinds.append('CLASS'); why.append('class')
    ds=set(m.group(0).lower() for m in STRONG.finditer(desc or ''))
    if len(ds)>=2: kinds.append('DESC'); why.append('description:'+','.join(sorted(ds)[:3]))
    return kinds,why
def mk(source,sid,fp,title,authors,pub,isbn,doi,year,subject,lang,country,desc,landing,cover,licence,nc,lbasis,access,md,kinds,why,pages=None,edition=None):
    row=dict(title=title,authors=authors or None,publisherName=pub,isbn=isbn,doi=doi,year=year,pages=pages,edition=edition,subject=subject,domain=DEPT,language=lang,country=country,description=desc,coverUrl=cover,pdfUrl=None,
        accessType='OpenAccess',status='Draft',licence=licence,licenceIsNC=nc,rightsBasis=lbasis if licence else None,rightsVerifiedAt=now if licence else None,rightsVerifiedBy='ingestion' if licence else None,rightsStatus='MetadataOnly',accessStatus=access,
        originalUrl=landing,rightsHolder=pub,source=source,sourceRecordId=sid,ownershipSource='Ingested',lastIngestedAt=now,fingerprint=fp,metadata=md)
    return dict(source=source,sourceRecordId=sid,doi=doi,isbn=isbn,fingerprint=fp,row=row,kinds=kinds,why=why,lang=lang,licensed=bool(licence))
def first13(vals):
    for v in vals or []:
        f=isbn_forms(v)
        if f: return f[0]
    return None
pool=[]
# staged app harvests (DOAB / OAPEN / NCBI / Pressbooks / OL / Crossref books / OTL) that are not in production
prod_stage_ids=set()
if os.path.exists(D+'/books/raw/stage-net-new.json'):
    for b in json.load(open(D+'/books/raw/stage-net-new.json')):
        h={'keywords':b.get('kw') or [],'classifications':b.get('cls') or []}
        kinds,why=evidence(b['title'],h['keywords'],b.get('subject'),b.get('descr'),(b.get('cls') or [])+(b.get('nlm') or []))
        row={k:b.get(k) for k in ('title','authors','year','edition','isbn','doi','fingerprint','source','language','licence','publisher','subject')}
        pool.append(mk(b['source'],b.get('sid'),b.get('fingerprint'),b['title'],b.get('authors'),b.get('publisher'),b.get('isbn'),b.get('doi'),b.get('year'),b.get('subject'),b.get('language'),None,b.get('descr'),b.get('url'),None,b.get('licence'),b.get('nc'),'%s title licence'%b['source'],'LinkOnly' if b.get('licence') else 'MetadataOnly',dict(harvest=dict(via='staged '+b['source'],keywords=h['keywords'],classifications=h['classifications'])),kinds,why,edition=b.get('edition')))
if os.path.exists(RAW+'/nlmcatalog.ndjson'):
    for l in open(RAW+'/nlmcatalog.ndjson'):
        n=json.loads(l)
        if not n['id'] or not n['title'] or (not n['authors'] and not n['publisher']): continue
        kinds,why=evidence(n['title'],n['mesh'],None,None,n['classes'])
        pool.append(mk('NLMCatalog',n['id'],'nlmcatalog:id:'+n['id'],n['title'],n['authors'],n['publisher'],first13(n['isbns']),None,n['year'],(n['mesh'] or [None])[0],n['language'],n['country'],None,'https://www.ncbi.nlm.nih.gov/nlmcatalog/'+n['id'],None,None,None,None,'MetadataOnly',
            dict(harvest=dict(via='NLM Catalog (eutils)',keywords=n['mesh'],classifications=[],provider=dict(nlmClass=n['classes'],nlmId=n['id']))),kinds,why,pages=n.get('pages'),edition=n.get('edition')))
if os.path.exists(RAW+'/openlibrary.ndjson'):
    for l in open(RAW+'/openlibrary.ndjson'):
        o=json.loads(l); key=o['key'].replace('/works/',''); au=', '.join(o.get('author_name') or [])[:300]; pub=(o.get('publisher') or [None])[0]
        if not au and not pub: continue
        cls=list(o.get('lcc') or [])+[('DDC '+x) for x in (o.get('ddc') or [])]
        kinds,why=evidence(o['title'],o.get('subject') or [],None,None,cls)
        pool.append(mk('OpenLibrary',key,'openlibrary:id:'+key,o['title'],au,pub,first13(o.get('isbn')),None,o.get('first_publish_year'),(o.get('subject') or [None])[0],(o.get('language') or [None])[0],None,None,'https://openlibrary.org'+o['key'],
            ('https://covers.openlibrary.org/b/id/%s-M.jpg'%o['cover_i']) if o.get('cover_i') else None,None,None,None,'MetadataOnly',dict(harvest=dict(via='Open Library search',keywords=(o.get('subject') or [])[:25],classifications=cls[:6])),kinds,why))
if os.path.exists(RAW+'/otl.ndjson'):
    for l in open(RAW+'/otl.ndjson'):
        b=json.loads(l); subs=[str(x.get('name') or '') if isinstance(x,dict) else str(x) for x in (b.get('subjects') or [])]; subs=[x for x in subs if x]
        nm=lambda c:(' '.join(str(c.get(k) or '') for k in ('first_name','middle_name','last_name')).strip() or str(c.get('name') or '')) if isinstance(c,dict) else str(c)
        au=', '.join(x for x in (nm(c) for c in (b.get('contributors') or [])[:8]) if x)[:300]
        pubs=[str(x.get('name') or '') if isinstance(x,dict) else str(x) for x in (b.get('publishers') or [])]; pubs=[x for x in pubs if x]
        lic=(b.get('license') or {}); lname=lic.get('name') if isinstance(lic,dict) else str(lic or '')
        L,NC=lic_from_name(lname); desc=re.sub('<[^>]+>',' ',b.get('description') or '')
        kinds,why=evidence(b['title'],subs,None,desc,[])
        yr=str(b.get('copyright_year') or '')
        pool.append(mk('OpenTextbookLibrary',str(b['id']),'opentextbooklibrary:id:'+str(b['id']),b['title'],au,(pubs or [None])[0],first13([b.get('isbn13'),b.get('isbn10')]),None,int(yr) if yr.isdigit() else None,(subs or [None])[0],'en',None,desc[:2000] or None,b.get('url'),None,L,NC,('Open Textbook Library record licence (%s)'%lname) if L else None,'LinkOnly',dict(harvest=dict(via='Open Textbook Library',keywords=subs[:20],classifications=[])),kinds,why))
if os.path.exists(RAW+'/crossref.ndjson'):
    for l in open(RAW+'/crossref.ndjson'):
        it=json.loads(l); title=re.sub(r'<[^>]+>','',(it.get('title') or [''])[0]).strip(); doi=doi_key(it.get('DOI'))
        if not title or not doi: continue
        au=', '.join(' '.join(x for x in (a.get('given'),a.get('family')) if x) or (a.get('name') or '') for a in (it.get('author') or it.get('editor') or [])[:10]).strip(', ')
        yr=((it.get('issued') or {}).get('date-parts') or [[None]])[0][0]; L=NC=None; lurl=None
        for li in it.get('license') or []:
            L,NC=lic_from_url(li.get('URL'));
            if L: lurl=li.get('URL'); break
        desc=re.sub(r'<[^>]+>',' ',it.get('abstract') or '').strip() or None; subj=it.get('subject') or []
        kinds,why=evidence(title,subj,None,desc,[])
        pool.append(mk('CrossrefBooks',doi,'crossref:doi:'+doi,title,au,it.get('publisher'),first13(it.get('ISBN')),doi,yr,(subj or [None])[0],(it.get('language') or 'en'),None,desc,'https://doi.org/'+doi,None,L,NC,('Crossref record licence (%s)'%lurl) if L else None,'LinkOnly' if L else 'MetadataOnly',dict(harvest=dict(via='Crossref works (type=book)',keywords=subj[:15],classifications=[])),kinds,why))
RANK={'OpenTextbookLibrary':0,'DOAB':1,'OAPEN':2,'NCBIBookshelf':3,'Pressbooks':4,'CrossrefBooks':5,'OpenLibrary':6,'OpenLibraryDump':6,'NLMCatalog':7}
pool.sort(key=lambda r:(RANK.get(r['source'],9),0 if r['licensed'] else 1,-len(r['kinds'])))
water=collections.Counter(); taken=set(); cands=[]
latin=lambda s: sum(1 for c in s if c.isalpha() and ord(c)<0x250)>=0.8*max(1,sum(1 for c in s if c.isalpha()))
for r in pool:
    t=r['row']['title'] or ''; y=r['row']['year']; reason=None
    h=held(r)
    ex=next((n for n,rx in EXCL if rx.search(t) and not (STRONG.search(t) and n in ('clinical specialty','humanities/social','pharmacy/drug','engineering/physics/materials') and False)),None)
    if ex and STRONG.search(t) and ex in ('humanities/social','pharmacy/drug'): ex=None     # a strong lab title keeps a stray word like "management" / "drug"
    lt=t.lower()
    if h: reason='held-in-production:'+h
    elif ex: reason='excluded:'+ex
    elif any(s in lt for s in HOLD_SUB) or HOLD_PUB.search(r['row']['publisherName'] or ''): reason='excluded:reader-hold'
    elif not t.strip(): reason='no-title'
    else:
        ks=[x for x in [('d'+r['doi']) if r['doi'] else None]+['i'+f for f in isbn_forms(r['row']['isbn'])]+['t'+key_title(t)+'|'+(norm(r['row']['authors'] or '').split(' ')[0] if r['row']['authors'] else '')] if x]
        if any(k in taken for k in ks): reason='duplicate-in-pool'
        elif not y or y<MIN_YEAR: reason='before-year-policy'
        elif not latin(t) or NONEN.search(t): reason='not-latin-script-title'
        elif len(r['kinds'])<2: reason='one-kind-only' if r['kinds'] else 'no-evidence'
        elif 'TITLE' not in r['kinds'] and not LABTITLE.search(t): reason='one-kind-only'
    if reason is None:
        reason='candidate'; taken.update(ks); r['row']['metadata'].setdefault('harvest',{})['department']=dict(band='strong',rule='dept-mlt-books:two-kinds',checks=r['kinds'],evidence=r['why']); cands.append(r)
    water[(r['source'],reason.split(':')[0] if not reason.startswith('excluded') else 'excluded')]+=1
json.dump(cands,open(OUT+'/candidates.json','w'),ensure_ascii=False)
print('pool',len(pool),'= sum',sum(water.values()))
for s in sorted(set(k[0] for k in water)): print(' ',s,{k[1]:v for k,v in sorted(water.items()) if k[0]==s})
print('CANDIDATES',len(cands),dict(collections.Counter(c['source'] for c in cands)),'| licensed',sum(1 for c in cands if c['licensed']))
