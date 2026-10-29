"""
SciELO journals from the public ArticleMeta API for EVERY collection in /collection/identifiers (not a fixed list), one request per collection, reported vs fetched journal counts in the ledger.
Facts only: title, ISSN/eISSN, publisher, country, homepage, status (C current / D ceased / S suspended), subject areas, Web of Science areas, start year.  Duplicates across collections are merged later by ISSN.
  python3 fetch_scielo.py
"""
import json,os,sys,time,urllib.request
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def get(url):
    for a in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=240))
        except Exception: time.sleep(3*(a+1))
    return None
cols=get('https://articlemeta.scielo.org/api/v1/collection/identifiers/') or []
first=lambda d,k:(d.get(k) or [{}])[0].get('_') if d.get(k) else None
out=[];failed=[]
for c in cols:
    code=c['code']; rep=sum((c.get('journal_count') or {}).values()) if c.get('journal_count') else None
    data=get(f'https://articlemeta.scielo.org/api/v1/journal/?collection={code}')
    if data is None: failed.append(code); continue
    for d in data:
        out.append({'collection':code,'code':d['code'],'title':first(d,'v100'),'issn':first(d,'v400'),'eissn':first(d,'v935'),'issns':d.get('issns'),'publisher':first(d,'v480'),'country':first(d,'v310'),'homepage':first(d,'v69'),'status':first(d,'v50'),'wos':[x.get('_') for x in d.get('v854',[])],'areas':[x.get('_') for x in d.get('v441',[])],'startYear':first(d,'v301'),'evidenceUrl':f'https://articlemeta.scielo.org/api/v1/journal/?collection={code}&issn={d["code"]}'})
    record('SciELO collection '+code,'complete',query=f'GET /api/v1/journal/?collection={code}',fetched=len(data),reportedJournalCount=rep,pagination='single response per collection',notes=(c.get('name') or {}).get('en'))
    time.sleep(2)
for f in failed: record('SciELO collection '+f,'blocked',query=f'GET /api/v1/journal/?collection={f}',fetched=0,failures='no response after 4 attempts')
json.dump(out,open(os.path.join(RAW,'scielo-all.json'),'w'),ensure_ascii=False)
record('SciELO (merged)','partial' if failed else 'complete',query='ArticleMeta /collection/identifiers then /journal/?collection=<code> for each',fetched=len(out),collections=len(cols),failedCollections=failed,files=['scielo-all.json'],notes='search.scielo.org (bot challenge) not used; no scraping of www.scielo.org pages.')
print(len(cols),'collections',len(out),'journal records; failed',failed)
