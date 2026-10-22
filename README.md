# Research Maps · 文献计量可视化工作台

原生 HTML/CSS/JavaScript + 本地 D3 的交互式文献计量工具。采用浅色液态玻璃界面和 VOSviewer 风格两栏布局。

## 功能

- 关键词共现、年份叠加和密度图；作者/机构合作、文献共被引。
- 论文引用、关键词共现关系及数量时间线；期刊双图叠加。
- NMF、LDA 在浏览器执行；BERTopic 可选本机 Python 服务执行。
- 权重透明度、普通/捆绑路线、节点拖动和缩放；visit2 四叉树标签防重叠。
- OpenAlex 气候变化机构合作地理/力导向对照，航空航线捆绑演示。
- 玻璃下拉浮层、按图形隐藏无关参数、可调整宽度的侧栏和论文证据。

## 本机启动

普通图形和 NMF/LDA 仅需现有 Python 3。Windows 双击 `启动可视化.cmd`，或运行：

```sh
python server/topic_server.py
```

打开 http://127.0.0.1:8765/ 。页面读取 JSON，请通过本机服务访问，不直接双击 HTML。

BERTopic 需要单独创建环境并按 `server/requirements-bertopic.txt` 安装依赖、准备 all-MiniLM-L6-v2 缓存；环境与模型不纳入仓库。`docs/当前主题结果快照.json` 是保存的结果资料，本机页面不会自动把它当作新训练结果。

## 数据与范围

`data/raw/` 保留 OpenAlex 公开元数据和查询记录；`data/processed/` 为绘图输入；`data/demo/` 为独立演示。
人工智能教育100篇按检索相关性选择，不代表领域全量。气候变化合作演示保留146机构、399关系、29国家；详细筛选口径见 `docs/openalex-bundling-selection.json`。同篇多机构按机构对计合作，不代表直接沟通。

## 目录

`pages/` 页面；`css/` 样式；`scripts/analysis/` 算法；`scripts/charts/` 绘图；`scripts/interactions/` 交互；`library/` 第三方代码；`tools/` 数据准备和合成验证；`server/` 本机服务。`src/charts/` 仅保留旧入口跳转。

## 验证

```sh
python tools/check_structure.py
node tools/test_topic_model.cjs
node tools/test_label_layout.cjs
node tools/test_liquid_select.cjs
node tools/test_workspace_startup.cjs
node tools/test_openalex_demo.cjs
node tools/test_edge_rendering.cjs
```

测试使用合成数据；真实数据的视觉效果需人工确认。源码不包含机器上的 Python 环境、模型缓存、运行日志或开发备份。

## 第三方与更新

D3 和 d3-forcebundle 原始许可证保留在 `library/`；上游来源和固定版本见相应目录。OpenAlex 元数据为公开资料，样本仅用于教学与方法演示。捆绑只改变路线，不改变连接。

界面右上角“工程说明”读取 `docs/changelog.json`，每次用户可见更新按“日期.当日修订”追加记录。

本仓库不启用 GitHub Pages 或其他线上部署；用于私有保存、协作与本机运行。
