"""
Assemble the audit manifest of the run from the files the run produced. Reads <out-dir>/: manifest-frozen.json, plan-canary.json, plan-rest.json, canary-result.json, rest-result*.json,
verify-before.json, verify-canary.json, verify-final.json, rollback-review.json, hand-holds.json ; plus work/stage1+2 for the held reasons. Writes <out-dir>/audit-manifest.json.

  python3 build_audit_manifest.py <run-id> <out-dir>
The exact-ID-scoped rollback statement is generated here and NEVER executed by any script of this run.
"""
import json,os,sys,hashlib,glob,subprocess,collections
sys.path.insert(0,os.path.dirname(__file__)); from ledger import ROOT
RUN,OUT=sys.argv[1],sys.argv[2]
rd=lambda f:json.load(open(f'{OUT}/{f}')) if os.path.exists(f'{OUT}/{f}') else None
sha=lambda f:hashlib.sha256(open(f'{OUT}/{f}','rb').read()).hexdigest()
frozen=rd('manifest-frozen.json'); canary=rd('plan-canary.json'); rest=rd('plan-rest.json')
cres=rd('canary-result.json'); rres=[rd(os.path.basename(f)) for f in sorted(glob.glob(f'{OUT}/rest-result*.json'))]
ids_c=cres['insertedIds'] if cres else []; ids_r=[i for r in rres for i in r['insertedIds']]
allids=ids_c+ids_r
code={}
for f in ['src/lib/ingestion/officialListDepartment.ts','src/lib/ingestion/titleTopicDepartment.ts','src/lib/ingestion/openAlexDepartments.ts','src/lib/ingestion/nlmJournalDepartment.ts','src/lib/ingestion/journalSourceImport.ts','scripts/journal-source-apply.cjs','scripts/dept-coverage/verify-prod.cjs','scripts/dept-coverage/stage1.py','scripts/dept-coverage/stage2.py','scripts/dept-coverage/freeze.py','scripts/dept-coverage/build_pool.py','scripts/dept-coverage/classify.ts']:
    code[f]=hashlib.sha256(open(os.path.join(ROOT,f),'rb').read()).hexdigest()
head=subprocess.run(['git','rev-parse','HEAD'],capture_output=True,text=True,cwd=ROOT).stdout.strip()
sql='DELETE FROM "Journal" j WHERE j.id = ANY($1::text[]) AND NOT EXISTS (SELECT 1 FROM "Article" a WHERE a."journalId" = j.id) RETURNING j.id, j.issn'
m={'runId':RUN,'executed':{'canary':(cres or {}).get('startedAt'),'remainder':[r.get('startedAt') for r in rres]},
   'frozenManifest':{'file':'manifest-frozen.json','sha256':sha('manifest-frozen.json'),'candidates':frozen['candidates']},
   'planChecksums':{f:sha(f) for f in('plan-canary.json','plan-rest.json','hand-holds.json') if os.path.exists(f'{OUT}/{f}')},
   'code':{'frozenAtCommit':(open(f'{OUT}/frozen-at-commit.txt').read().strip() if os.path.exists(f'{OUT}/frozen-at-commit.txt') else None),'headWhenAssembled':head,'fileSha256':code},
   'canaryResult':cres and {k:cres[k] for k in cres if k!='insertedIds'},'restResults':[{k:r[k] for k in r if k!='insertedIds'} for r in rres],
   'verifyBefore':rd('verify-before.json'),'canaryVerification':rd('verify-canary.json'),'finalVerification':rd('verify-final.json'),
   'inserted':{'count':len(allids),'ids':allids,'canaryIds':ids_c,'restIds':ids_r,
               'rows':(rd('inserted-rows.json') or {}).get('rows')},
   'auditLocation':'Production table "IngestionAudit", action JOURNAL_SOURCE_IMPORT, meta.runId = this run id: one entry per batch, each listing inserted id, issn, dept, sourceId and evidence.',
   'rollback':{'sql':sql,'scope':'the exact inserted ids of this run; the rightsBasis label is shared with other runs and is NOT a safe scope','reviewed':rd('rollback-review.json'),'executed':False,'note':'Article.journalId is ON DELETE SET NULL, so the NOT EXISTS guard is essential. Re-count articles, ingestion runs and library events for these ids before any use. Audit rows have no foreign key and are never deleted.'}}
json.dump(m,open(f'{OUT}/audit-manifest.json','w'),indent=1,ensure_ascii=False)
print('audit manifest written: inserted',len(allids),'canary',len(ids_c),'rest',len(ids_r))
