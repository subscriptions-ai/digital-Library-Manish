"""
SciELO journals with the Nursing WoS area, from the public ArticleMeta API (one request per collection). Facts only:
title, ISSN/eISSN, publisher, country, homepage, status (C = current), subject areas, collection, the API URL used as the evidence reference.

  python3 fetch_scielo.py out.json
"""
import json,sys,time,urllib.request
COLL=['scl','spa','chl','col','cub','mex','per','ven','arg','ury','sza','bol','cri','prt','pry','ecu','dom','sss','psi','wid']
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
first=lambda d,k:(d.get(k) or [{}])[0].get('_') if d.get(k) else None
out=[];seen=set();totals={}
for c in COLL:
    url=f'http://articlemeta.scielo.org/api/v1/journal/?collection={c}'
    try: data=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=180))
    except Exception as e: print(c,'unavailable',str(e)[:60]); time.sleep(2); continue
    totals[c]=len(data)
    for d in data:
        wos=[x.get('_') for x in d.get('v854',[])]; areas=[x.get('_') for x in d.get('v441',[])]
        out.append({'collection':c,'code':d['code'],'title':first(d,'v100'),'issn':first(d,'v400'),'eissn':first(d,'v935'),'issns':d.get('issns'),'publisher':first(d,'v480'),'country':first(d,'v310'),'homepage':first(d,'v69'),'status':first(d,'v50'),'wos':wos,'areas':areas,'startYear':first(d,'v301'),'evidenceUrl':f'http://articlemeta.scielo.org/api/v1/journal/?collection={c}&issn={d["code"]}','retrieved':time.strftime('%Y-%m-%d')})
    time.sleep(1.5)
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False); print('collections',totals,'| journals',len(out))
