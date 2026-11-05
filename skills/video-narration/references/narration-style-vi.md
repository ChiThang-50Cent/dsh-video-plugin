# Vietnamese narrator style

Read this when drafting or editing spoken Vietnamese, or when choosing how a genre should sound. It is a style guide, not a topic outline.

## Default voice

A calm, competent teacher or host who is interested in the subject and respects the listener's time. The voice may be warm, dry, curious, or urgent for a particular genre, but it must stay one person for the whole episode: same address form, same level of formality, same attitude to mistakes.

Choose one address and keep it:

- `chúng ta` — shared inquiry; good for lessons and essays.
- `bạn` — direct, slightly more personal; good for how-to and short form.
- A project-specific convention (for example a named host) only when the series defines it.

Never alternate between `bạn`, `các bạn`, `chúng ta`, and `quý vị` without a reason the listener can feel.

## Paragraph rhythm

Write in paragraphs that each carry one move of the argument: a question, an example, an obstacle, a resolution, a consequence. Two to five sentences is a useful default, but vary it. A one-line paragraph can land a turn; three long paragraphs in a row flatten the ear.

Read the paragraph aloud before keeping it. If you run out of breath, split it. If two sentences say the same thing, delete one. If a paragraph only announces what the next paragraph will do, merge it.

Avoid a metronome of short declaratives: `Ta có ba. Bình phương là chín. Tiếp theo là bốn.` That is a slide, not speech.

## A preferred teaching pattern (not a formula)

For Vietnamese educational narration, the most reliable shape is usually:

**curiosity → observation → reasoning → discovery → generalization**

1. **Curiosity**: a concrete situation, contradiction or question the viewer can feel. Not "hôm nay chúng ta sẽ học..." and not a definition first.
2. **Observation**: something specific to notice, count, compare or try — a small worked case, an image, a number the viewer can check.
3. **Reasoning**: why the observation happens; the distinction, condition or derivation that makes it more than a coincidence.
4. **Discovery**: name the idea the listener has just earned. This is the moment the abstraction is allowed to arrive.
5. **Generalization**: state the rule, its scope and a boundary case, then return to the opening.

This is a preference, not a mandate. A documentary may move by cause and consequence; a short may need one turn; an essay may argue from a thesis; a product explainer may start from a user's failure. Do not insert five labelled sections into a genre that does not need them. The invariant is that every step changes what the listener knows, and that abstraction arrives after the listener has a reason to want it.

## Transitions that do work

A transition should state a reason, not a sequence number:

- Because the shortcut fails here: `Cách quen thuộc này tưởng như đủ, nhưng nó chỉ đúng khi ...`
- Because a question remains: `Vậy điều gì đã thay đổi khi ta chuyển từ ... sang ...?`
- Because a result needs interpretation: `Kết quả là sáu. Nhưng con số đó không phải là điểm kết thúc; nó cho biết ...`
- Because a condition matters: `Lập luận trên chỉ đứng vững nếu ...`
- Because the audience may object: `Có thể bạn đang nghĩ: nếu vậy thì trường hợp ... thì sao?`

Avoid `đầu tiên`, `tiếp theo`, `cuối cùng` as paragraph openers unless you are giving real procedural steps. They make a lesson sound like a checklist and hide whether one idea follows from another.

Avoid filler that carries no information: `rõ ràng`, `rất đơn giản`, `như bạn thấy đây`, `không thể phủ nhận`. If something is simple, show why; do not assert it.

## Rhetorical questions

Use a question when it creates a real gap the next paragraph closes: `Vì sao hai lần đổi chiều lại quay về hướng cũ?` Do not use one every paragraph as a tic, and do not ask a question you never answer.

## Analogies and intuition

An analogy is useful when it preserves the structure of the idea, not just the mood. State where it stops working:

> Nhân với một số âm giống như vừa kéo dài một mũi tên vừa lật ngược nó. Cách so sánh này đúng về hướng, nhưng không nói gì về độ lớn, nên ta vẫn cần phần đại số ở sau.

If the analogy would create a wrong belief, drop it or repair it immediately.

## Vocalizing formulas

Write two different things:

- **Display text** — the formula the viewer reads. Keep it in a fenced block or a heading-level note that is excluded from speech.
- **Spoken text** — how a person says it. Never place raw LaTeX in a spoken paragraph.

| Display | Spoken |
|---|---|
| `a^2` | a bình phương |
| `(a + b)^2` | a cộng b, tất cả bình phương |
| `a^2 - b^2` | a bình phương trừ b bình phương |
| `1/x` | một phần x |
| `x \to 0^+` | x tiến tới 0 từ phía bên phải |
| `x \ne 0` | x khác 0 |
| `a \ge 0` | a lớn hơn hoặc bằng 0 |
| `\sqrt{a}` | căn bậc hai của a |
| `\lim_{x \to 0} f(x)` | giới hạn của f(x) khi x tiến tới 0 |

For a displayed derivation, say what the step *means* rather than reading every symbol:

> Ta nhân cả hai vế với trừ hai. Vế trái vẫn bằng không, nên vế phải cũng phải bằng không. Từ đó, trừ sáu cộng với tích của trừ hai và trừ ba phải bằng không. Muốn vậy, tích đó phải bằng sáu.

## Terminology and audience

Use the precise term once, then a paraphrase the audience already owns. Do not alternate randomly between `nghiệm`, `đáp án`, and `kết quả` if they mean different things. Do not dumb down a term by replacing it with a wrong synonym.

For introductory audiences, define a term at the moment it becomes necessary, not in a glossary at the start. For expert audiences, spend the words on the non-obvious step instead of redefining what they know.

Numbers, units, dates, and names must be spoken in a way a TTS engine can read naturally; expand abbreviations on first use. Prefer `năm 1954` over `1954` when the year is ambiguous, and say `phần trăm` rather than `%` inside prose.

## Genre variations

**Math and science explainer.** One central question, one interpretive idea, examples that each do different work (intuition, proof, counterexample, application). Explain why the rule is forced, not only what it is. State domains and one-sided/two-sided conditions where they change the answer.

**Documentary and history.** Build a scene the listener can picture, then widen to cause and consequence. Attribute contested claims; distinguish what the sources record from what historians infer. Uncertainty is part of the narration, not a disclaimer at the end.

**Product or service explainer.** Start from the user's situation, not the feature list. Explain the trade-off and the condition under which the product is the wrong choice; that earns trust and prevents an infomercial tone.

**Video essay.** A thesis, a tension, and a line of evidence. Personal voice is allowed; unsupported assertion is not. Keep the through-line visible so the film does not become a montage of observations.

**Short form.** One idea, one turn, one payoff. The hook may be a concrete detail rather than a question. Cut every sentence that only prepares for the next one.

## What not to imitate from the indeterminate-forms sample

The sample is a model for rhetorical architecture, not for scope or wording:

- Do not try to cover every method in one episode. Pick the one idea the episode can actually earn.
- Do not copy its limit framing uncritically. The sample's third example says `x -> 0 from the positive side`, where `1/x -> +infinity` is correct, but the examples are introduced as `x -> 0` (two-sided) and the conclusion never states that the left-hand limit is `-infinity` or that the two-sided limit does not exist. When reusing such an example, state the right-hand limit, the left-hand limit and the two-sided conclusion.
- Do not copy its address drift. The sample moves between `chung ta`, `minh`, `cac ban` and `ban`; keep the warmth and the asides, but choose one address form for the episode.
- Do not reproduce its sentences, examples, or phrasing. Derive your own examples and attribute the source if you use its structure.
- Do not repeat the same formulaic transition in every section just because the sample is long.

## Final read-aloud check

- Can a listener follow the main line with the screen off?
- Does every example change what the listener believes or can do?
- Is each formula spoken, and is each condition stated where it matters?
- Are there sentences that exist only to announce the next sentence?
- Does the ending say what the listener now understands, rather than list the formulas again?
