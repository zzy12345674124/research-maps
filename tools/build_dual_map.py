"""补查被引Work并构建可追溯的期刊学科引用路径。"""
import json, urllib.request, urllib.parse, time
from pathlib import Path
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw/dual-map'
RAW.mkdir(exist_ok=True)
works=json.loads((ROOT/'data/raw/openalex-ai-education-100.json').read_text(encoding='utf-8'))['results']
refs=sorted({ref for w in works for ref in w.get('referenced_works',[])})
chunks=[refs[i:i+100] for i in range(0,len(refs),100)]
# 功能：分批补查参考文献的期刊与论文主题；缓存成功响应，不覆盖原100篇样本。
def fetch(item):
    i, ids=item
    path=RAW/f'references-{i+1:02d}.json'
    if path.exists(): return json.loads(path.read_text(encoding='utf-8'))
    params={'filter':'openalex_id:'+'|'.join(x.rsplit('/',1)[-1] for x in ids),'per-page':100,'select':'id,title,publication_year,primary_location,primary_topic'}
    url='https://api.openalex.org/works?'+urllib.parse.urlencode(params)
    error=None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=45) as response: payload=json.load(response)
            record={'request_url':url,'fetched_at':datetime.now().astimezone().isoformat(),'response':payload}
            path.write_text(json.dumps(record,ensure_ascii=False),encoding='utf-8')
            return record
        except Exception as e: error=e;time.sleep(attempt+1)
    raise RuntimeError(f'批次{i+1}失败: {error}')
lookup={w['id']:w for w in works}
failures=[]
with ThreadPoolExecutor(max_workers=4) as pool:
    jobs={pool.submit(fetch,item):item[0] for item in enumerate(chunks)}
    for future in as_completed(jobs):
        i=jobs[future]
        try:
            for w in future.result()['response'].get('results',[]): lookup[w['id']]=w
        except Exception as e: failures.append(str(e))
        print(f'已处理批次 {i+1}/{len(chunks)}',flush=True)
# 功能：用观察到的论文主学科对期刊投票归类；这是样本推断，不是官方期刊底图。
def source(w): return (w.get('primary_location') or {}).get('source') or {}
def field(w): return (w.get('primary_topic') or {}).get('field') or {}
votes=defaultdict(Counter); journals={}; fields={}
for w in lookup.values():
    journal=source(w); f=field(w)
    if journal.get('type')=='journal' and journal.get('id'):
        journals[journal['id']]=journal.get('display_name',journal['id'])
        if f.get('id'):
            votes[journal['id']][f['id']]+=1;fields[f['id']]=f['display_name']
mapping={sid:sorted(counts,key=lambda f:(-counts[f],f))[0] for sid,counts in votes.items()}
paths={};counters=Counter();left=defaultdict(set);right=defaultdict(set)
for w in works:
    for ref in set(w.get('referenced_works',[])):
        counters['reference_edges']+=1
        cited=lookup.get(ref)
        if not cited: counters['unresolved_work']+=1;continue
        a,b=source(w),source(cited)
        if a.get('type')!='journal' or b.get('type')!='journal': counters['nonjournal_or_missing_source']+=1;continue
        fa,fb=mapping.get(a.get('id')),mapping.get(b.get('id'))
        if not fa or not fb: counters['missing_field_mapping']+=1;continue
        key=(fa,fb)
        if key not in paths: paths[key]={'source':fa,'target':fb,'sourceLabel':fields[fa],'targetLabel':fields[fb],'value':0,'evidence':[]}
        item=paths[key];item['value']+=1;counters['included_edges']+=1
        left[fa].add(a['id']);right[fb].add(b['id'])
        item['evidence'].append({'citingId':w['id'],'citingTitle':w.get('title'),'citedId':ref,'citedTitle':cited.get('title'),'citingJournal':journals[a['id']],'citedJournal':journals[b['id']]})
result={'method':'按本样本及其参考文献的论文主学科投票，将期刊归入票数最多的学科；同一期刊两侧使用同一归类。非CiteSpace原始底图。',
 'stats':{'sample_works':len(works),'with_reference_records':sum(bool(w.get('referenced_works')) for w in works),'unique_reference_ids':len(refs),'resolved_reference_ids':sum(r in lookup for r in refs),**dict(counters),'failed_batches':failures},
 'left':[{'id':f,'label':fields[f],'journals':len(ids)} for f,ids in left.items()],
 'right':[{'id':f,'label':fields[f],'journals':len(ids)} for f,ids in right.items()],
 'paths':sorted(paths.values(),key=lambda p:-p['value']),
 'journalMapping':[{'id':sid,'label':journals[sid],'field':fid,'fieldLabel':fields[fid],'support':votes[sid][fid],'observedPapers':sum(votes[sid].values())} for sid,fid in mapping.items()]}
(ROOT/'data/processed/dual-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result['stats'],ensure_ascii=False),flush=True)
