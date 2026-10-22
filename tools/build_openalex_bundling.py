"""构建真实机构合作演示资料；保留来源与排除口径，不替换教学语料。"""
import collections
import datetime
import itertools
import json
import urllib.parse
from pathlib import Path
from download_openalex_bundling import get_json

ROOT = Path(__file__).resolve().parents[1]


def build():
    candidates = json.loads((ROOT / 'data/raw/openalex-bundling-candidates-20261021.json').read_text(encoding='utf-8'))
    chosen = next(q for q in candidates['queries'] if q['query'] == 'climate change')
    counts, pairs, excluded, papers, institutions = collections.Counter(), {}, [], {}, {}
    for work in chosen['works']:
        items = {i['id']: i for a in work.get('authorships', []) for i in a.get('institutions', []) if i.get('id')}
        # 排除单篇超大型团队，防止其完全图淹没其余合作；逐篇保留排除记录。
        if len(items) > 20:
            excluded.append({'id': work['id'], 'title': work['title'], 'institutions': len(items)})
            continue
        papers[work['id']] = {key: work.get(key) for key in ['id', 'title', 'publication_year', 'doi']}
        counts.update(items.keys())
        institutions.update(items)
        for pair in itertools.combinations(sorted(items), 2):
            pairs.setdefault(pair, []).append(work['id'])
    top = sorted(counts, key=lambda key: (-counts[key], key))[:160]
    geo_path = ROOT / 'data/raw/openalex-bundling-institutions-20261021.json'
    geo_raw = json.loads(geo_path.read_text(encoding='utf-8')) if geo_path.exists() else {
        'retrieved_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'requests': [], 'institutions': []}
    fetched = {i['id'] for i in geo_raw['institutions']}
    missing = [i for i in top if i not in fetched]
    for start in range(0, len(missing), 100):
        batch = missing[start:start + 100]
        params = {'filter': 'openalex:' + '|'.join(i.rsplit('/', 1)[-1] for i in batch),
                  'per_page': 100, 'select': 'id,display_name,country_code,geo'}
        url = 'https://api.openalex.org/institutions?' + urllib.parse.urlencode(params)
        payload = get_json(url)
        geo_raw['requests'].append({'url': url, 'requested_ids': batch, 'returned_count': len(payload['results'])})
        geo_raw['institutions'].extend(payload['results'])
        geo_path.write_text(json.dumps(geo_raw, ensure_ascii=False, indent=2), encoding='utf-8')
    geo = {i['id']: i for i in geo_raw['institutions']}
    nodes, unavailable = [], []
    for name in top:
        item = geo.get(name, {})
        location = item.get('geo') or {}
        lat, lon = location.get('latitude'), location.get('longitude')
        if not isinstance(lat, (float, int)) or not isinstance(lon, (float, int)) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            unavailable.append(name)
            continue
        paper_ids = [w['id'] for w in chosen['works'] if w['id'] in papers and
                     any(i['id'] == name for a in w['authorships'] for i in a['institutions'])]
        nodes.append({'name': name, 'label': item.get('display_name') or institutions[name]['display_name'],
                      'count': counts[name], 'country': item.get('country_code'), 'city': location.get('city'),
                      'latitude': lat, 'longitude': lon, 'paperIds': paper_ids})
    names = {n['name'] for n in nodes}
    edges = [{'source': a, 'target': b, 'weight': len(ids), 'paperIds': ids}
             for (a, b), ids in pairs.items() if a in names and b in names]
    connected = {i for edge in edges for i in [edge['source'], edge['target']]}
    isolated = [n['name'] for n in nodes if n['name'] not in connected]
    nodes = [n for n in nodes if n['name'] in connected]
    by_id = {n['name']: n for n in nodes}
    cross = [e for e in edges if by_id[e['source']]['country'] and by_id[e['target']]['country'] and
             by_id[e['source']]['country'] != by_id[e['target']]['country']]
    metadata = {
        'title': '气候变化研究：机构合作地理网络', 'source': 'OpenAlex', 'license': 'CC0',
        'retrieved_at': candidates['retrieved_at'], 'query': chosen['parameters'], 'request_url': chosen['request_url'],
        'sample_size': len(chosen['works']), 'included_papers': len(papers), 'excluded_large_teams': excluded,
        'maximum_institutions_per_paper': 20, 'maximum_nodes': 160, 'missing_coordinates': unavailable,
        'hidden_isolates': isolated, 'node_count': len(nodes), 'edge_count': len(edges),
        'country_count': len({n['country'] for n in nodes if n['country']}), 'international_edges': len(cross),
        'scope_note': '相关性前100篇article，2018–2025；为演示选择，非领域全量或随机样本。单篇超过20机构的论文排除并记录；其余按样本发文数取前160机构，缺坐标和孤立点不显示。',
        'relationship_note': '无向边表示两机构出现在同一篇样本论文的署名中；同篇同机构去重，边权为共同论文数，不代表直接沟通或因果关系。',
        'layout_note': '按OpenAlex机构经纬度定位，未做力导向重排；同城市机构可重合，当前机构地址不是历史迁址轨迹。拖动仅供画法演示，可恢复。'}
    output = {'metadata': metadata, 'nodes': nodes, 'edges': edges, 'papers': list(papers.values())}
    path = ROOT / 'data/demo/openalex-climate-institutions.json'
    if path.exists():
        raise FileExistsError('演示数据已存在，不覆盖：' + str(path))
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    report = {
        'selected': 'climate change',
        'rationale': '三候选中，机构至少两篇门槛的最大连通块与边数最多；地理坐标提供跨地区长边。不是对主题重要性或算法效果的评判。',
        'candidates': [{'query': q['query'], 'metrics': q['metrics']} for q in candidates['queries']],
        'selected_network': metadata,
        'files': {'dataset': str(path.relative_to(ROOT)),
                  'raw_candidates': 'data/raw/openalex-bundling-candidates-20261021.json',
                  'raw_institutions': str(geo_path.relative_to(ROOT))}}
    (ROOT / 'docs/openalex-bundling-selection.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: metadata[k] for k in ['node_count', 'edge_count', 'country_count', 'international_edges', 'included_papers', 'missing_coordinates']}, ensure_ascii=False))


if __name__ == '__main__':
    build()
