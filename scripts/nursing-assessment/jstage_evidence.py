"""
Official J-STAGE (JST) publication facts for specific ISSNs, one WebAPI query per journal (J-STAGE's terms forbid bulk downloading, so this is never run over a list of
all titles, only over candidates that other sources could not confirm).

  python3 jstage_evidence.py in.json out.json        in.json: [{"key","issn","eissn"}]
out[key] = {via, title, publisher, publisherUrl, articles2024to2026, articles2025to2026, evidenceUrl}  or null if J-STAGE does not carry the ISSN.
service=1 (journal facts) and service=3 (article search, pubyearfrom, count=1: only the total is used).
"""
import json,sys,time,re,urllib.request,urllib.parse
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
def get(url):
    for a in range(3):
        try: return urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=60).read().decode('utf8','ignore')
        except Exception: time.sleep(2*(a+1))
    return None
def total(x):
    m=re.search(r'<opensearch:totalResults>(\d+)<',x or ''); return int(m.group(1)) if m else 0
def cd(tag,x):
    m=re.search(rf'<{tag}>\s*<en><!\[CDATA\[(.*?)\]\]>',x or '',re.S); return m.group(1) if m else None
def run(rows):
    out={}
    for r in rows:
        res=None
        for isn in [x for x in (r.get('issn'),r.get('eissn')) if x]:
            base=f'https://api.jstage.jst.go.jp/searchapi/do?service=1&issn={isn}'; x=get(base)
            if total(x)>0:
                a24=total(get(f'https://api.jstage.jst.go.jp/searchapi/do?service=3&issn={isn}&pubyearfrom=2024&count=1&start=1')); time.sleep(0.5)
                a25=total(get(f'https://api.jstage.jst.go.jp/searchapi/do?service=3&issn={isn}&pubyearfrom=2025&count=1&start=1'))
                pub=re.search(r'<publisher>.*?<name>\s*<en><!\[CDATA\[(.*?)\]\]>',x,re.S); url=re.search(r'<publisher>.*?<url>\s*<en>(.*?)</en>',x,re.S)
                res={'via':isn,'title':cd('material_title',x),'publisher':pub.group(1) if pub else None,'publisherUrl':url.group(1) if url else None,'articles2024to2026':a24,'articles2025to2026':a25,'evidenceUrl':base}; break
            time.sleep(0.5)
        out[r['key']]=res; time.sleep(0.5)
    return out
if __name__=='__main__':
    rows=json.load(open(sys.argv[1])); json.dump(run(rows),open(sys.argv[2],'w'),ensure_ascii=False); print('done',len(rows))
