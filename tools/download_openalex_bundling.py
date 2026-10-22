"""采集边捆绑研究样本；只请求公开元数据，不覆盖现有教学语料。"""
from pathlib import Path
import json, urllib.request, urllib.parse, datetime, collections, itertools
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/raw/openalex-bundling-candidates-20261021.json'
QUERIES = ['renewable energy', 'machine learning medicine', 'climate change']

def get_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'ResearchMaps/1.0 (public metadata research)'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)

def metrics(works):
    counts, edges = collections.Counter(), collections.Counter()
    countries, excluded = set(), 0
    for work in works:
        institutions = {i['id']: i for a in work.get('authorships', []) for i in a.get('institutions', []) if i.get('id')}
        # 超大型团队的机构团完全图容易淹没其他合作关系，单独记录排除口径。
        if len(institutions) > 20:
            excluded += 1
            continue
        counts.update(institutions.keys())
        countries.update(i['country_code'] for i in institutions.values() if i.get('country_code'))
        edges.update(itertools.combinations(sorted(institutions), 2))
    top = {i for i, n in counts.most_common(120) if n >= 2}
    kept = {k: v for k, v in edges.items() if set(k) <= top}
    connected = set(itertools.chain.from_iterable(kept))
    adjacency = {i: set() for i in connected}
    for a, b in kept:
        adjacency[a].add(b); adjacency[b].add(a)
    seen, sizes = set(), []
    for node in adjacency:
        if node in seen:
            continue
        seen.add(node); stack, size = [node], 0
        while stack:
            node = stack.pop(); size += 1
            for other in adjacency[node] - seen:
                seen.add(other); stack.append(other)
        sizes.append(size)
    return {'works': len(works), 'eligible_works': len(works)-excluded,
            'excluded_more_than_20_institutions': excluded,
            'unique_institutions': len(counts), 'countries': len(countries),
            'institutions_at_least_2_papers': len(top), 'connected_nodes': len(connected),
            'edges': len(kept), 'components': sorted(sizes, reverse=True),
            'density': round(2*len(kept)/(len(connected)*(len(connected)-1)), 4) if len(connected)>1 else 0}

def download():
    # 允许从已保存的研究采集点继续，只补缺失查询，不重复请求或替换已取得记录。
    result = json.loads(OUTPUT.read_text(encoding='utf-8')) if OUTPUT.exists() else {
        'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope': '每个查询按相关性前100篇article，2018–2025；非领域全量或随机样本。', 'queries': []}
    for query in QUERIES:
        if any(entry['query'] == query for entry in result['queries']):
            continue
        params = {'search': query, 'filter': 'type:article,publication_year:2018-2025',
                  'per_page': 100, 'select': 'id,title,publication_year,doi,authorships,referenced_works,primary_topic,cited_by_count'}
        url = 'https://api.openalex.org/works?' + urllib.parse.urlencode(params)
        payload = get_json(url)
        works = payload['results']
        result['queries'].append({'query': query, 'request_url': url, 'parameters': params,
            'api_meta': payload.get('meta'), 'metrics': metrics(works), 'works': works})
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'query': query, **result['queries'][-1]['metrics']}, ensure_ascii=False), flush=True)

if __name__ == '__main__':
    download()
