"""
Write the reviewable manifests of the Nursing assessment from nu/assessment-final.json. Local files only; nothing is written to any database.

  python3 build_manifests.py <work-dir> <out-dir>

  plan-needsreview-to-metadataonly.json  apply-ready plan for scripts/nursing-assessment/journal-status-apply.cjs (existing records, status only)
  plan-netnew-insert.json                apply-ready plan for scripts/journal-source-apply.cjs (genuinely new journals, MetadataOnly, OA not verified)
  eligible-candidates.csv                one reviewable row per eligible journal: title, ISSN/eISSN, publisher, homepage, Nursing scope evidence, latest publication evidence, source URLs, verification date
  held.json                              every other record with its primary reason and all reasons
"""
import json,csv,sys,collections,datetime
W,O=sys.argv[1],sys.argv[2]; TODAY='2026-10-28'
a=json.load(open(f'{W}/nu/assessment-final.json'))
PRIORITY=['SciELO','NLM Catalog','CINAHL','OpenAlex']
def scope_text(s):
    bits=[]
    if s.get('NLM'): bits.append('NLM subject "Nursing"')
    if s.get('CINAHL'): bits.append('CINAHL Nursing discipline')
    if s.get('SCIELO'): bits.append('SciELO WoS area NURSING')
    if s.get('OA'): bits.append(f"OpenAlex topics {int((s.get('oaShare') or 0)*100)}% nursing")
    if s.get('PUB'): bits.append('publisher is a nursing body')
    if s.get('TITLE'): bits.append('title names nursing')
    return '; '.join(bits)
def pub_text(p):
    out=[]
    cr,oa,pm,j=p.get('crossref'),p.get('openalex'),p.get('pubmed'),p.get('jstage')
    if cr: out.append('Crossref 2024-26 DOIs: '+str(sum(cr['byYear'].get(y,0) for y in ('2024','2025','2026'))))
    if oa: out.append('OpenAlex 2024-26 works: '+str(sum(oa['byYear'].get(y,0) for y in ('2024','2025','2026'))))
    if pm: out.append('PubMed 2024-26: '+str(pm['articles2024to2026']))
    if j: out.append('J-STAGE 2024-26: '+str(j['articles2024to2026']))
    out+=p.get('currentlyPublishedStatements') or []
    return '; '.join(out)+' ['+'; '.join(p.get('why') or [])+']'
def urls_nr(x):
    p=x['publication']; u=[]
    if p.get('crossref'): u.append('https://api.crossref.org/journals/'+p['crossref']['via'])
    if p.get('openalex'): u.append('https://api.openalex.org/sources/issn:'+p['openalex']['via'])
    if p.get('pubmed'): u.append('https://pubmed.ncbi.nlm.nih.gov/?term='+p['pubmed']['via']+'%5BISSN%5D&filter=years.2024-2026')
    return u
rowsS=[];rowsI=[];csvrows=[];held=[]
for x in a['needsReview']:
    if x['metadataOnlyEligible']:
        pf=(x.get('publisherFill') or {}).get('value')
        rowsS.append({'id':x['id'],'issn':x['issn'],'eissn':x['eissn'],'title':x['title'],'publisherFill':pf,'evidence':{'scope':x['scope'],'publication':{'class':x['publication']['class'],'why':x['publication']['why'],'recentMax':x['publication']['recentMax']},'verified':TODAY,'urls':urls_nr(x)}})
        csvrows.append({'set':'existing NeedsReview -> MetadataOnly','title':x['title'],'issn':x['issn'],'eissn':x['eissn'] or '','publisher':x['publisher'] or (pf or ''),'publisherNote':'filled from '+x['publisherFill']['source'] if pf else '','homepage':x['homepage'] or '','nursingScopeEvidence':scope_text(x['scope']),'latestPublicationEvidence':pub_text(x['publication']),'sourceUrls':' | '.join(urls_nr(x)),'verified':TODAY,'recordId':x['id']})
    else:
        held.append({'set':'existing NeedsReview','id':x['id'],'title':x['title'],'issn':x['issn'],'eissn':x['eissn'],'primary':x['primary'],'reasons':x['holdReasons'],'scopeTier':x['scope']['tier'],'publicationClass':x['publication']['class']})
for x in a['netNew']:
    srcs=sorted({s['source'] for s in x['sources']},key=lambda s:PRIORITY.index(s) if s in PRIORITY else 9)
    if x['metadataOnlyEligible']:
        pf=(x.get('publisherFill') or {}).get('value'); ids=x['issns']
        urls=[s['ref'] for s in x['sources'] if str(s['ref']).startswith('http')]+urls_nr(x)
        rowsI.append({'title':x['title'],'issn':ids[0],'eissn':ids[1] if len(ids)>1 else None,'publisherName':x['publisher'] or pf,'subjects':[],'domain':'Nursing','country':None,'homepage':x['homepage'],'basisSource':srcs[0],'sourceId':'|'.join(f"{s['source']}:{s['ref']}" for s in x['sources']),'evidence':{'sources':x['sources'],'scope':x['scope'],'publication':{'class':x['publication']['class'],'why':x['publication']['why'],'recentMax':x['publication']['recentMax']},'verified':TODAY,'urls':urls}})
        csvrows.append({'set':'net-new journal ('+'+'.join(srcs)+')','title':x['title'],'issn':ids[0],'eissn':ids[1] if len(ids)>1 else '','publisher':x['publisher'] or (pf or ''),'publisherNote':'filled from '+x['publisherFill']['source'] if pf else '','homepage':x['homepage'] or '','nursingScopeEvidence':scope_text(x['scope']),'latestPublicationEvidence':pub_text(x['publication']),'sourceUrls':' | '.join(urls),'verified':TODAY,'recordId':''})
    else:
        held.append({'set':'net-new','title':x['title'],'issn':x['issns'][0],'issns':x['issns'],'sources':sorted({s['source'] for s in x['sources']}),'primary':x['primary'],'reasons':x['holdReasons'],'scopeTier':x['scope']['tier'],'publicationClass':x['publication']['class']})
json.dump({'runId':'nursing-statusfix-2026-10-28','department':'Nursing','from':'NeedsReview','to':'MetadataOnly','rows':rowsS},open(f'{O}/plan-needsreview-to-metadataonly.json','w'),ensure_ascii=False,indent=1)
json.dump({'runId':'nursing-netnew-2026-10-28','source':'Multiple (per row basisSource)','rows':rowsI},open(f'{O}/plan-netnew-insert.json','w'),ensure_ascii=False,indent=1)
with open(f'{O}/eligible-candidates.csv','w',newline='',encoding='utf8') as f:
    w=csv.DictWriter(f,fieldnames=list(csvrows[0].keys())); w.writeheader(); w.writerows(csvrows)
json.dump(held,open(f'{O}/held.json','w'),ensure_ascii=False,indent=0)
print('status plan rows',len(rowsS),'| insert plan rows',len(rowsI),'| csv rows',len(csvrows),'| held',len(held))
print('insert plan by basis source:',dict(collections.Counter(r['basisSource'] for r in rowsI)))
