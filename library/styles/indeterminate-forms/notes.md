# Style notes: indeterminate-forms lecture

Derived from `reference.vi.md` (user-provided, Vietnamese). Read this note before the transcript; do not paste the transcript into `narration.md` or into any installed skill. Rights are recorded in `style.json`.

## What the reference does well

- **Concrete, familiar opening.** It starts with divisions everyone knows (`10 : 5`, `100 : 25`), then turns the question: what if both quantities shrink toward zero? The surprise is earned by a familiar object, not by a generic greeting.
- **One central metaphor.** "Cuộc so tốc độ" (a race of rates) is stated after the three `0/0` examples and returns at every technique and in the ending. The listener has one idea to carry, not a list.
- **Bridges explain why the next tool exists.** Factorization is introduced because direct substitution fails; conjugation is introduced because a square root hides the factor; L'Hôpital is introduced when algebra becomes hard. Each transition names the obstacle, not just the next topic.
- **Worked examples have a full arc.** Substitute -> see `0/0` -> transform -> simplify -> substitute -> interpret. The bullets are full sentences with reasoning, not captions.
- **Warnings are content.** The L'Hôpital section shows a misapplication that gives a wrong answer, and a case where the rule is inconclusive while the original limit exists. That is the reference's strongest teaching move.
- **The ending returns to the metaphor** and says what the listener should carry, instead of listing formulas again.

## Voice and address (take the warmth, not the drift)

The transcript mixes `chúng ta`, `mình`, `các bạn`, and `bạn` (for example `mình sẽ giới thiệu`, `các bạn dễ nhầm lẫn`, `Cảm ơn bạn`). Choose one address form per episode. The tag question (`đúng không?`) and direct asides (`Bạn hãy để ý...`) work because each is followed by content; keep that, drop the random switching.

## Scope

One video covers `0/0`, `∞/∞`, L'Hôpital, and five further indeterminate forms. That is a series, not one episode. Split it; keep one central question per episode and let the metaphor carry across episodes.

## Display text versus spoken text

The transcript is a written script with inline LaTeX. For TTS, convert to speakable Vietnamese (`x trên x bình phương`, `một phần x`) and keep displayed formulas in fenced blocks. Do not read symbols one by one.

## Mathematical audit

The content is broadly correct. The one precision issue is the third `0/0` example:

- `x/x^2 = 1/x` for `x != 0`. The transcript says `x` approaches 0 **from the positive side**, where `1/x -> +∞`. That statement is correct.
- However, the three examples are introduced as `x` approaching 0 (two-sided), and the conclusion never says that the left-hand limit is `-∞` and the two-sided limit does not exist. A listener can leave with the false generalization "the limit is +∞".
- Required correction when this example is reused: state the right-hand limit, the left-hand limit, and the two-sided conclusion explicitly.

Other checks:

- `(x^2 - 1)/(x - 1) -> 2` at 1; `(x^3 - 8)/(x^2 - 4) -> 3` at 2; `(sqrt(x + 1) - 1)/x -> 1/2` at 0 — correct.
- `(3x^2 + 2x)/(x^2 - 5) -> 3`; the degree rule for rational functions is correct.
- `ln(x)/x -> 0`, `x^2/e^x -> 0` — correct; the second also supports "exponential grows faster than any polynomial".
- L'Hôpital precondition warning: `(x + 1)/(x + 2)` at 0 is `1/2`; a mechanical application gives `1`, which is a useful false result.
- `(x + sin x)/x -> 1` while L'Hôpital is inconclusive — correct.
- `x ln x -> 0` as `x -> 0+`; the right-hand domain should be stated because `ln x` is undefined for `x <= 0`.
- `sqrt(x^2 + x) - x -> 1/2` — correct.
- `(1 + 1/x)^x -> e`; the log derivation is correct.
- "Inverting both parts turns `∞/∞` into `0/0`" is a heuristic; state sign and domain caveats when reusing it.

## Short attributed extracts

Use these only as short credited phrases, never as body copy:

- `dạng vô định` — the standard term, not unique to the transcript.
- `cuộc so tốc độ` — the transcript's central metaphor; credit it if reused.
- `nhỏ dần, nhỏ dần` — deliberate repetition for rhythm.

## Do not

- Copy sentences, examples, or the full outline.
- Treat it as a factual source; it is a style reference.
- Reuse the `1/x` framing without the two-sided sentence.
- Reproduce the transcript in an installed skill or in the bundle package.
