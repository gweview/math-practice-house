# Question engine contract

`src/engine.js` is a dependency-free ES module. Public exports:

- `DIMENSIONS`: `{id,label,description}[]`; IDs `basic`, `fill`, `equivalence`, `pattern`, `reverse`, `reasoning`, `application`.
- `LEVELS`: `{id:1,label:'起步'}`, `{id:2,label:'进阶'}`, `{id:3,label:'挑战'}`.
- `loadCatalog()`: asynchronously fetches module-relative `../data/topics.json`, `questions.json`, `dependencies.json`, validates them, and returns `{topics,questions,dependencies}`. HTTP, JSON and validation errors reject. Intended for browser HTTP hosting; Node callers should read JSON with `fs` and pass the catalog directly. Static JSON imports also work.
- `getCapabilities(topic)`: returns available dimension IDs, **across supported levels**, not a promise that every dimension × level exists.
- `generateWorksheet(catalog, options)`: synchronous; returns `{questions,warnings,seed,requestedCount}`. Required options: `{grade:1|2|3,semester:'all'|'上'|'下',topicId:'all'|id,dimensions:[dimensionId,...],level:1|2|3,count:6|12|18,seed:string}`. Invalid options/catalog throw; a valid semester filter with no matching topic yields zero questions plus warnings. A topic from another grade throws.
- `checkAnswer(question,value)`: boolean, accepting strings and finite numeric answers, never treating blank as zero. Supports Unicode fullwidth forms, whitespace removal, case-insensitive choice keys (including parenthesized letters), exact choice text, exact rational equality for decimal/fraction notation, and normalized comma-separated answers. It does not evaluate expressions, accept approximate fractions, infer omitted units, or interpret Chinese number words.

Questions contain `id,topicId,topicName,grade,dimension,level,prompt,answer,explanation,hint,source,fingerprint`; `answer` is always a string. Optional `choices` remains `{key,text}[]`; optional `visual` is typed semantic metadata (`arithmetic`, `rectangle`, `time`, `pattern`, `equivalence`). Do not print raw metadata to pupils: it may contain solved quantities for diagrams/verification. UI may simply render the prompt. Source questions retain original additional fields such as `difficulty`, `type`, and `verify`; the engine **never evaluates** `verify` strings.

## Actual coverage

Validated catalog: 108 topics, 432 source questions, 153 dependency edges. All 108 topics have source `basic` questions at levels 1 and 2: upstream `basic → 1`, `standard → 2`. They are not reclassified into other thinking dimensions. No source question is upgraded to challenge.

There are 36 topics with independently authored parametric extensions:

- 32 explicit arithmetic topic profiles: addition/subtraction (5, 10, 20, 100, and three-digit ranges), non-carry addition, making ten, fixed addends/subtrahends, oral versus written arithmetic, multiples of ten, multiplication tables, exact division, and multi-digit multiplication/division. `fill`, `reverse`, `reasoning`, `application`, levels 1–2. First-grade profiles use only addition/subtraction and never exceed 100. Table division limits both divisor and quotient to the applicable table. Ambiguous zero-dividend missing-divisor questions are excluded.
- `cnm_p089` (grade 3 area): `reverse`, `reasoning`, levels 1–2; recover a side from area, undo a cut strip, compare equal-perimeter rectangles' areas.
- `cnm_p063` (grade 2 elapsed time): `reverse`, `reasoning`, levels 1–2; undo duration and check elapsed time, within an hour or crossing an hour. No date/24-hour-clock knowledge required.
- `cnm_p224` (grade 3 equivalence): `equivalence`, levels 1–3. One substitution; chained substitution; total weight plus a weight ratio requiring substitution before division. Each problem has a unique positive-integer solution.
- `cnm_p060` (grade 2 patterns): `pattern`, levels 1–3. Constant increments; alternating increments; increments themselves increasing by an explicit fixed amount. The rule is always stated, avoiding ambiguous finite-prefix guessing.

Arithmetic level 2 fill moves the unknown to the first operand; reverse and application add an undo/second operation. Reasoning checks a claimed comparison, using a larger comparison quantity at level 2. Area reasoning is available at both non-challenge levels but is the same structural task; these labels are author-defined practice categories, not calibrated psychometric difficulty.

**Challenge is currently supported only for equivalence and patterns.** All other challenge combinations return warnings and zero questions, never easier fallback. Unsupported requested dimensions are warned even if other dimensions fill the sheet. Tiny valid domains (e.g. `9加几`) may honestly provide fewer than 18 unique problems. A finite bounded candidate budget is used for large arithmetic domains; a shortage warning describes availability in that generated candidate pool, not a mathematical proof that no more questions exist.

Selection is seeded and reproducible within this engine version and identical catalog ordering. Dimensions are selected round-robin so large parametric pools do not crowd out source basics. A sheet contains no repeated canonical prompt/answer/choice fingerprint. No cross-sheet uniqueness is promised. Dependency edges are validated, but prerequisite remediation/scheduling is the UI's responsibility; they are not used to introduce other-grade questions.

## Verification and provenance

Run `node --test tests/engine.test.js`. Tests cover every source topic and difficulty mapping, invalid input/catalogs, seeded random arithmetic independently checked from prompts, unique fill and substitution solutions, explicit-rule pattern calculations, grade/semester constraints, 6/12/18 counts and honest shortage, deduplication, non-mutation, fetch failures, and answer normalization.

The source taxonomy is an upstream AI draft, not teacher-reviewed, from commit `1e9f3d278b90e5a5c36e832c340e262feff0ca78`, licensed CC BY-NC 4.0. Engine tests verify templates and contracts; they do not constitute teacher review of all inherited wording or establish classroom suitability. Original templates do not remove attribution/noncommercial obligations for the supplied catalog.
