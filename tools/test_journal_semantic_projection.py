"""Synthetic works verify mean aggregation, shared UMAP and citation evidence. No real papers read."""
import importlib.util,json
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('journal_projection',ROOT/'tools/build_journal_semantic_map.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ids,means=m.aggregate_embeddings(np.array([[1.,0],[0,1],[1,0]]),{'b':[2],'a':[0,1]});assert ids==['a','b'];assert np.allclose(means[0],[2**-.5,2**-.5]);assert np.allclose(means[1],[1,0])
class Encoder:
 def encode(self,texts,**kwargs):
  assert kwargs['normalize_embeddings'];x=np.array([[np.sin((i+1)*(j+1))+.2 for j in range(16)] for i in range(len(texts))],dtype='float32');return x/np.linalg.norm(x,axis=1,keepdims=True)
works={f'W{i}':{'id':f'W{i}','title':f'Synthetic paper {i}','primary_location':{'source':{'id':'J'+str(i%8)}},'referenced_works':[f'W{(i+1)%24}']} for i in range(24)}
dual={'journalMapping':[{'id':'J'+str(i),'label':'Synthetic Journal '+str(i),'field':'F'+str(i%2),'fieldLabel':'Field '+str(i%2)} for i in range(9)],'left':[{'journalIds':['J'+str(i) for i in range(9)]}],'right':[{'journalIds':['J'+str(i) for i in range(8)]}],'sample_ids':list(works)}
before=json.dumps({'works':works,'dual':dual},sort_keys=True);out=m.derive(works,dual,Encoder());assert len(out['journals'])==8;assert len(out['missingJournals'])==1;assert out['missingJournals'][0]['id']=='J8';assert out['stats']['citation_edges']==24;assert sum(e['value'] for e in out['edges'])==24;assert all(len(e['evidence'])==e['value'] for e in out['edges']);assert all(j['observedPapers']==3 and j['withAbstract']==0 for j in out['journals']);assert out['projection']['n_components']==2;assert json.dumps({'works':works,'dual':dual},sort_keys=True)==before
print('PASS: normalized journal means, joint 2D UMAP, missing-content omission, title-only coverage, directed citation evidence, unique input identity and source immutability')
