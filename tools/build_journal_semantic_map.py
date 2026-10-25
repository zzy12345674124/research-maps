"""Offline journal semantics: mean normalized paper embeddings -> shared 2D UMAP."""
import hashlib,json,os
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[1]
MODEL='sentence-transformers/all-MiniLM-L6-v2'
def abstract(work):
 slots={i:w for w,indices in (work.get('abstract_inverted_index') or {}).items() for i in indices}
 return ' '.join(slots[i] for i in sorted(slots))
def aggregate_embeddings(embeddings,groups):
 import numpy as np
 ids=sorted(groups)
 means=np.stack([embeddings[groups[sid]].mean(axis=0) for sid in ids])
 norm=np.linalg.norm(means,axis=1,keepdims=True)
 if not np.isfinite(means).all() or (norm<=0).any():raise ValueError('Nonfinite or zero journal embedding')
 return ids,means/norm
def derive(works,dual,encoder,cache_dir=None):
 import numpy as np
 from umap import UMAP
 mapping={j['id']:j for j in dual['journalMapping']}
 sides={side:{sid for group in dual[side] for sid in group.get('journalIds',[])} for side in ['left','right']}
 wanted=sides['left']|sides['right'];corpus=[];groups=defaultdict(list)
 for work in sorted(works.values(),key=lambda w:w['id']):
  sid=((work.get('primary_location') or {}).get('source') or {}).get('id')
  if sid not in wanted:continue
  title=work.get('title') or work.get('display_name') or '';text=abstract(work)
  if not (title+' '+text).strip():continue
  groups[sid].append(len(corpus));corpus.append({'id':work['id'],'title':title,'text':(title+' '+text).strip(),'hasAbstract':bool(text),'journal':sid})
 signature=hashlib.sha256(json.dumps([[d['id'],d['text'],d['journal']] for d in corpus],ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
 cached=cache_dir/('journal-papers-'+signature+'.npz') if cache_dir else None
 if cached and cached.exists():embeddings=np.load(cached,allow_pickle=False)['vectors']
 else:
  embeddings=encoder.encode([d['text'] for d in corpus],normalize_embeddings=True,show_progress_bar=False,batch_size=32)
  if cached:cached.parent.mkdir(parents=True,exist_ok=True);np.savez_compressed(cached,vectors=embeddings)
 embeddings=np.asarray(embeddings,dtype='float32')
 if embeddings.ndim!=2 or embeddings.shape[0]!=len(corpus):raise ValueError('Paper embedding cache mismatch')
 ids,means=aggregate_embeddings(embeddings,groups)
 if len(ids)<4:raise ValueError('Need at least four journals with content')
 params={'n_neighbors':min(15,len(ids)-1),'n_components':2,'min_dist':.2,'metric':'cosine','random_state':42,'n_jobs':1,'init':'random'}
 xy=UMAP(**params).fit_transform(means)
 journals=[]
 for sid,point in zip(ids,xy):
  j=mapping[sid];docs=[corpus[i] for i in groups[sid]]
  journals.append({'id':sid,'label':j['label'],'field':j['field'],'fieldLabel':j['fieldLabel'],'x':round(float(point[0]),6),'y':round(float(point[1]),6),'observedPapers':len(docs),'withAbstract':sum(d['hasAbstract'] for d in docs),'examples':[{'id':d['id'],'title':d['title']} for d in docs[:8]]})
 available=set(ids);edges={};unresolved=0
 for work in works.values():
  if work['id'] not in sample_ids(dual):continue
  source=((work.get('primary_location') or {}).get('source') or {}).get('id')
  for ref in set(work.get('referenced_works',[])):
   target_work=works.get(ref)
   if not target_work:unresolved+=1;continue
   target=((target_work.get('primary_location') or {}).get('source') or {}).get('id')
   if source not in sides['left'] or target not in sides['right'] or source not in available or target not in available:continue
   item=edges.setdefault((source,target),{'source':source,'target':target,'value':0,'evidence':[]});item['value']+=1
   item['evidence'].append({'citingId':work['id'],'citingTitle':work.get('title') or work['id'],'citedId':ref,'citedTitle':target_work.get('title') or ref})
 return {'dataset':'legacy100','model':MODEL,'embedding_dimensions':int(embeddings.shape[1]),'aggregation':'equal mean of normalized unique observed paper embeddings; normalize journal means','input_fingerprint':signature,'projection':{'method':'UMAP',**params},'journals':journals,'left':sorted(sides['left']&available),'right':sorted(sides['right']&available),'edges':list(edges.values()),'missingJournals':[{'id':sid,'label':mapping[sid]['label']} for sid in sorted(wanted-available)],'stats':{'observed_papers':len(corpus),'with_abstract':sum(d['hasAbstract'] for d in corpus),'citation_edges':sum(e['value'] for e in edges.values()),'unresolved_references':unresolved},'scope':'Journal content profiles use only the current sample and locally cached references, not the full journal literature. Both sides share one joint UMAP; cross-panel separation is a display offset, not semantic distance.'}
def sample_ids(dual):
 return set(dual.get('sample_ids',[]))
def main():
 cache=ROOT/'runtime/model-cache';os.environ['HF_HOME']=str(cache);os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1';os.environ['TOKENIZERS_PARALLELISM']='false'
 from sentence_transformers import SentenceTransformer
 works={}
 for p in sorted((ROOT/'data/raw/dual-map').glob('references-*.json')):
  for w in json.loads(p.read_text(encoding='utf-8'))['response']['results']:works[w['id']]=w
 sample=json.loads((ROOT/'data/raw/openalex-ai-education-100.json').read_text(encoding='utf-8-sig'))['results'];works.update({w['id']:w for w in sample})
 dual=json.loads((ROOT/'data/processed/dual-map.json').read_text(encoding='utf-8'));dual['sample_ids']=[w['id'] for w in sample]
 print(json.dumps({'stage':'encode_and_project','cached_works':len(works)}),flush=True)
 encoder=SentenceTransformer(MODEL,cache_folder=str(cache),local_files_only=True,device='cpu')
 result=derive(works,dual,encoder,ROOT/'runtime/semantic-cache');output=ROOT/'data/processed/journal-semantic-map.json';output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
 print(json.dumps({'stage':'saved','journals':len(result['journals']),'left':len(result['left']),'right':len(result['right']),'missing':len(result['missingJournals']),**result['stats']}),flush=True)
if __name__=='__main__':main()
