"""下载人工智能教育100篇教学样本，保留完整Work记录与检索元数据。"""
import json
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PARAMS = {
    "search": "artificial intelligence in education",
    "filter": "type:article,publication_year:2020-2026",
    "sort": "relevance_score:desc",
    "per-page": "100",
    "page": "1",
}


def download():
    # 功能：只查询公开论文元数据；不下载PDF全文，不需要安装第三方库。
    url = "https://api.openalex.org/works?" + urllib.parse.urlencode(PARAMS)
    request = urllib.request.Request(url, headers={"User-Agent": "BibliometricsTeaching/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)
    works = payload.get("results", [])
    # 功能：在写入前检查样本数量和ID唯一性，避免保存不完整数据集。
    if len(works) != 100 or len({w["id"] for w in works}) != 100:
        raise ValueError("返回结果不是100个唯一Work，未写入数据文件")
    stamp = datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(timespec="seconds")
    metadata = {
        "retrieved_at": stamp, "timezone": "Asia/Shanghai",
        "request_url": url, "parameters": PARAMS, "returned_count": len(works),
        "scope_note": "按检索相关性获取的前100条article记录；教学样本，未经逐篇纳入排除审查，不代表领域全量或随机样本。",
        "api_meta": payload.get("meta", {}),
    }
    raw_path = ROOT / "data/raw/openalex-ai-education-100.json"
    meta_path = ROOT / "data/raw/query-metadata.json"
    processed_path = ROOT / "data/processed/papers.json"
    # 功能：保留原始对象，同时产生现有关键词图可读取的简化数据。
    papers = [{
        "id": w["id"], "title": w.get("title"), "year": w.get("publication_year"),
        "doi": w.get("doi"),
        "keywords": [k["display_name"] for k in (w.get("keywords") or [])],
        "authors": w.get("authorships", []),
        "referenced_works": w.get("referenced_works", []),
        "primary_location": w.get("primary_location"),
    } for w in works]
    for path in [raw_path, meta_path, processed_path]:
        if path.exists():
            raise FileExistsError(f"已存在文件，停止覆盖：{path}")
    raw_path.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    meta_path.write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding="utf-8")
    processed_path.write_text(json.dumps(papers,ensure_ascii=False,indent=2),encoding="utf-8")
    # 功能：汇报数据完整性；只读取，不修改论文记录。
    report = {
        "count":len(works), "unique_ids":len({w["id"] for w in works}),
        "with_keywords":sum(bool(w.get("keywords")) for w in works),
        "with_authorships":sum(bool(w.get("authorships")) for w in works),
        "with_references":sum(bool(w.get("referenced_works")) for w in works),
        "with_source":sum(bool((w.get("primary_location") or {}).get("source")) for w in works),
        "years":sorted({w.get("publication_year") for w in works}),
        "keyword_count":len({k["display_name"] for w in works for k in (w.get("keywords") or [])}),
        "first_titles":[w.get("title") for w in works[:5]], "retrieved_at":stamp,
    }
    (ROOT/"docs/数据获取摘要.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__ == "__main__":
    download()
