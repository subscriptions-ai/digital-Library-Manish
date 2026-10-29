"""
J-STAGE (JST) official journal list, published as public data (https://www.jstage.jst.go.jp/static/pages/PublicDataAboutJstage/-char/en -> /pub/jnllist/journals_list_en.zip).
This is the permitted discovery route: no list page is scraped (J-STAGE's terms forbid bulk mechanical download of its pages).  Kept per journal: J-STAGE code, title, language, ISSN / eISSN /
ISSN-L, organisation, journal URL, J-STAGE page, first and latest volume, CURRENT PUBDATE (the latest publication date J-STAGE holds), total articles, PubMed / DOAJ / Scopus flags, SUSPENDED.
Contact columns (address, e-mail, telephone, fax) are dropped.
  python3 fetch_jstage.py
"""
import json,os,re,sys,zipfile,urllib.request
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW
D=os.path.join(RAW,'jstage'); os.makedirs(D,exist_ok=True); z=os.path.join(D,'journals_list_en.zip'); t=os.path.join(D,'journals_list_en.txt')
if not os.path.exists(z): open(z,'wb').write(urllib.request.urlopen(urllib.request.Request('https://www.jstage.jst.go.jp/pub/jnllist/journals_list_en.zip',headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=180).read())
if not os.path.exists(t): zipfile.ZipFile(z).extractall(D)
from parsers import parse_jstage_list
updated,out=parse_jstage_list(open(t,encoding='utf8',errors='ignore').read())
json.dump(out,open(os.path.join(RAW,'jstage-journals.json'),'w'),ensure_ascii=False)
nur=[x for x in out if re.search(r'nurs|midwif|kango',x['title']+' '+x['organization'],re.I)]
record('J-STAGE official journal list','complete',query='https://www.jstage.jst.go.jp/pub/jnllist/journals_list_en.zip (J-STAGE "Public data"), '+updated,fetched=len(out),pagination='single file',nursingByTitleOrOrganisation=len(nur),files=['jstage/journals_list_en.zip','jstage-journals.json'],notes='Official public-data export; CURRENT PUBDATE is J-STAGE\'s own latest-publication date. No subject area is published, so scope comes from title/organisation words and other sources. Per-ISSN WebAPI queries stay available for single journals. List pages were not scraped.')
print(len(out),'J-STAGE journals;',len(nur),'with a nursing word in title/organisation'); [print('  ',x['title'][:55].ljust(55),x['issn'],x['eissn'],x['currentPubdate'],'|',x['organization'][:40]) for x in nur[:12]]
