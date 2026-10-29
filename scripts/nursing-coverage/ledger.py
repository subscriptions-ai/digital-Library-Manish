"""
Source coverage ledger. Every fetch step records one entry here; the ledger is committed, the raw files it points to are not (they stay under data/nursing-coverage/raw/, with their
SHA-256 recorded so a later run can tell whether the data it reuses is the data this one saw).

  from ledger import record
  record('CINAHL Complete', status='complete', query='...', fetched=6697, pagination='single file', files=['cinahl/ccm-coverage.htm'], notes='...')

status: complete | partial | blocked | not-attempted
"""
import json,os,hashlib,time
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
RAW=os.path.join(ROOT,'data','nursing-coverage','raw')
LEDGER=os.path.join(ROOT,'docs','nursing-coverage-2026-10-29','coverage-ledger.json')
def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''): h.update(b)
    return h.hexdigest()
def record(source,status,**kw):
    d=json.load(open(LEDGER)) if os.path.exists(LEDGER) else {}
    files={}
    for f in kw.pop('files',[]) or []:
        p=os.path.join(RAW,f)
        if os.path.exists(p): files[f]={'sha256':sha(p),'bytes':os.path.getsize(p)}
    d[source]={'status':status,'retrieved':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),**kw,'rawFiles':files}
    json.dump(d,open(LEDGER,'w'),indent=1,ensure_ascii=False); return d[source]
