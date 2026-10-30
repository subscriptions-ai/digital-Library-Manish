"""Fill missing publishers for MLT candidates from Crossref /journals/{issn} (read-only). usage: python3 dept-mlt-publishers.py <classified.ndjson> <out publishers.json>"""
import json,sys,time,urllib.request
inp,out=sys.argv[1],sys.argv[2]; res={}
for l in open(inp):
    o=json.loads(l)
    if o['outcome']!='evidence ok but no publisher on the source record': continue
    for i in o['issns']:
        try:
            r=json.load(urllib.request.urlopen(urllib.request.Request(f'https://api.crossref.org/journals/{i}?mailto=info@celnet.in',headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=30))
            pub=(r.get('message') or {}).get('publisher')
            if pub: res[i]=pub; break
        except Exception: pass
        time.sleep(0.2)
json.dump(res,open(out,'w'),ensure_ascii=False,indent=1); print(len(res),'publishers found')
