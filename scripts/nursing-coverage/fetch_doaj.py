"""
DOAJ journals relevant to Nursing, from the official journal CSV (https://doaj.org/csv, published for bulk use).  Two independent selectors:
  1. DOAJ's own subject classification contains "Nursing" (Library of Congress class RT) or "Midwifery";
  2. a multilingual nursing term in the title, alternative title or author keywords: nurs, midwif, enfermer, enfermag, infirm, sage-femme, pflege, hebamm, sykepleie, sjukskö, verpleeg, kango, 看護, 간호, hemşire, keperawatan, kebidanan, pielęgn, sestr, medsestr.
Keyword hits alone are weaker than the subject classification and are flagged as such. Facts only (title, ISSNs, publisher, country, URL, licence, languages, subjects).
  python3 fetch_doaj.py
"""
import csv,json,os,re,sys,time,urllib.request
sys.path.insert(0,os.path.dirname(__file__)); from ledger import record,RAW
csv.field_size_limit(10**9)
raw=os.path.join(RAW,'doaj.csv')
if not os.path.exists(raw) or os.path.getsize(raw)<1000000:
    req=urllib.request.Request('https://doaj.org/csv',headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}); open(raw,'wb').write(urllib.request.urlopen(req,timeout=300).read())
rows=list(csv.DictReader(open(raw,encoding='utf8',errors='ignore')))
SUB=re.compile(r'nursing|midwifery',re.I)
TERM=re.compile(r'nurs|midwif|enfermer|enfermag|infirm|sage-?femme|pflege|hebamm|sykepleie|sjuksk|verpleeg|kango|看護|간호|hemşire|hemsire|keperawatan|kebidanan|pielęgn|pielegn|sestr|medsestr',re.I)
out=[]
for r in rows:
    subj=r.get('Subjects') or ''; ttl=' '.join([r.get('Journal title') or '',r.get('Alternative title') or '']); kw=r.get('Keywords') or ''
    s=bool(SUB.search(subj)); t=bool(TERM.search(ttl)); k=bool(TERM.search(kw))
    if s or t or k:
        out.append({'title':r.get('Journal title'),'altTitle':r.get('Alternative title') or None,'issn':(r.get('Journal ISSN (print version)') or '').strip() or None,'eissn':(r.get('Journal EISSN (online version)') or '').strip() or None,'publisher':r.get('Publisher'),'country':r.get('Country of publisher'),'url':r.get('Journal URL'),'doajUrl':r.get('URL in DOAJ'),'licence':r.get('Journal license'),'licenceAttributes':r.get('License attributes'),'languages':r.get('Languages in which the journal accepts manuscripts'),'subjects':subj,'selectedBy':{'doajSubject':s,'titleTerm':t,'keywordTerm':k}})
json.dump(out,open(os.path.join(RAW,'doaj-nursing.json'),'w'),ensure_ascii=False)
c={'doajSubject':sum(1 for x in out if x['selectedBy']['doajSubject']),'titleTermOnly':sum(1 for x in out if not x['selectedBy']['doajSubject'] and x['selectedBy']['titleTerm']),'keywordOnly':sum(1 for x in out if not x['selectedBy']['doajSubject'] and not x['selectedBy']['titleTerm'] and x['selectedBy']['keywordTerm'])}
record('DOAJ (journal CSV)','complete',query='https://doaj.org/csv, filter: Subjects ~ Nursing|Midwifery, or multilingual nursing term in title/alt title/keywords',fetched=len(rows),pagination='single CSV file',selected=len(out),selectedBreakdown=c,files=['doaj.csv','doaj-nursing.json'],notes='DOAJ licence fields are kept as facts for the Accepted test only; a DOAJ listing is not used as scope evidence for keyword-only hits.')
print(len(rows),'DOAJ journals;',len(out),'selected',c)
