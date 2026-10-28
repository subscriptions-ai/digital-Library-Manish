"""
Parse an EBSCO title list HTML (https://about.ebsco.com/title-lists, e.g. CINAHL Complete "Database Coverage List") into bibliographic facts only:
coverage policy, source type, ISSN, publication name, publisher, indexing start/stop, peer-reviewed, country. Nothing else of the list is kept.

  python3 parse_cinahl.py ccm-coverage.htm out.json
"""
import re,html,json,sys
s=open(sys.argv[1],encoding='utf8',errors='ignore').read()
rows=re.findall(r'<tr[^>]*>(.*?)</tr>',s,flags=re.S|re.I); out=[]; header=None
for r in rows:
    cells=[html.unescape(re.sub(r'<[^>]+>','',c)).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>',r,flags=re.S|re.I)]
    if 'Publication Name' in cells: header=cells; continue
    if header and len(cells)>=len(header)-2 and cells[:1]!=['']:
        row=dict(zip(header,cells))
        if row.get('Publication Name'): out.append(row)
print(len(out),'rows; header:',header)
keep=[]
for r in out:
    keep.append({'policy':r.get('Coverage Policy'),'type':r.get('Source Type'),'issn':r.get('ISSN / ISBN'),'title':r.get('Publication Name'),'publisher':r.get('Publisher'),'idxStart':r.get('Indexing and Abstracting Start'),'idxStop':r.get('Indexing and Abstracting Stop'),'peer':r.get('Peer-Reviewed'),'country':r.get('Country'),'mid':r.get('MID')})
json.dump(keep,open(sys.argv[2],'w'),ensure_ascii=False); 
import collections; print(collections.Counter(k['policy'] for k in keep),collections.Counter(k['type'] for k in keep).most_common(6))
