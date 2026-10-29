"""
Journals listed in KoreaMed (KAMJE), from the public journal browser page (one request; robots.txt allows everything). Facts only: title, abbreviation, ISSN, KoreaMed id,
and the "now published as" relation (a rename), which is used to keep a renamed journal from being counted as a new one.

  python3 fetch_koreamed.py out.json
"""
import json,re,sys,html,time,urllib.request
UA={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}
URL='https://koreamed.org/JournalBrowserNew.php'
s=urllib.request.urlopen(urllib.request.Request(URL,headers=UA),timeout=90).read().decode('utf8','ignore')
out=[]
for li in re.findall(r"<li>(<a href='/volumes/.*?)</li>",s,flags=re.S):
    items=re.findall(r"<a href=['\"]/volumes/(\d+)['\"] class=['\"]title['\"]>(?:<img[^>]*>)?(.*?)</a>\s*(?:&nbsp;)?\s*<span class=['\"]issn['\"]>\s*(.*?)(?:&nbsp;)?\s*<span>(\d{4}-\d{3}[\dX])</span>",li,flags=re.S)
    if not items: continue
    cur=[]
    for kid,title,abbr,issn in items:
        cur.append({'koreamedId':kid,'title':html.unescape(re.sub(r'<[^>]+>','',title)).strip(),'abbr':html.unescape(abbr).replace('\xa0',' ').strip(),'issn':issn})
    rec=cur[0]; rec['nowPublishedAs']=cur[1] if len(cur)>1 else None
    out.append(rec)
for r in out: r['evidenceUrl']=f"https://koreamed.org/volumes/{r['koreamedId']}"; r['retrieved']=time.strftime('%Y-%m-%d')
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False); print(len(out),'KoreaMed journals;',sum(1 for r in out if r['nowPublishedAs']),'with a rename relation')
