"""
KAMJE (Korean Association of Medical Journal Editors) member journals, from the public member list (https://www.kamje.or.kr/association/list_association).  Each row names the journal
and its publishing society; a society whose name contains 간호 ("nursing") or the journal title contains "nurs" is Nursing scope evidence from the official association.  Facts only.
  python3 fetch_kamje.py
"""
import json,os,re,sys,html,time,urllib.request
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW
raw=os.path.join(RAW,'kamje-members.html')
if not os.path.exists(raw): open(raw,'wb').write(urllib.request.urlopen(urllib.request.Request('https://www.kamje.or.kr/association/list_association',headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=120).read())
from parsers import parse_kamje
out=parse_kamje(open(raw,encoding='utf8',errors='ignore').read())
nur=[x for x in out if re.search(r'간호|[Nn]urs',x['title']+' '+(x['societyKo'] or ''))]
json.dump(out,open(os.path.join(RAW,'kamje-members.json'),'w'),ensure_ascii=False)
record('KAMJE member journals','complete',query='GET https://www.kamje.or.kr/association/list_association',fetched=len(out),pagination='single page',nursingByOfficialSocietyOrTitle=len(nur),files=['kamje-members.html','kamje-members.json'],notes='Society name containing 간호 (nursing) is used as scope evidence; the list has no ISSNs, journals are joined to KoreaMed by exact title.')
print(len(out),'KAMJE member rows;',len(nur),'nursing by society/title'); [print('  ',x['title'][:50],'|',x['societyKo']) for x in nur[:20]]
