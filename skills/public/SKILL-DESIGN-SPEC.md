# Skill 设计规范说明书

> 本规范从 `skills/public/` 下 21 个既有 skill 实证归纳，并整合 `skill-creator` 官方创建指南。
> 用于**新建/改造 skill**时作为统一参考，保证风格一致、可被稳定触发、可被其他 skill 组合复用。

---

## 0. 一句话总览

一个 skill = **一个目录**，内含必备的 `SKILL.md`(触发说明 + 执行逻辑) + 可选的脚本/模板/参考资源。
核心设计思想：**渐进式披露(Progressive Disclosure)** —— 元数据常驻上下文，正文按需加载，资源用到才读。

---

## 1. 核心设计原则

| 原则 | 说明 | 实证范例 |
|---|---|---|
| **渐进式披露** | 三级加载：①元数据(name+description，常驻) ②SKILL.md 正文(触发时加载，建议 <500 行) ③bundled 资源(用到才读，无上限) | `chart-visualization` 把 26 种图表规格拆到 `references/generate_*.md`，正文只讲选型 |
| **解释 why，而非堆 MUST** | 现代模型有 theory of mind，讲清"为什么这么做"比 `ALWAYS/NEVER` 更有效；全大写刚性约束是黄灯信号 | `skill-creator` L302 "Explain the why" |
| **祈使句写作** | 指令用动词原形开头 | 全部 skill 一致 |
| **职责单一** | 一个 skill 只做一类事；需要跨能力时**委派给其他 skill**，而非自己塞满 | `consulting-analysis` 不收集数据/不画图，Phase1 出框架→委派 `deep-research`/`data-analysis` |
| **确定性任务下沉为脚本** | 重复、可验证、需精确的操作(图表生成、API 调用、SQL)写成脚本；主观创作(写作、设计)留给模型 | `data-analysis/analyze.py`、`image-generation/generate.py` |
| **可被稳定触发** | description 写明"做什么 + 何时触发(含同义词/口语) + 负面边界(什么情况不用)" | `systematic-literature-review` description 含 "Not for single-paper tasks — use academic-paper-review" |

---

## 2. 目录结构规范

```
<skill-name>/                 # 目录名 == name 字段(kebab-case)
├── SKILL.md            [必填] 触发说明 + 执行逻辑(建议 <500 行)
├── scripts/            [可选] 可执行脚本(Python/Shell/Bash)，承载确定性/重复任务
├── templates/          [可选] 输出模板(.md)，模型填空产出最终成品
├── references/         [可选] 参考文档，按需读入(>300 行需带目录)
├── assets/             [可选] 静态资源(图标/字体/HTML/模板素材)
├── evals/              [可选] 评测集 evals.json + 触发评测集
├── agents/             [可选] 子 agent 指令文件(仅复杂编排型 skill 用)
├── eval-viewer/        [可选] 评测结果可视化(通常仅 skill-creator 复用)
└── LICENSE.txt         [可选] 第三方 skill 的许可证
```

### 何时需要哪种资源

| 子目录 | 出现频率 | 适用场景 |
|---|---|---|
| `scripts/` | 12/21 | 调用外部 API、跑 SQL、生成二进制产物(图片/视频/PPT)、确定性转换 |
| `templates/` | 4/21 | 有固定输出结构(引文格式 apa/ieee/bibtex、角色设定 doraemon) |
| `references/` | 3/21 | 多变体领域知识(按平台/框架/图表类型拆分，按需只读相关那篇) |
| `assets/` | 2/21 | 需要嵌入成品的素材、HTML 评审模板 |
| `evals/` | 1/21 | 输出可客观验证(文件转换/数据抽取/固定流程) → 强烈建议加；主观输出(写作/艺术)可不加 |
| **(无任何子目录)** | 7/21 | 纯方法论/写作型 skill(`deep-research`、`consulting-analysis`、`newsletter-generation` 等)，靠 LLM 直接产出 |

> **判断口诀**：纯脑力任务 → 只有 SKILL.md；需要"动手"且可标准化 → 加 `scripts/`；有多种套路 → 加 `references/` 或 `templates/`。

---

## 3. SKILL.md frontmatter 规范

### 3.1 字段表

| 字段 | 必填 | 说明 | 示例 |
|---|---|---|---|
| `name` | ✅ | 与目录名一致，kebab-case | `data-analysis` |
| `description` | ✅ | **触发机制核心**：做什么 + 何时触发 + 负面边界 | 见 3.2 |
| `compatibility` | ❌ | 运行时依赖，极少用 | `compatibility:\n  nodejs: ">=18.0.0"` |
| `metadata` | ❌ | 扩展元信息 | `metadata:\n  author: vercel\n  version: "1.0.0"` |
| `license` | ❌ | 许可证说明 | `license: Complete terms in LICENSE.txt` |
| `argument-hint` | ❌ | 调用参数提示 | `argument-hint: <file-or-pattern>` |

> 实测：21 个 skill 中 `name`+`description` 100% 存在；其余字段均 ≤2 个 skill 使用，**非必要不添加**。

### 3.2 description 黄金写法(最重要)

description 是模型判断"是否调用此 skill"的唯一依据。必须包含三段：

1. **做什么** —— 一句话讲清能力边界
2. **何时触发** —— 列举具体触发短语/场景，要"pushy"(鼓励触发)，覆盖同义词、口语、隐含意图
3. **负面边界** —— 明确什么情况不该用，最好指明该改用哪个 skill(路由分流)

**优秀范例**(`systematic-literature-review`，三段齐全 + 路由分流)：
```yaml
description: Use this skill when the user wants a systematic literature review, survey,
  or synthesis across multiple academic papers on a topic. Also covers annotated
  bibliographies and cross-paper comparisons. Searches arXiv and outputs reports in
  APA, IEEE, or BibTeX format. Not for single-paper tasks — use academic-paper-review
  for reviewing one paper.
```

**反例 → 正例对比**(skill-creator 建议)：
- ❌ `How to build a simple dashboard to display internal data.`
- ✅ `... Make sure to use this skill whenever the user mentions dashboards, data
  visualization, internal metrics, or wants to display any kind of company data,
  even if they don't explicitly ask for a 'dashboard.'`

> 模型当前倾向于"漏触发"而非"误触发"，所以 description 宁可写得主动、覆盖面广一些。

---

## 4. SKILL.md 正文结构规范

推荐章节顺序(可裁剪，但 `Overview` 和 `Workflow` 几乎必备)：

```markdown
# <Skill 显示标题>

## Overview / 概述
能力总览 + 它解决什么问题 + 输出形态。

## When to Use This Skill       ← 对 description 的展开(触发场景细化、用例清单)
- 用户说 "..." → 用本 skill
- 用户上传 X / 提供 Y → 用本 skill

## When NOT to Use               ← 负面边界(可选，但强烈建议，避免误用)
- 单篇论文评审 → 改用 academic-paper-review

## Workflow / 工作流             ← 核心章节，把任务拆成有序/条件分支步骤
### Step 1: ...
### Step 2: ...
（脚本调用用代码块给出完整命令，见 §5）

## Output Format / 输出格式      ← 用模板或示例约束输出(见 §4.2)

## References                    ← 指向 references/templates/，说明何时该去读
```

### 4.1 Workflow 写法

- **顺序型**：开头给步骤总览，再逐 Step 展开(对应 `references/workflows.md` 的 Sequential 模式)
- **条件分支型**：用决策点引导(对应 Conditional 模式)：
  ```
  1. 确定任务类型:
     **新建内容?** → 走"Creation workflow"
     **编辑现有?** → 走"Editing workflow"
  ```

### 4.2 输出格式约束(从 `references/output-patterns.md`)

- **严格格式**(API 响应、数据格式)：`ALWAYS use this exact template:` + 固定骨架
- **灵活格式**(报告、写作)：`Here is a sensible default format, but use your best judgment:` + 可调骨架
- **示例驱动**(commit message、风格类)：给 2~3 个 Input/Output 配对，比纯描述更清晰

### 4.3 渐进式披露的实操

- 正文接近 500 行 → 把细节拆到 `references/`，正文留**清晰指针**("详见 references/xxx.md 的 Y 部分")
- 多变体场景 → 按变体拆文件，模型只读相关那篇(如 `chart-visualization/references/generate_line_chart.md`)
- 单个 reference >300 行 → 文件开头加目录(TOC)

---

## 5. 脚本(scripts/)规范

### 5.1 写法约定(实证自 `generate.py`/`analyze.py`/`arxiv_search.py`)

- **语言**：优先 Python；图表/前端用 Node(`chart-visualization/scripts/generate.js`)
- **CLI 接口**：统一用 `argparse`，**长选项** `--flag value`
- **必填参数**：`required=True` 显式标注；路径参数强调 **Absolute path(绝对路径)**
- **密钥**：通过**环境变量**读取(如 `GEMINI_API_KEY`)，绝不硬编码
- **入口**：`if __name__ == "__main__":` 包裹
- **健壮性**：`try/except` 捕获异常并 `print` 友好错误信息；对外部输入做校验(如 `validate_image`)
- **幂等/可复用**：函数式组织(`generate_image(...)` 单一职责)，便于测试与跨迭代复用

### 5.2 在 SKILL.md 中的调用约定(统一格式)

```bash
python /mnt/skills/public/<skill-name>/scripts/<script>.py \
  --prompt-file "<absolute-path>" \
  --reference-images "<path1>" "<path2>" \
  --output-file "/mnt/user-data/outputs/<result>.png"
```

- 路径前缀固定为 `/mnt/skills/public/<skill-name>/`(平台约定)
- 产物统一输出到 `/mnt/user-data/outputs/`
- 多行用 `\` 续行，参数可读

---

## 6. 评测(evals/)规范

> 仅当输出**可客观验证**(文件转换、数据抽取、固定流程)才建议建 `evals/`；主观输出(写作/设计)以人工评审为主。

### 6.1 `evals/evals.json` 结构

```json
{
  "skill_name": "<与 frontmatter name 一致>",
  "evals": [
    {
      "id": 1,
      "prompt": "具体、口语化、带真实细节(URL/文件名/数量)的真实用户请求",
      "expected_output": "对预期结果的人类可读描述",
      "expectations": [
        "可被客观验证的断言(过去式陈述)",
        "例: The script was called with --category cs.CV",
        "例: The report was saved to /mnt/user-data/outputs/"
      ]
    }
  ]
}
```

### 6.2 prompt 写法要点

- **写真实请求**，不要抽象空泛。带文件路径、人名、列名、URL、背景故事，可有口语/缩写/小写
- ❌ `"Create a chart"` → ✅ `"我老板发了个 Q4 sales.xlsx，要我把 C 列收入、D 列成本算成利润率百分比加一列..."`

### 6.3 必备的负例(should-not-trigger)

- 加入**近义但应路由到别的 skill** 的请求作为负例，验证触发分流是否正确
- 实证：`systematic-literature-review` 的 eval 4 故意给单篇论文 URL，断言"本 skill 不应被触发，应路由到 academic-paper-review"

---

## 7. 跨 skill 协作规范

创建新 skill 时，若依赖或可被其他 skill 复用，遵循以下引用方式(实证自 21 个 skill)：

| 关系类型 | 写法 | 范例 |
|---|---|---|
| **强依赖**(必读另一 skill 的 SKILL.md / 调其脚本) | 正文明确写 `Read /mnt/skills/public/<X>/SKILL.md` + 给出其脚本调用命令 | `ppt-generation` → `image-generation` |
| **协作组合**(建议一起加载) | 正文末尾 "works well in combination with the `<X>` skill — load both" | `academic-paper-review` → `deep-research` |
| **流水线委派**(编排型) | 用 Phase 描述交接：本 skill 出 X → 委派 `<Y>` 做 Z → 回收产出 | `consulting-analysis` → `deep-research`/`data-analysis` |
| **互斥路由**(同领域分流) | description + 正文均写 "Not for ... use `<X>` instead / route to `<X>`" | `systematic-literature-review` ↔ `academic-paper-review` |

> **枢纽 skill**：`deep-research`(研究前置)、`image-generation`(图像能力下沉) 被高频复用。新 skill 若属"内容生成类"，常声明与 `deep-research` 协作。

---

## 8. 最小骨架模板(可直接复制)

```
my-skill/
└── SKILL.md
```

```markdown
---
name: my-skill
description: Use this skill when <触发场景 + 同义词 + 口语表达>.
  <做什么>. <负面边界: Not for X — use Y instead>.
---

# My Skill

## Overview
<一句话能力总览 + 解决什么问题 + 输出形态>

## When to Use This Skill
- 用户说 "<phrase>" / 上传 <file> / 需要 <capability> 时触发
- <隐含意图场景，鼓励触发>

## When NOT to Use
- <X 场景> → 改用 <other-skill>

## Workflow
### Step 1: <动作>
### Step 2: <动作>
（若用脚本:）
```bash
python /mnt/skills/public/my-skill/scripts/run.py \
  --input "<absolute-path>" \
  --output "/mnt/user-data/outputs/result.md"
```

## Output Format
<模板或示例，约束产出结构>
```
```

---

## 9. 新建 skill 自检清单

- [ ] 目录名 == frontmatter `name`(kebab-case)
- [ ] `description` 三段齐全：做什么 + 何时触发(含同义词，偏 pushy) + 负面边界
- [ ] 正文以 `# 标题` 起始，含 `Overview` 和 `Workflow`
- [ ] 正文 <500 行；超了就拆 `references/` 并留指针
- [ ] 指令用祈使句；解释 why 而非堆 MUST/ALWAYS
- [ ] 确定性任务已下沉为 `scripts/`，密钥走环境变量，路径用绝对路径
- [ ] 脚本调用命令在 SKILL.md 中完整给出，输出到 `/mnt/user-data/outputs/`
- [ ] 输出格式用模板/示例约束(严格 or 灵活 or 示例驱动)
- [ ] 若与其他 skill 相关，按 §7 写明协作/路由关系
- [ ] (输出可客观验证时)建 `evals/evals.json`，含真实 prompt + 负例
- [ ] 已用 `skill-creator` 跑过测试用例并迭代

---

## 10. 附录：21 个既有 skill 的结构实证

| skill | SKILL.md | scripts | templates | references | assets | evals | 特征 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| academic-paper-review | ✓ | | | | | | 纯方法论，→ 协作 deep-research |
| bootstrap | ✓ | | ✓ | ✓ | | | 对话式 onboarding，生成 SOUL.md |
| chart-visualization | ✓ | ✓(node) | | ✓×26 | | | 按图表类型拆 references，渐进披露典范 |
| claude-to-deerflow | ✓ | ✓ | | | | | 平台桥接 skill |
| code-documentation | ✓ | | | | | | 纯方法论，→ 协作 deep-research |
| consulting-analysis | ✓ | | | | | | 编排型，两阶段委派下游 |
| data-analysis | ✓ | ✓ | | | | | DuckDB SQL 分析，被咨询分析委派 |
| deep-research | ✓ | | | | | | **研究枢纽**，被 4 个 skill 组合 |
| find-skills | ✓ | ✓ | | | | | 元 skill，发现/安装 |
| frontend-design | ✓ | | | | | | 带 LICENSE |
| github-deep-research | ✓ | ✓ | | | ✓ | | 多轮研究，含报告模板 |
| image-generation | ✓ | ✓ | ✓ | | | | **图像枢纽**，被 ppt/video 依赖 |
| newsletter-generation | ✓ | | | | | | → 协作 deep-research |
| podcast-generation | ✓ | ✓ | ✓ | | | | TTS 双主持播客 |
| ppt-generation | ✓ | ✓ | | | | | 强依赖 image-generation |
| skill-creator | ✓ | ✓ | | ✓ | ✓ | ✓ | **元 skill**，含 agents/eval-viewer |
| surprise-me | ✓ | | | | | | 元 skill，动态组合任意 skill |
| systematic-literature-review | ✓ | ✓ | ✓ | | | ✓ | 唯一带 evals 的范例 |
| vercel-deploy-claimable | ✓ | ✓ | | | | | 带 metadata(author/version) |
| video-generation | ✓ | ✓ | | | | | 协作 image-generation 出参考帧 |
| web-design-guidelines | ✓ | | | | | | 带 metadata + argument-hint |
