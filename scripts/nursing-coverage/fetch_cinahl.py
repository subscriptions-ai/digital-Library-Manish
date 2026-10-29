"""
EBSCO CINAHL title lists (public downloads on https://about.ebsco.com/title-lists), all CINAHL editions, coverage and subject lists. One download per file, skipped if already on disk.
Facts only are parsed (policy, source type, ISSN, title, publisher, indexing start/stop, peer review, country; subject lists: category, discipline, subject). The raw files stay on disk, uncommitted.

  python3 fetch_cinahl.py
Selection rule recorded in the ledger (the 756 of the previous run were: source type "Academic Journal" AND (in the CINAHL Complete "Nursing" discipline list OR a nursing word in title/publisher)).
This run pools EVERY Academic Journal of every edition and lets the independent nursing signals (NLM, OpenAlex, SciELO, KoreaMed, publisher) decide, so a nursing journal without a nursing word in its title is not missed.
"""
import json,os,re,sys,html,time,urllib.request
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW
D=os.path.join(RAW,'cinahl'); os.makedirs(D,exist_ok=True)
EDITIONS={'cin':'CINAHL Database','c8h':'CINAHL with Full Text','rzh':'CINAHL Plus with Full Text','ccm':'CINAHL Complete','cul':'CINAHL Ultimate'}
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def dl(name):
    p=os.path.join(D,name)
    if os.path.exists(p) and os.path.getsize(p)>10000: return p,'cached'
    for a in range(3):
        try:
            data=urllib.request.urlopen(urllib.request.Request('https://about.ebsco.com/m/ee/Marketing/titleLists/'+name,headers=UA),timeout=180).read(); open(p,'wb').write(data); time.sleep(2); return p,'downloaded'
        except Exception as e: err=str(e)[:80]; time.sleep(3*(a+1))
    return None,err
from parsers import parse_ebsco_table
def rows(path): return parse_ebsco_table(open(path,encoding='utf8',errors='ignore').read())
for code,label in EDITIONS.items():
    p,how=dl(f'{code}-coverage.htm')
    if not p: record(label+' coverage list','blocked',query=f'about.ebsco.com title-lists {code}-coverage.htm',failures=how,fetched=0); continue
    r=rows(p); facts=[{'policy':x.get('Coverage Policy'),'type':x.get('Source Type'),'issn':x.get('ISSN / ISBN'),'title':x.get('Publication Name'),'publisher':x.get('Publisher'),'idxStart':x.get('Indexing and Abstracting Start'),'idxStop':x.get('Indexing and Abstracting Stop'),'peer':x.get('Peer-Reviewed'),'country':x.get('Country'),'mid':x.get('MID'),'edition':label} for x in r]
    json.dump(facts,open(os.path.join(D,f'{code}-coverage.json'),'w'),ensure_ascii=False)
    record(label+' coverage list','complete',query=f'about.ebsco.com/m/ee/Marketing/titleLists/{code}-coverage.htm ({how})',fetched=len(facts),pagination='single file',files=[f'cinahl/{code}-coverage.htm',f'cinahl/{code}-coverage.json'],notes='Intended-coverage list published by EBSCO; only bibliographic fields kept. Source types: '+json.dumps({k:sum(1 for f in facts if f["type"]==k) for k in sorted({f["type"] for f in facts})}))
    p2,how2=dl(f'{code}-subject.htm')
    if p2:
        r2=rows(p2); sub=[{'category':x.get('Category'),'discipline':x.get('Discipline'),'subject':x.get('Subject'),'issn':x.get('ISSN'),'title':x.get('Publication Name'),'publisher':x.get('Publisher'),'type':x.get('Source Type'),'idxStop':x.get('Indexing and Abstracting Stop'),'peer':x.get('Peer-Reviewed'),'country':x.get('Country'),'edition':label} for x in r2]
        json.dump(sub,open(os.path.join(D,f'{code}-subject.json'),'w'),ensure_ascii=False)
        nur=[x for x in sub if x['discipline']=='Nursing']
        record(label+' subject list','complete',query=f'.../{code}-subject.htm ({how2})',fetched=len(sub),pagination='single file',files=[f'cinahl/{code}-subject.htm',f'cinahl/{code}-subject.json'],notes=f'Full-text subject list: {len(nur)} rows (distinct ISSNs {len({x["issn"] for x in nur})}) under discipline Nursing. It covers the full-text subset only, so the coverage list is pooled too.')
    else: record(label+' subject list','blocked' if not os.path.exists(os.path.join(D,f'{code}-subject.htm')) else 'complete',query=f'.../{code}-subject.htm',fetched=0,failures=how2,notes='no subject list published for this edition or the download failed')
print('done')
