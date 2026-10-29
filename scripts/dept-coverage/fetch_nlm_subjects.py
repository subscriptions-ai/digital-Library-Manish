# Derived from scripts/nlm-journal-import/fetch_subjects.py: NLM Catalog serials by NLM-assigned Subject, for the departments of this run. usage: python3 fetch_nlm_subjects.py data/dept-coverage/raw
import json,sys,time,urllib.request,urllib.parse,re
S=sys.argv[1]
SUBJ=['Pharmacy','Biotechnology','Nanotechnology','Physical Therapy Modalities','Rehabilitation','Complementary Therapies','Medicine, Traditional','Medicine, Ayurvedic','Architecture','Chemical Engineering']
def get(url):
    for a in range(5):
        try: return json.load(urllib.request.urlopen(url,timeout=90))
        except Exception as e: time.sleep(2*(a+1))
    return None
out={}
for s in SUBJ:
    term=f'"{s}"[Subject] AND serial[Type]'
    d=get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nlmcatalog&retmode=json&retmax=10000&term="+urllib.parse.quote(term))
    ids=d['esearchresult']['idlist']; n=0
    for i in range(0,len(ids),200):
        r=get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=nlmcatalog&retmode=json&id="+",".join(ids[i:i+200]))
        if not r: continue
        for u in r['result']['uids']:
            x=r['result'][u]; o=out.setdefault(u,{'uid':u,'subjects':[]})
            if s not in o['subjects']: o['subjects'].append(s)
            o.update({'title':(x.get('titlemainlist') or [{}])[0].get('title','').rstrip(' .'),'issn':[(q['issn'],q['issntype']) for q in x.get('issnlist',[]) if q.get('validyn')=='Y'],'publisher':(x.get('publicationinfolist') or [{}])[0].get('publisher','').strip(' ,'),'issued':(x.get('publicationinfolist') or [{}])[0].get('dateissued',''),'country':x.get('country'),'resource':[q.get('resourceunit','') for q in x.get('resourceinfolist',[])],'indexing':x.get('currentindexingstatus')})
        time.sleep(0.35)
    print(s,len(ids),flush=True)
json.dump(list(out.values()),open(S+'/nlm/subject-serials.json','w'))
print('unique',len(out))
