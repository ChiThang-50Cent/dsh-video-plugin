# Annotated before/after examples

These are short illustrations of the difference between scene-driven writing and listener-first writing, plus one editorial evaluation case. They are not scripts to reuse verbatim, and they are not a fixed template: a 35-second short, a history documentary, and a proof need different pacing. Read them before drafting any nontrivial explanation.

For every pair, the "why" is about what a listener can follow with the screen off — not about drama or word count.

## 1. A pattern that needs a reason: `n^2 = (n-1)(n+1) + 1`

### Scene-driven (weak)

> Ba bình phương bằng chín. Bốn bình phương bằng mười sáu. Năm bình phương bằng hai mươi lăm. Ta áp dụng quy tắc: n bình phương bằng n trừ một, nhân n cộng một, rồi cộng một. Kết quả đúng.

The listener hears three results, then a rule, then an assurance. Nothing explains why the rule should be true, and "kết quả đúng" asks for trust instead of offering a reason.

### Listener-first (better)

> Hãy bắt đầu với hai số vuông ai cũng biết: chín và mười sáu. Chúng cách nhau bảy. Số vuông tiếp theo, hai mươi lăm, lại cách mười sáu chín đơn vị. Khoảng cách giữa hai số vuông liên tiếp không đứng yên; nó lớn dần.
>
> Nhưng có một điều kỳ lạ hơn. Lấy hai số đứng ngay trước và ngay sau một số, rồi nhân chúng lại. Với chín, đó là hai nhân bốn, được tám — kém chín đúng một. Với mười sáu, ba nhân năm được mười lăm — cũng kém đúng một. Có phải lúc nào cũng vậy?
>
> Ta thử viết điều đó bằng đại số. Hai số quanh n là n trừ một và n cộng một. Nhân chúng với nhau, ta được n bình phương trừ một. Vậy chỉ cần cộng thêm một là quay về n bình phương. Quy tắc không phải một mẹo rời rạc: nó nói rằng tích của hai số hàng xóm luôn đứng ngay dưới số vuông ở giữa.
>
> Và chính khoảng cách giữa hai số vuông liên tiếp — bảy, rồi chín, rồi mười một — là hệ quả của cùng một cấu trúc: hiệu đó bằng hai n cộng một.

```text
(n - 1)(n + 1) = n^2 - 1
(n - 1)(n + 1) + 1 = n^2
```

Why it is better for listening: the numbers are used as evidence for a question, not as a list of answers. The listener is invited to notice a pattern, then given a derivation that explains the pattern. The closing sentence connects two observations instead of adding a third formula.

Correctness note: the identity holds for all real `n`. The gap between consecutive squares is `(n+1)^2 - n^2 = 2n + 1`, so saying the gap grows by two each step is correct for consecutive integer `n`.

## 2. Explain where a term comes from: `(a + b)^2`

### Scene-driven (weak)

> a cộng b, tất cả bình phương, bằng a bình phương cộng hai ab cộng b bình phương. Đây là hằng đẳng thức đáng nhớ. Ta áp dụng vào bài tập.

The formula is read out and labeled. The listener is told to remember it, but not why the middle term has coefficient two, which is the only part that is easy to forget.

### Listener-first (better)

> Khi ta nhân một tổng với chính nó, mỗi phần tử ở ngoặc thứ nhất gặp từng phần tử ở ngoặc thứ hai. a gặp a, được a bình phương. a gặp b, được ab. b gặp a, được ab nữa. Và b gặp b, được b bình phương.
>
> Chú ý chỗ quan trọng: có hai tích ab, không phải một. Một cái đến từ a nhân b; cái còn lại đến từ b nhân a. Vì phép nhân giao hoán, chúng bằng nhau, và cộng lại thành hai ab. Đó là lý do hạng tử giữa có hệ số hai — không phải một quy ước cần học thuộc, mà là kết quả của việc đếm đủ bốn cặp.
>
> Với a và b không âm, ta còn thấy được điều này bằng hình học: một hình vuông cạnh a cộng b được chia thành bốn phần — hai hình vuông và hai hình chữ nhật. Nhưng hãy cẩn thận: cách chứng minh bằng diện tích cần độ dài không âm. Bản thân hằng đẳng thức vẫn đúng với mọi số thực, kể cả số âm; khi đó ta dựa vào đại số, không dựa vào hình.

```text
(a + b)^2 = (a + b)(a + b)
         = a^2 + ab + ba + b^2
         = a^2 + 2ab + b^2
```

Why it is better for listening: the narration explains the origin of `2ab`, which is the one part a listener cannot reconstruct from memory. It also separates the algebraic identity from the geometric picture and states the condition under which the picture applies.

Correctness note: `ab = ba`, so the two cross terms are equal even when the factors are negative. The geometric argument requires `a, b >= 0` because they are side lengths; the algebraic identity has no such restriction.

## 3. A limit where the one-sided behavior is the content

### Scene-driven (weak)

> Giới hạn của x trên x bình phương khi x tiến tới 0 là dương vô cực.

This is not merely imprecise; it is false as a two-sided statement. The supplied reference actually says `from the positive side` in its third example, so the right-hand statement is correct — but it never states the two-sided conclusion. The lesson is to state both, not to copy the framing or the omission.

### Listener-first (better)

> Biểu thức này chỉ có nghĩa khi x khác 0, vì mẫu số không được bằng 0. Với điều kiện đó, x chia cho x bình phương rút gọn thành một phần x.
>
> Bây giờ hãy đến gần 0 từ hai phía. Nếu x là số dương rất nhỏ, một phần x là số dương rất lớn: khi x tiến tới 0 từ bên phải, biểu thức tiến tới dương vô cực. Nếu x là số âm rất nhỏ về độ lớn, một phần x lại là số âm rất lớn: khi x tiến tới 0 từ bên trái, biểu thức tiến tới âm vô cực.
>
> Vì hai phía cho hai kết quả khác nhau, giới hạn hai phía tại 0 không tồn tại. Nói "bằng dương vô cực" mà không nói "từ bên phải" là bỏ mất phần quan trọng nhất của bài toán.

```text
x / x^2 = 1 / x   (x != 0)
lim x->0+  1/x = +infinity
lim x->0-  1/x = -infinity
lim x->0   1/x does not exist
```

Why it is better for listening: the qualification is spoken as part of the reasoning, not appended as a footnote. The listener hears why the two sides differ, so the conclusion is memorable rather than arbitrary.

Correctness note: `x / x^2 = 1/x` only after excluding `x = 0`, where the original expression is undefined. The two-sided limit does not exist even in the extended sense, because the two one-sided extended limits disagree.

## 4. The style is not math-only: a documentary opening

### Scene-driven (weak)

> Hội An là thành phố cổ. Nó có nhiều nhà gỗ. Nhà gỗ được xây từ thế kỷ mười bảy. Kiến trúc rất đẹp. Năm 1999, Hội An được UNESCO công nhận.

Facts in sequence, no question, no reason to care, and no separation between what the record shows and what the narrator infers.

### Listener-first (better)

> Những ngôi nhà gỗ ở Hội An đã đứng qua mấy thế kỷ mưa mùa và nắng gắt. Với gỗ, đó là một điều không hiển nhiên: mưa làm gỗ cong, mối làm gỗ rỗng, và thời gian làm mọi thứ lỏng ra. Vậy vì sao nhiều ngôi nhà vẫn còn?
>
> Các tài liệu còn lại cho thấy người Hội An đã chọn những loại gỗ có độ bền cao, dựng khung chịu lực trước rồi mới lấp vách, và để mái vươn rộng để nước mưa không chảy thẳng xuống chân cột. Đó là những giải pháp kỹ thuật, nhưng chúng chỉ tồn tại được vì cộng đồng đã liên tục sửa chữa qua nhiều thế hệ.
>
> Có một điểm cần cẩn thận: "nhà cổ còn nhiều" không có nghĩa là mọi ngôi nhà đều nguyên bản. Nhiều cấu kiện đã được thay qua thời gian. Điều bền vững không phải là từng thanh gỗ, mà là cách người ta duy trì ngôi nhà.

```text
No spoken formulas. Display-only: map/date caption if the scene needs it.
```

Why it is better for listening: a concrete puzzle replaces a list of facts. The explanation names mechanisms, then separates the surviving structure from the replaced parts. Source uncertainty is spoken where it changes the claim, without turning the film into a disclaimer.

Correctness note: a real production must cite the specific conservation and archival sources for the construction and repair claims; this example is illustrating narrative shape only.

## Patterns to avoid

- Three examples in a row with no statement of what changed in the listener's understanding.
- A formula displayed and then read symbol by symbol.
- "Như bạn thấy" when the listener cannot see the referenced object.
- A conclusion that summarizes the sections instead of the idea.
- Treating an engaging paragraph as evidence that its mathematics is right.


## 5. Editorial evaluation: the previous "Đại số là gì?" script

This case is not a before/after rewrite to copy. It is the regression fixture at `tests/fixtures/editorial/algebra-la-gi/`. It reconstructs the weaknesses recorded for the earlier production so the editorial reviewer can prove it detects them from text, not from a status field.

### Recorded weaknesses

1. **Forced opening.** "Chào mừng các bạn đến với video Đại số là gì. Hôm nay chúng ta sẽ cùng nhau tìm hiểu..." The film announces itself and previews an agenda before giving the listener a concrete observation. Replace it with the observation itself; the title can carry the introduction.
2. **Disconnected Newton digression.** A section begins "Nhân đây, hãy nói về một định luật nổi tiếng của vật lý..." and explains universal gravitation. It is not wrong; it is not connected in speech to the central question "Đại số là gì?". A legitimate cross-domain example must state in its opening why it is the same idea, or it reads as a different video.
3. **Repeated abstract conclusions.** "Đại số là một ngôn ngữ." appears as a standalone conclusion more than once, and the ending restates it again. Repetition may be rhetorical, but here each occurrence asserts the thesis instead of adding a consequence, so the listener does not learn a new step.
4. **Unexplained identity switch.** The script explains `(a + b)^2` and its `2ab` term, then jumps to "Lấy ví dụ chín mươi chín nhân một trăm lẻ một" and uses `a^2 - b^2`. The displayed derivation appears after the spoken example; a listener has only heard the square-of-a-sum identity. The fix is to name and state the new identity in speech before using it.

### Required reviewer output

The evaluation expects findings with codes `opening.meta-greeting`, `continuity.external-digression`, `repetition.verbatim` and `reasoning.unexplained-identity-switch`. Each must quote the real sentence, identify the paragraph/section, explain the listening problem, give evidence/reasoning, propose the correction, and carry a resolution status. The fixture contains no fake `status: "FAIL"`; the evaluator must derive the findings. With those findings unresolved, a review claiming PASS fails the editorial gate. This is the standard for all genres, not a math-only exception.
