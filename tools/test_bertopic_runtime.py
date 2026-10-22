"""功能：仅用内存合成语料验证真实BERTopic依赖、离线模型与服务输出，不读取真实论文。"""
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    # 功能：三个明确领域的合成短文本，ID不对应真实论文。
    groups = [
        ['Astronomers observe distant galaxies and stars with a space telescope.',
         'A galaxy contains stars, planets and interstellar gas in the universe.',
         'The astronomy telescope measures stellar light from distant galaxies.',
         'Scientists study planetary orbits around stars in distant solar systems.',
         'Space observatories discover galaxies and stars beyond the Milky Way.',
         'Astronomical observations reveal star formation in galaxies.',
         'The space telescope records planets, galaxies and bright stars.',
         'Astronomy research explores the universe through stellar observations.'],
        ['The football team scored a goal during the league championship match.',
         'Football players train with their coach before a league match.',
         'The goalkeeper saved a penalty during the football tournament.',
         'A football striker scored two goals to win the championship.',
         'The soccer coach organized team training for the tournament.',
         'Football fans watched their team win the league final.',
         'Players pass the ball and score goals on the football field.',
         'The football club hired a coach for the championship season.'],
        ['The chef bakes fresh bread with flour, yeast and water.',
         'A baker kneads bread dough before placing it in the oven.',
         'Bread recipes combine flour, yeast, salt and warm water.',
         'The bakery makes sourdough bread in a hot oven.',
         'The chef mixes flour and yeast to prepare bread dough.',
         'Baking bread requires time for yeast fermentation and dough rising.',
         'A baker prepares fresh bread rolls with wheat flour.',
         'The bread dough is kneaded and baked until the crust turns brown.']]
    corpus = [{'id': f'synthetic-{g}-{i}', 'text': text} for g, texts in enumerate(groups) for i, text in enumerate(texts)]
    before = json.dumps(corpus, sort_keys=True)
    spec = importlib.util.spec_from_file_location('synthetic_bertopic_service', ROOT/'server/topic_server.py')
    service = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(service)
    options = service.validate({'minSize': 3, 'neighbors': 5, 'topWords': 6, 'minDf': 1})
    service.LOCK.acquire()
    service.train(options, corpus=corpus)
    assert service.STATE['status'] == 'done', service.STATE
    result = service.STATE['result']
    assert result['model'] == 'BERTopic' and result['used'] == 24
    assert len(result['topics']) >= 2, '合成语料至少应分出两个主题'
    assert not service.LOCK.locked()
    assert json.dumps(corpus, sort_keys=True) == before
    for doc in result['documents']:
        assert doc['id'].startswith('synthetic-')
        assert len(doc['weights']) == len(result['topics'])
        assert sum(doc['weights']) == (0 if doc['primary'] is None else 1)
        assert doc['membership'] is None or math.isfinite(doc['membership'])
    assert result['outliers'] == sum(d['primary'] is None for d in result['documents'])
    json.dumps(result, allow_nan=False)
    report = {'passed': True, 'synthetic_documents': 24, 'topics': len(result['topics']), 'outliers': result['outliers'], 'input_unchanged': True, 'model_local_only': True}
    print(json.dumps(report), flush=True)
    return report

if __name__ == '__main__':
    main()
