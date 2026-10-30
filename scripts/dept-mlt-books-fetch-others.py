"""
Medical Laboratory Technology BOOKS: four more sources, READ-ONLY, NDJSON outside the repository.
  NLM Catalog (eutils: laboratory / pathology / transfusion subjects, books)   -> nlmcatalog.ndjson
  Open Library (search.json by laboratory subject, 2001+)          -> openlibrary.ndjson
  Open Textbook Library (textbooks.json, every page, lab words)    -> otl.ndjson
  Crossref (works?filter=type:book, title queries; carries the licence when deposited) -> crossref.ndjson
  python3 scripts/dept-mlt-books-fetch-others.py <rawdir>
"""
import json,os,sys,re,time,urllib.request,urllib.parse,html
RAW=sys.argv[1]; os.makedirs(RAW,exist_ok=True)
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def get(url,text=False,tries=3,timeout=40):
    for a in range(tries):
        try:
            b=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=timeout).read().decode('utf8','replace')
            return b if text else json.loads(b)
        except urllib.error.HTTPError as e:
            if e.code in (429,500,502,503,504): time.sleep(4*(a+1)); continue
            raise
        except Exception: time.sleep(3*(a+1))
    raise SystemExit('source did not answer after %d attempts: %s  (STOP: source API error)'%(tries,url[:90]))
EY='https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
# ── NLM Catalog ───────────────────────────────────────────────────────────────────────────────────────────────────
SKIP_NLM='--skip-nlm' in sys.argv
term='("pathology, clinical"[Subject] OR "clinical laboratory techniques"[Subject] OR hematology[Subject] OR "blood banks"[Subject] OR "blood transfusion"[Subject] OR "chemistry, clinical"[Subject] OR cytodiagnosis[Subject] OR "histological techniques"[Subject] OR "microbiological techniques"[Subject] OR "point-of-care testing"[Subject] OR "diagnostic techniques and procedures"[Subject] OR "hematologic tests"[Subject] OR parasitology[Subject] OR "pathology, surgical"[Subject] OR "bacteriological techniques"[Subject] OR "immunologic tests"[Subject] OR "blood coagulation tests"[Subject] OR "laboratory techniques and procedures"[Subject] OR "medical laboratory science"[Subject] OR QY[Class]) AND book[Type] AND english[Language]'
ids=[];start=0
while not SKIP_NLM:
    d=get(EY+'/esearch.fcgi?db=nlmcatalog&retmode=json&retmax=500&retstart=%d&term=%s'%(start,urllib.parse.quote(term)))['esearchresult']
    ids+=d['idlist']; start+=500
    if start>=int(d['count']) or start>=6000: break
    time.sleep(0.4)
print('nlm ids',len(ids))
one=lambda s,t:(lambda m:html.unescape(m.group(1)).strip() if m else None)(re.search(r'<%s\b[^>]*>([\s\S]*?)</%s>'%(t,t),s))
tags=lambda s,t:[html.unescape(x).strip() for x in re.findall(r'<%s\b[^>]*>([\s\S]*?)</%s>'%(t,t),s)]
with open(RAW+'/nlmcatalog.ndjson','a' if SKIP_NLM else 'w') as f:
    for i in range(0,len(ids),100):
        xml=get(EY+'/efetch.fcgi?db=nlmcatalog&retmode=xml&id='+','.join(ids[i:i+100]),text=True)
        for rec in re.findall(r'<NLMCatalogRecord\b[\s\S]*?</NLMCatalogRecord>',xml):
            if one(rec,'TypeOfResource')!='Book': continue
            tb=(re.search(r'<TitleMain>([\s\S]*?)</TitleMain>',rec) or [0,''])[1]; title=re.sub(r'\s*[./:;,]+\s*$','',one(tb,'Title') or '').strip()
            al=(re.search(r'<AuthorList\b[\s\S]*?</AuthorList>',rec) or [''])[0]
            people=[]
            for a in re.findall(r'<Author\b[\s\S]*?</Author>',al):
                last,fore=one(a,'LastName'),one(a,'ForeName'); people.append(' '.join(x for x in (fore,last) if x) if last else (one(a,'CollectiveName') or ''))
            imp=(re.search(r'<Imprint\b[\s\S]*?</Imprint>',rec) or [''])[0]; pub=re.sub(r'[\s,;:]+$','',one(imp,'Entity') or '') or None
            yr=one(rec,'PublicationFirstYear') or one(imp,'Year')
            mesh=tags((re.search(r'<MeshHeadingList>[\s\S]*?</MeshHeadingList>',rec) or [''])[0],'DescriptorName')
            f.write(json.dumps(dict(id=one(rec,'NlmUniqueID'),title=title,authors=', '.join(p for p in people if p)[:300],publisher=pub,year=int(yr) if yr and yr.isdigit() else None,mesh=list(dict.fromkeys(mesh))[:20],
                classes=tags(rec,'Classification')[:4],isbns=[re.sub(r'\s*\(.*$','',x) for x in tags(rec,'ISBN')][:6],language=one(rec,'Language'),country=one(rec,'Country'),edition=one(rec,'Edition'),pages=((re.search(r'(\d+)\s*p\b',one(rec,'Extent') or '') or [0,None])[1])),ensure_ascii=False)+'\n')
        time.sleep(0.4)
# ── Open Library ──────────────────────────────────────────────────────────────────────────────────────────────────
SUBJ=['clinical pathology','laboratory medicine','medical laboratory','clinical chemistry','clinical biochemistry','hematology','haematology','blood banking','blood transfusion','histopathology','cytology','diagnostic microbiology','medical microbiology','clinical microbiology','medical parasitology','phlebotomy','urinalysis','laboratory techniques','laboratory diagnosis','immunohematology','point-of-care testing','medical technology','laboratory management','serology','clinical immunology','molecular diagnostics','diagnostic cytology','histotechnology']
seen={}
for s in SUBJ:
    for page in (1,2,3):
        u='https://openlibrary.org/search.json?'+urllib.parse.urlencode({'subject':s,'limit':100,'page':page,'fields':'key,title,author_name,first_publish_year,isbn,subject,publisher,language,number_of_pages_median,cover_i,lcc,ddc,ebook_access,edition_count'})
        try: d=get(u)
        except SystemExit as e: print('open library:',e); break
        for x in d.get('docs',[]): seen[x['key']]=x
        if len(d.get('docs',[]))<100: break
        time.sleep(0.5)
with open(RAW+'/openlibrary.ndjson','w') as f:
    for x in seen.values(): f.write(json.dumps(x,ensure_ascii=False)+'\n')
print('open library works',len(seen))
# ── Open Textbook Library ─────────────────────────────────────────────────────────────────────────────────────────
n=0; url='https://open.umn.edu/opentextbooks/textbooks.json'; hits=0
with open(RAW+'/otl.ndjson','w') as f:
    while url:
        try: d=get(url)
        except SystemExit as e: print('otl:',e); break
        for b in d.get('data',[]):
            n+=1; blob=(b.get('title') or '')+' '+' '.join(str(s) for s in (b.get('subjects') or []))
            if re.search(r'laborator|patholog|hematolog|haematolog|clinical chem|clinical biochem|microbiolog|cytolog|histolog|transfus|blood bank|phlebotom|point.of.care|serolog|immunohemat|parasitolog|urinaly|diagnos',blob,re.I): f.write(json.dumps(b,ensure_ascii=False)+'\n'); hits+=1
        nxt=(d.get('links') or {}).get('next'); url=nxt if nxt and nxt!=url else None; time.sleep(0.1)
print('otl scanned',n,'lab-ish',hits)

# ── Crossref (type=book; the deposited licence is kept) ───────────────────────────────────────────────────────────────
QS=['clinical laboratory','medical laboratory','laboratory medicine','clinical chemistry','clinical biochemistry','hematology','haematology','blood banking','transfusion medicine','histopathology','cytopathology','diagnostic microbiology','medical microbiology','clinical microbiology','medical parasitology','phlebotomy','urinalysis','laboratory techniques','laboratory diagnosis','immunohematology','point-of-care testing','laboratory management','serology','molecular diagnostics','clinical pathology']
seenx={}
for q in QS:
    off=0
    while off<400:
        u='https://api.crossref.org/works?'+urllib.parse.urlencode({'query.title':q,'filter':'type:book,from-pub-date:2001','rows':100,'offset':off,'select':'DOI,title,author,editor,publisher,issued,ISBN,license,subject,abstract','mailto':'info@celnet.in'})
        try: d=get(u)
        except SystemExit as e: print('crossref:',e); break
        items=d['message'].get('items',[])
        for it in items: seenx[it['DOI']]=it
        if len(items)<100: break
        off+=100; time.sleep(0.3)
    time.sleep(0.3)
with open(RAW+'/crossref.ndjson','w') as f:
    for x in seenx.values(): f.write(json.dumps(x,ensure_ascii=False)+'\n')
print('crossref books',len(seenx))
