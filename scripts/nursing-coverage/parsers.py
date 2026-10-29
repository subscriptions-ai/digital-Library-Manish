"""Pure parsers for the fetched source files (no network), so they can be tested on fixtures and on the cached raw files."""
import csv,io,html,re

def parse_jstage_list(text):
    """J-STAGE official journal list (tab separated, first line 'UPDATE:...'): one dict per journal, contact columns dropped."""
    lines=text.splitlines(); updated=lines[0].strip()
    rows=list(csv.DictReader(io.StringIO('\n'.join(lines[1:]).lstrip('\n')),delimiter='\t')); out=[]
    for r in rows:
        if not r.get('CDJOURNAL'): continue
        out.append({'cd':r['CDJOURNAL'],'title':r['JOURNALTITLE'],'language':r['LANGUAGE'],'issn':r['PRINTISSN'] or None,'eissn':r['ONLINEISSN'] or None,'issnL':r['ISSN-L'] or None,'organization':r['ORGANIZATION'],'url':r['URL'] or None,'jstageUrl':r['TOPURL'],'type':r['PUBLICATION TYPE'],'latestVolume':r['LATEST VOLUME'],'currentPubdate':r['CURRENT PUBDATE'] or None,'totalArticles':r['TOTAL ARTICLES'] or None,'pubmed':bool(r['PubMed']),'doaj':bool(r['DOAJ']),'scopus':bool(r['Scopus']),'suspended':bool(r['SUSPENDED'])})
    return updated,out

def parse_ebsco_table(htm):
    """EBSCO title-list HTML: rows keyed by the header row that contains 'Publication Name'."""
    out=[];header=None
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>',htm,flags=re.S|re.I):
        cells=[html.unescape(re.sub(r'<[^>]+>','',c)).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>',r,flags=re.S|re.I)]
        if 'Publication Name' in cells: header=cells; continue
        if header and len(cells)>=len(header)-3:
            row=dict(zip(header,cells))
            if row.get('Publication Name'): out.append(row)
    return out

def parse_koreamed(htm):
    """KoreaMed journal browser: title, abbreviation, ISSN, KoreaMed id and the 'now published as' (rename) relation."""
    out=[]
    for li in re.findall(r"<li>(<a href='/volumes/.*?)</li>",htm,flags=re.S):
        items=re.findall(r"<a href=['\"]/volumes/(\d+)['\"] class=['\"]title['\"]>(?:<img[^>]*>)?(.*?)</a>\s*(?:&nbsp;)?\s*<span class=['\"]issn['\"]>\s*(.*?)(?:&nbsp;)?\s*<span>(\d{4}-\d{3}[\dX])</span>",li,flags=re.S)
        if not items: continue
        cur=[{'koreamedId':k,'title':html.unescape(re.sub(r'<[^>]+>','',t)).strip(),'abbr':html.unescape(a).replace('\xa0',' ').strip(),'issn':i} for k,t,a,i in items]
        rec=cur[0]; rec['nowPublishedAs']=cur[1] if len(cur)>1 else None; out.append(rec)
    return out

def parse_kamje(htm):
    """KAMJE member list: journal title and its society; a society name with 간호 marks a nursing journal."""
    out=[]
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>',htm,flags=re.S|re.I):
        cells=[re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',c))).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>',r,flags=re.S|re.I)]
        cells=[c for c in cells if c]
        if len(cells)>=3 and re.search(r'[A-Za-z]{3}',cells[0]): out.append({'title':cells[0],'societyKo':cells[1] if len(cells)>1 else None,'cells':cells[:8]})
    return out
