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

# 功能：改用OpenAlex期刊本身的topics计数，不再以本研究样本投票给整本期刊分类。
SOURCE_RAW=RAW/'sources'
SOURCE_RAW.mkdir(exist_ok=True)
source_ids=sorted(journals)
source_batches=[source_ids[i:i+100] for i in range(0,len(source_ids),100)]
def fetch_sources(item):
    i,ids=item
    path=SOURCE_RAW/f'sources-{i+1:02d}.json'
    if path.exists(): return json.loads(path.read_text(encoding='utf-8'))
    params={'filter':'openalex_id:'+'|'.join(x.rsplit('/',1)[-1] for x in ids),'per-page':100,'select':'id,display_name,topics,works_count'}
    url='https://api.openalex.org/sources?'+urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=45) as response: payload=json.load(response)
            record={'request_url':url,'fetched_at':datetime.now().astimezone().isoformat(),'response':payload}
            path.write_text(json.dumps(record,ensure_ascii=False),encoding='utf-8');return record
        except Exception:
            if attempt==2: raise
            time.sleep(attempt+1)
source_records={}
with ThreadPoolExecutor(max_workers=4) as pool:
    jobs={pool.submit(fetch_sources,item):item[0] for item in enumerate(source_batches)}
    for future in as_completed(jobs):
        for journal in future.result()['response'].get('results',[]):source_records[journal['id']]=journal
        print(f'期刊分类批次 {jobs[future]+1}/{len(source_batches)}',flush=True)
# 功能：聚合API返回的期刊主题计数至field，取最高者；这是可复核规则，不是官方期刊单标签。
# 返回主题可能截断且计数可能重叠，supportShare仅指返回主题计数占比，不等于期刊全部论文占比。
votes=defaultdict(Counter)
for sid,journal in source_records.items():
    for topic in journal.get('topics') or []:
        f=topic.get('field') or {};count=topic.get('count') or 0
        if f.get('id') and count>0:
            votes[sid][f['id']]+=count;fields[f['id']]=f['display_name']
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
        item['evidence'].append({'citingId':w['id'],'citingTitle':w.get('title'),'citedId':ref,'citedTitle':cited.get('title'),'citingJournal':journals[a['id']],'citedJournal':journals[b['id']],'citingJournalId':a['id'],'citedJournalId':b['id']})
result={'method':'采用OpenAlex Source.topics返回的主题count，按field聚合取最高者；同一期刊两侧归类一致。不是官方期刊分类或CiteSpace底图；supportShare仅为返回主题计数内占比。',
 'stats':{'sample_works':len(works),'with_reference_records':sum(bool(w.get('referenced_works')) for w in works),'unique_reference_ids':len(refs),'resolved_reference_ids':sum(r in lookup for r in refs),**dict(counters),'failed_batches':failures},
 'left':[{'id':f,'label':fields[f],'journals':len(ids),'journalIds':sorted(ids)} for f,ids in left.items()],
 'right':[{'id':f,'label':fields[f],'journals':len(ids),'journalIds':sorted(ids)} for f,ids in right.items()],
 'paths':sorted(paths.values(),key=lambda p:-p['value']),
 'journalMapping':[{'id':sid,'label':journals[sid],'field':fid,'fieldLabel':fields[fid],'support':votes[sid][fid],'topicCountTotal':sum(votes[sid].values()),'supportShare':votes[sid][fid]/sum(votes[sid].values()),'basis':'OpenAlex Source.topics','sourceWorksCount':source_records.get(sid,{}).get('works_count')} for sid,fid in mapping.items()]}
backup=ROOT/'data/processed/dual-map-sample-vote-v1.json'
if not backup.exists():
    backup.write_text((ROOT/'data/processed/dual-map.json').read_text(encoding='utf-8'),encoding='utf-8')
(ROOT/'data/processed/dual-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result['stats'],ensure_ascii=False),flush=True)
