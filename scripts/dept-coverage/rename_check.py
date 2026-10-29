"""
(Derived from scripts/nursing-assessment/rename_check.py: the catalogue snapshot is read from <work-dir>/catalogue-snapshot.json.)
Renamed / continued / translated journals must not enter as new ones. Two independent checks on a set of candidates, against the WHOLE catalogue (every status):

  python3 rename_check.py <work-dir> candidates.json out.json        candidates.json: [{"key","title","publisher","issns","nlmUid"}]
  1. NLM Catalog relations: efetch of the candidate's NLM record lists the titles it "Continues", is "Continued by", "Absorbed" ... with their ISSNs; any related ISSN
     (or normalised related title) already in the catalogue means this is the same journal under another name.
  2. Similarity: the candidate's title is compared with every catalogue title (token Jaccard on meaningful words); >= 0.6 with the same publisher, or >= 0.8 with any publisher,
     is flagged for a person (it is never merged and never inserted).
out[key] = {"nlmRelations": [...], "nlmHit": {...}|null, "similar": [{"title","status","domain","jaccard","samePublisher"}...]}
"""
import json,sys,re,time,unicodedata,urllib.request,xml.etree.ElementTree as ET
W,INP,OUT=sys.argv[1],sys.argv[2],sys.argv[3]
cat=json.load(open(f'{W}/catalogue-snapshot.json'))['all']
norm=lambda t:re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',(t or '').lower()).encode('ascii','ignore').decode()).strip()
STOP={'the','of','and','for','journal','international','revista','revue','de','la','el','der','die','und','in','on','a','an','da','do','dos','das','del','los','las','et','y','e','o','journals','review','reviews'}
toks=lambda t:frozenset(w for w in norm(t).split() if len(w)>2 and w not in STOP)
issnRow={}; 
for j in cat:
    for i in (j['issn'],j['eissn']):
        if i: issnRow[i]=j
tit=[(toks(j['title']),norm(j['publisher']),j) for j in cat if len(toks(j['title']))>=2]
byTok=__import__('collections').defaultdict(list)
for idx,(t,p,j) in enumerate(tit):
    for w in t: byTok[w].append(idx)
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def nlm(uid):
    url=f'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nlmcatalog&id={uid}&retmode=xml'
    for a in range(3):
        try: return ET.fromstring(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60).read())
        except Exception: time.sleep(2*(a+1))
    return None
res={}
for c in json.load(open(INP)):
    r={'nlmRelations':[],'nlmHit':None,'similar':[]}
    if c.get('nlmUid'):
        root=nlm(c['nlmUid']); time.sleep(0.4)
        if root is not None:
            for tr in root.iter('TitleRelated'):
                typ=(tr.findtext('TitleRelatedType') or '').strip(); t=(tr.findtext('Title') or '').strip(); issns=[(e.text or '').strip() for e in tr.iter('ISSN')]
                r['nlmRelations'].append({'type':typ,'title':t,'issns':issns})
                for i in issns:
                    if i in issnRow and i not in c['issns'] and not r['nlmHit']: r['nlmHit']={'via':typ,'relatedTitle':t,'issn':i,'catalogueTitle':issnRow[i]['title'],'status':issnRow[i]['status'],'domain':issnRow[i]['domain']}
    ct=toks(c['title']); pub=norm(c.get('publisher'))
    if len(ct)>=2:
        cand=set(i for w in ct for i in byTok.get(w,[]))
        for i in cand:
            t,p,j=tit[i]; jac=len(ct&t)/len(ct|t)
            same=bool(pub) and bool(p) and (pub==p or pub in p or p in pub)
            if (jac>=0.8) or (jac>=0.6 and same):
                if j['issn'] in c['issns'] or j['eissn'] in c['issns']: continue
                r['similar'].append({'title':j['title'],'status':j['status'],'domain':j['domain'],'jaccard':round(jac,2),'samePublisher':same})
    r['similar']=sorted(r['similar'],key=lambda x:-x['jaccard'])[:5]; res[c['key']]=r
json.dump(res,open(OUT,'w'),ensure_ascii=False); print('checked',len(res),'| NLM relation hits',sum(1 for v in res.values() if v['nlmHit']),'| similar-title flags',sum(1 for v in res.values() if v['similar']))
