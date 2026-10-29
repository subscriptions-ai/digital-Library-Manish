"""
Stage 4: lineage checks and the deliverables.

  python3 stage4_finalize.py [--no-network]     reads work/stage3.json, work/stage1-nr.json, the ledger, the earlier preview/held manifests
  writes docs/nursing-coverage-2026-10-29/: candidates.json, candidates.csv, eligible-preview-manifest.json, held.json, previously-held-reassessment.json,
                                            needsreview-reassessment.json, reconciliation.json   (+ work/stage4.json)

For every candidate that has no hold reason yet:
  - NLM Catalog relations (efetch, "Continues / Continued by ..."): a related ISSN that is a catalogue journal, or another candidate, makes it a rename/continuation, not a new journal;
  - the journal's own homepage is read once (robots.txt respected) for a short Nursing aims/scope excerpt; no excerpt does not by itself exclude, the independent signals remain the evidence.
Primary reason order is the one in stage3 (rename comes third); a record that gets a reason here is re-ranked, so unique totals still reconcile.
"""
import json,os,sys,re,csv,time,hashlib,collections,datetime
sys.path.insert(0,os.path.dirname(__file__)); from common import *
NET='--no-network' not in sys.argv
rows=json.load(open(f'{WORK}/stage3.json')); cat=json.load(open(f'{RAW}/catalogue-snapshot.json'))['all']
issnRow={}
for j in cat:
    for i in (j['issn'],j['eissn']):
        if i: issnRow[i]=j
keyOf={}
for r in rows:
    for i in r['issns']: keyOf[i]=r['key']
import urllib.request,xml.etree.ElementTree as ET
def nlm_rel(uid):
    url=f'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nlmcatalog&id={uid}&retmode=xml'
    for a in range(3):
        try: root=ET.fromstring(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=60).read()); break
        except Exception: root=None; time.sleep(2*(a+1))
    if root is None: return None
    return [{'type':(tr.findtext('TitleRelatedType') or '').strip(),'title':(tr.findtext('Title') or '').strip(),'issns':[(e.text or '').strip() for e in tr.iter('ISSN')]} for tr in root.iter('TitleRelated')]
RANK=['invalid_issn','title_conflict','rename_or_continuation','rename_or_near_title','non_journal_risk','identity_unconfirmed','scope_insufficient','scope_single_signal','no_publisher','publication_ceased','publication_uncertain','publication_no_evidence','single_source_identity']
lineage_checked=0
for r in rows:
    r['nlmRelations']=None
    if r['holdReasons'] or r['dedupe']!='net_new' or not NET: continue
    uid=next((s['facts'].get('uid') for s in r['sources'] if s['source']=='NLM Catalog'),None)
    if not uid: continue
    rel=nlm_rel(uid); time.sleep(0.4); lineage_checked+=1; r['nlmRelations']=rel
    for x in rel or []:
        for i in x['issns']:
            if i in r['issns']: continue
            if i in issnRow: r['holdReasons'].append(('rename_or_continuation',f"NLM relation '{x['type'] or 'related title'}' to catalogue journal {issnRow[i]['title'][:50]} ({issnRow[i]['status']}/{issnRow[i]['domain']})")); break
            if i in keyOf and keyOf[i]!=r['key']: r['holdReasons'].append(('rename_or_continuation',f"NLM relation '{x['type'] or 'related title'}' to another candidate ({x['title'][:50]}): one lineage, needs a person")); break
        else: continue
        break
for r in rows:
    r['holdReasons']=sorted(r['holdReasons'],key=lambda x:RANK.index(x[0]) if x[0] in RANK else 99); r['primary']=r['holdReasons'][0][0] if r['holdReasons'] else None
# excerpts for the survivors
surv=[r for r in rows if not r['holdReasons'] and r['dedupe']=='net_new']
exc={}
if NET and surv:
    from scope_excerpt import probe
    for r in surv:
        if r['homepageResolved'] and r['homepageResolved'].startswith('http'): exc[r['key']]=probe(r['homepageResolved']); time.sleep(2)
for r in rows: r['aimsExcerpt']=exc.get(r['key']); r['final']='eligible' if (not r['holdReasons'] and r['dedupe']=='net_new') else ('title_conflict' if r['dedupe']=='title_conflict' else 'held')
json.dump(rows,open(f'{WORK}/stage4.json','w'),ensure_ascii=False)
ledger=json.load(open(f'{OUT}/coverage-ledger.json')); RET=lambda s: (ledger.get(s) or {}).get('retrieved')
SRCDATE={'OpenAlex':RET('OpenAlex (topics.field.id:29, type:journal)'),'CINAHL':RET('CINAHL Complete coverage list'),'NLM Catalog':RET('NLM Catalog (merged)'),'DOAJ':RET('DOAJ (journal CSV)'),'SciELO':RET('SciELO (merged)'),'KoreaMed':RET('KoreaMed journal browser'),'J-STAGE':RET('J-STAGE official journal list')}
def sig_list(s): return [k for k in('NLM','CINAHL','SCIELO','OA','DOAJ','SOCIETY','TITLE') if s.get(k)]
def sid(r):
    out={}
    for s in r['sources']:
        f=s['facts']; k=s['source']
        out[k]=f.get('uid') or f.get('oaId') or f.get('cd') or f.get('koreamedId') or (f.get('evidenceUrl') or '')
    return out
def lic(r):
    d=[s['facts'] for s in r['sources'] if s['source']=='DOAJ']
    return {'doajLicence':d[0]['licence'] if d else None,'basis':'DOAJ declaration' if d else 'unknown (no explicit licence/OA statement in any source read)'}
out=[]
for r in rows:
    p=r['publication']
    out.append({'key':r['key'],'final':r['final'],'primaryReason':r['primary'],'secondaryReasons':[k for k,_ in r['holdReasons'][1:]],'reasonDetail':r['holdReasons'],
      'title':r['title'],'alternateTitles':r['altTitles'],'issn':r['issns'][0],'eissn':r['issns'][1] if len(r['issns'])>1 else None,'allIssns':r['issns'],'sourceIdentifiers':sid(r),
      'publisher':r['publisherResolved'],'homepage':r['homepageResolved'],
      'scope':{'tier':r['scope']['tier'],'signals':sig_list(r['scope']),'oaTopicShare':r['scope']['oaShare'],'evidence':r['scope']['evidence'],'aimsExcerpt':(r['aimsExcerpt'] or {}).get('excerpt'),'aimsUrl':(r['aimsExcerpt'] or {}).get('finalUrl'),'aimsRetrieved':(r['aimsExcerpt'] or {}).get('retrieved')},
      'publication':{'status':p['status'],'class':p['class'],'why':p['why'],'works2024to2026':p['works2024to2026'],'currentStatements':p['currentStatements'],'endedStatements':p['endedStatements'],'latestConfirmed':p['latestConfirmed']},
      'lineage':{'nlmRelations':r['nlmRelations'],'koreamedFormerTitle':next((s['facts'].get('formerTitle') for s in r['sources'] if s['source']=='KoreaMed'),None),'nearCatalogueTitles':r['renameSimilar']},
      'licenceOA':lic(r),'dedupe':r['dedupe'],'conflict':r.get('conflict'),'previously':r['previously'],
      'listedBy':sorted({s['source'] for s in r['sources']}),'sourceUrls':[s['facts'].get('evidenceUrl') for s in r['sources'] if s['facts'].get('evidenceUrl')]+([p['latestConfirmed']['url']] if p['latestConfirmed'] else []),
      'retrievedBySource':{s:SRCDATE.get(s) for s in sorted({x['source'] for x in r['sources']})}})
json.dump(out,open(f'{OUT}/candidates.json','w'),ensure_ascii=False,indent=0)
with open(f'{OUT}/candidates.csv','w',newline='',encoding='utf8') as f:
    w=csv.writer(f); w.writerow(['final','primary_reason','secondary_reasons','title','alternate_titles','issn','eissn','publisher','homepage','nursing_scope_tier','nursing_scope_signals','aims_excerpt','publication_status','latest_confirmed_date','latest_confirmed_url','predecessor_successor','licence_oa','listed_by','source_urls','retrieved'])
    for c in out: w.writerow([c['final'],c['primaryReason'] or '','; '.join(c['secondaryReasons']),c['title'],' | '.join(c['alternateTitles'][:4]),c['issn'],c['eissn'] or '',c['publisher'] or '',c['homepage'] or '',c['scope']['tier'],'+'.join(c['scope']['signals']),c['scope']['aimsExcerpt'] or '',c['publication']['status'],(c['publication']['latestConfirmed'] or {}).get('date',''),(c['publication']['latestConfirmed'] or {}).get('url',''),json.dumps(c['lineage']['nlmRelations'],ensure_ascii=False) if c['lineage']['nlmRelations'] else (c['lineage']['koreamedFormerTitle'] or ''),c['licenceOA']['basis'],'+'.join(c['listedBy']),' | '.join(c['sourceUrls'][:3]),json.dumps(c['retrievedBySource'])])
elig=[c for c in out if c['final']=='eligible']
json.dump({'note':'PREVIEW of the eligible net-new set. Not frozen: freezing happens in stage5 immediately before any write.','eligible':len(elig),'rows':elig},open(f'{OUT}/eligible-preview-manifest.json','w'),ensure_ascii=False,indent=0)
json.dump([c for c in out if c['final']!='eligible'],open(f'{OUT}/held.json','w'),ensure_ascii=False,indent=0)
# previously held (1,384) reassessment
prev=[c for c in out if c['previously']]
mv=collections.Counter(); 
for c in prev: mv[(c['previously']['primary'] or '?', c['primaryReason'] or 'ELIGIBLE')]+=1
json.dump({'previouslyHeldRecordsFoundInThePool':len(prev),'nowEligible':sum(1 for c in prev if c['final']=='eligible'),'movement':[{'was':a,'now':b,'n':n} for (a,b),n in mv.most_common()],'rows':[{'issn':c['issn'],'title':c['title'],'was':c['previously'],'nowFinal':c['final'],'nowPrimary':c['primaryReason'],'nowSecondary':c['secondaryReasons'],'newSources':c['listedBy']} for c in prev]},open(f'{OUT}/previously-held-reassessment.json','w'),ensure_ascii=False,indent=0)
# existing NeedsReview (827): link the preview manifests, add the re-scored scope; nothing is proposed beyond the earlier preview
nr=json.load(open(f'{WORK}/stage1-nr.json'))
def sha(p): 
    with open(os.path.join(ROOT,p),'rb') as f: return hashlib.sha256(f.read()).hexdigest()
link={f:sha(f) for f in ('docs/nursing-assessment-2026-10-28/plan-needsreview-to-metadataonly.json','docs/nursing-assessment-2026-10-28/held.json','docs/nursing-assessment-2026-10-28/report.md')}
json.dump({'status':'PREVIEW ONLY: no status change is made or proposed by this run','linkedEarlierAssessment':link,'recordsReScoredWithTheNewSources':len(nr),'newScopeTier':dict(collections.Counter(x['scope']['tier'] for x in nr)),'rows':[{'id':x['id'],'title':x['title'],'issn':x['issn'],'newTier':x['scope']['tier'],'signals':sig_list(x['scope']),'evidence':x['scope']['evidence'],'listedBy':sorted({s['source'] for s in x['sources']})} for x in nr]},open(f'{OUT}/needsreview-reassessment.json','w'),ensure_ascii=False,indent=0)
# reconciliation
s1=json.load(open(f'{OUT}/stage1-counts.json'))
prim=collections.Counter(c['primaryReason'] or 'ELIGIBLE' for c in out if c['dedupe']=='net_new')
rec={'bySource':s1['bySource'],'stage1':s1['summary'],'poolCounts':{k:v for k,v in s1.items() if k not in('bySource','summary')},'netNewCandidates':sum(1 for c in out if c['dedupe']=='net_new'),'titleConflicts':sum(1 for c in out if c['dedupe']=='title_conflict'),
 'netNewByUniquePrimary':dict(prim.most_common()),'netNewUniquePrimarySum':sum(prim.values()),'eligible':len(elig),'nlmLineageChecked':lineage_checked,
 'secondaryReasonInstances':dict(collections.Counter(k for c in out if c['dedupe']=='net_new' for k in c['secondaryReasons']).most_common()),'homepageExcerptsRead':len(exc),'homepageExcerptsFound':sum(1 for v in exc.values() if v.get('excerpt'))}
rec['reconciles']=(rec['netNewUniquePrimarySum']==rec['netNewCandidates'] and rec['netNewCandidates']==s1['summary'].get('net-new candidate (tier A)',0)+s1['summary'].get('net-new candidate (tier B)',0)+s1['summary'].get('net-new candidate (tier C)',0))
json.dump(rec,open(f'{OUT}/reconciliation.json','w'),indent=1,ensure_ascii=False)
print(json.dumps({k:rec[k] for k in('netNewCandidates','titleConflicts','netNewByUniquePrimary','eligible','reconciles','nlmLineageChecked','homepageExcerptsRead','homepageExcerptsFound')},indent=1))
