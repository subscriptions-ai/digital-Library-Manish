"""MLT books: OpenAlex works (type=book, open access, English, CC licence on the primary record, 2001+) for the lab topics and the narrow title terms. READ-ONLY against OpenAlex.
usage: python3 scripts/dept-mlt-books-harvest.py <out candidates.ndjson>   (format of scripts/books-dept-fill.ts: {department, query, w})"""
import json,os,re,sys,time,urllib.request,urllib.parse
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
KEY=os.environ.get('OPENALEX_API_KEY') or re.search(r'^OPENALEX_API_KEY=(.*)$',open(os.path.join(ROOT,'.env')).read(),re.M).group(1).strip()
SEL='id,doi,display_name,publication_year,language,type,authorships,primary_location,open_access,primary_topic,topics,abstract_inverted_index,updated_date'
LIC='primary_location.license:cc-by|cc-by-nc|cc-by-nc-nd|cc-by-nc-sa|cc-by-sa|cc-by-nd|cc0'
BASE='type:book,open_access.is_oa:true,language:en,from_publication_date:2001-01-01,'+LIC
QUERIES=[('topics','topics.id:T11314|T12167|T11660|T10693|T12735|T12874|T11754'),('subfield','primary_topic.subfield.id:3607|1308|2734|2720')]
for t in ['clinical laboratory','medical laboratory','laboratory medicine','phlebotomy','blood bank','blood banking','hematology','haematology','clinical chemistry','clinical biochemistry','histopathology','histotechnology','cytopathology','cytology','medical microbiology','diagnostic microbiology','clinical microbiology','point-of-care','transfusion','clinical pathology','medical parasitology','urinalysis','laboratory techniques','laboratory diagnosis','immunohematology','serology','laboratory safety','quality control laboratory','clinical immunology','molecular diagnostics']:
    QUERIES.append(('title:'+t,'title.search:'+t.replace(',',' ').replace(':',' ')))
out=sys.argv[1]; seen=set(); os.makedirs(os.path.dirname(out),exist_ok=True)
def get(url):
    for a in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'STM Digital Library (mailto:info@celnet.in)'}),timeout=90))
        except Exception: time.sleep(3*(a+1))
    return None
with open(out,'w') as f:
    for name,flt in QUERIES:
        cursor='*'; n=0; new=0; total=0
        while cursor and n<20:
            url='https://api.openalex.org/works?'+urllib.parse.urlencode({'filter':BASE+','+flt,'select':SEL,'per-page':100,'cursor':cursor,'mailto':'info@celnet.in','api_key':KEY})
            d=get(url)
            if not d: print('FAILED',name); break
            total=d['meta']['count']
            for w in d['results']:
                if w['id'] in seen: continue
                seen.add(w['id']); new+=1; f.write(json.dumps({'department':'Medical Laboratory Technology','query':name,'w':w},ensure_ascii=False)+'\n')
            cursor=d['meta'].get('next_cursor') if d['results'] else None; n+=1; time.sleep(0.2)
        print(name,'openalex',total,'new',new,flush=True)
print('candidates',len(seen))
