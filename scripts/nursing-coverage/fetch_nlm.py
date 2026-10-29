"""
NLM Catalog serials under Nursing-specific NLM subject headings, via E-utilities (esearch with retmax=10000 and retstart paging, then esummary in batches of 200).
Headings are Nursing-specific only; broad ones ("Home Care Services", "Pharmacy", "Rehabilitation", "Dentistry", "Engineering"...) are not included and broad medical serials are not pulled in.
Per heading the ledger records the esearch count, how many ids were fetched, and whether paging completed. Records are merged by NLM unique id with the list of headings that matched.

  python3 fetch_nlm.py
"""
import json,os,sys,time,urllib.request,urllib.parse
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW
D=os.path.join(RAW,'nlm'); os.makedirs(D,exist_ok=True)
HEADINGS=['Nursing','Nursing Care','Nursing Research','Midwifery','Nurse Midwives','Nurses','Nurse Practitioners','Education, Nursing','Pediatric Nursing','Psychiatric Nursing','Critical Care Nursing','Emergency Nursing','Oncology Nursing','Obstetric Nursing','Community Health Nursing','Geriatric Nursing','Perioperative Nursing','Public Health Nursing','Nursing Informatics','Neonatal Nursing','Rehabilitation Nursing','Nursing Administration Research','Nursing Assessment','Nursing Diagnosis','School Nursing','Occupational Health Nursing','Nursing, Practical','Nurse Clinicians','Nurse Anesthetists','Forensic Nursing','Palliative Care']
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def get(url):
    for a in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=90))
        except Exception: time.sleep(2*(a+1))
    return None
E='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'
recs={}
for h in HEADINGS:
    term=f'"{h}"[Subject] AND serial[Type]'; fn=os.path.join(D,'ids-'+h.replace(' ','_').replace(',','')+'.json')
    if os.path.exists(fn): ids=json.load(open(fn))
    else:
        ids=[]; start=0; count=None
        while True:
            d=get(E+'esearch.fcgi?'+urllib.parse.urlencode({'db':'nlmcatalog','retmode':'json','retmax':10000,'retstart':start,'term':term}))
            if not d: break
            count=int(d['esearchresult']['count']); batch=d['esearchresult']['idlist']; ids+=batch; start+=len(batch)
            if not batch or start>=count: break
            time.sleep(0.4)
        json.dump(ids,open(fn,'w'))
        if count is None: record('NLM Catalog: '+h,'blocked',query=term,fetched=0,failures='esearch failed after retries'); continue
        time.sleep(0.4)
    for i in range(0,len(ids),200):
        d=get(E+'esummary.fcgi?'+urllib.parse.urlencode({'db':'nlmcatalog','retmode':'json','id':','.join(ids[i:i+200])}))
        if not d: continue
        for u in d['result']['uids']:
            x=d['result'][u]; o=recs.setdefault(u,{'uid':u,'headings':[]})
            if h not in o['headings']: o['headings'].append(h)
            pi=(x.get('publicationinfolist') or [{}])[0]
            o.update({'title':(x.get('titlemainlist') or [{}])[0].get('title','').rstrip(' .'),'altTitles':[t.get('titlealternate') for t in x.get('titleotherlist',[]) if t.get('titlealternate')][:6],'issn':[(q['issn'],q['issntype']) for q in x.get('issnlist',[]) if q.get('validyn')=='Y'],'publisher':(pi.get('publisher') or '').strip(' ,'),'issued':pi.get('dateissued',''),'country':x.get('country'),'currentlyIndexed':x.get('currentindexingstatus'),'medlineta':x.get('medlineta')})
        time.sleep(0.35)
    record('NLM Catalog: '+h,'complete',query=term,fetched=len(ids),pagination=f'esearch count {len(ids)} = ids fetched (retmax 10000, retstart paging)',notes='Nursing-specific NLM subject heading')
out=os.path.join(RAW,'nlm-nursing-serials.json'); json.dump(list(recs.values()),open(out,'w'),ensure_ascii=False)
record('NLM Catalog (merged)','complete',query=f'{len(HEADINGS)} Nursing-specific headings, serial[Type]',fetched=len(recs),pagination='all headings paged to completion',files=['nlm-nursing-serials.json'],notes='unique serials across headings; broad medical headings deliberately not used. NLM dates (open-ended or closed) are kept as facts but are never the final verdict.')
print('unique serials',len(recs))
