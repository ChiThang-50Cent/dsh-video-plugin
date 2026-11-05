Chào mừng bạn đến với tập 2 của series Giải tích. Trước hết, chúng ta hãy bắt đầu bằng một phép chia rất quen thuộc: $10 : 5 = 2$, $100 : 25 = 4$. Những phép chia này rõ ràng rất đơn giản đúng không? Nhưng bây giờ, chúng ta thử làm một việc khác. Chúng ta lấy hai đại lượng, cho cả hai cùng nhỏ dần, nhỏ dần tiến sát về số 0, rồi chúng ta hỏi: Tỉ số giữa chúng sẽ tiến về đâu?

Nếu chưa từng tiếp xúc với giải tích, nhiều người có thể sẽ nghĩ là $0 : 0$ thì chắc bằng 0 hoặc bằng 1. Thế nhưng câu trả lời lại có thể là 1, có thể là 0, có thể là 50, và cũng có thể là vô cùng. Cùng một hình thức $0 : 0$ mà kết quả thì muôn hình vạn trạng. Trong giải tích, người ta gọi những tình huống như vậy là **dạng vô định**. Chữ "vô định" ở đây có nghĩa là chỉ nhìn vào hình thức thì chúng ta chưa thể kết luận được gì; chúng ta cần nhìn sâu hơn vào cấu trúc bên trong của biểu thức.

Trong video này, chúng ta sẽ cùng nhau tìm hiểu hai dạng vô định phổ biến nhất: $0/0$ và $\infty/\infty$, vì sao chúng vô định và cách xử lý từng dạng qua ví dụ cụ thể.

Nhưng trước hết, hãy cùng nhớ lại giới hạn thực chất là gì. Khi chúng ta viết giới hạn của $f(x)$ khi $x$ tiến tới $a$, chúng ta đang quan tâm đến việc các giá trị của hàm số tiến gần đến đâu khi $x$ tiến gần đến $a$. Điều thú vị là chúng ta không cần biết hàm số bằng bao nhiêu đúng tại điểm $a$, thậm chí hàm số có thể không xác định tại $a$ và giới hạn vẫn có thể tồn tại. Bạn có thể hình dung như thế này: bạn đang đi bộ về phía một ngôi nhà; giới hạn cho bạn biết bạn đang tiến về ngôi nhà nào, kể cả khi cánh cửa của ngôi nhà đó bị khóa và bạn không bao giờ thực sự bước vào được.

Với phần lớn các hàm số quen thuộc như đa thức, hàm mũ hay hàm lượng giác thì việc tính giới hạn khá đơn giản, chúng ta chỉ cần thay giá trị của $x$ vào là xong. Ví dụ: giới hạn của $x^2 + 1$ khi $x$ tiến tới 2 thì bằng $2^2 + 1$, tức là 5. Rắc rối chỉ bắt đầu khi phép thay trực tiếp cho ra một thứ không có nghĩa, và hai trường hợp gặp thường xuyên nhất chính là $0/0$ và $\infty/\infty$.

Chúng ta hãy xem xét 3 ví dụ rất đơn giản, tất cả đều với $x$ tiến tới 0:

* Ví dụ đầu tiên là $x/x$. Khi $x$ tiến tới 0, cả tử số lẫn mẫu số đều tiến tới 0. Thế nhưng với mọi $x \neq 0$, $x/x$ luôn bằng 1. Vậy giới hạn ở đây bằng 1.


* Ví dụ thứ hai là $x^2/x$. Tử và mẫu vẫn cùng tiến tới 0. Tuy nhiên khi chúng ta rút gọn, biểu thức trở thành $x$ và $x$ thì tiến tới 0. Vậy giới hạn bằng 0.


* Ví dụ thứ ba là $x/x^2$. Một lần nữa, tử và mẫu cùng tiến tới 0. Sau khi rút gọn, chúng ta được $1/x$. Khi $x$ tiến tới 0 từ phía dương, $1/x$ lớn dần không giới hạn; vậy biểu thức này tiến ra vô cùng.



Bạn thấy đấy, cả ba biểu thức đều có cùng hình thức $0/0$ nhưng kết quả lại hoàn toàn khác nhau. Lý do là nằm ở tốc độ. Điều quyết định kết quả là việc tử số và mẫu số tiến về 0 nhanh hay chậm hơn nhau. Khi tử số tiến về 0 nhanh hơn (giống như $x^2$ so với $x$) thì tử số thắng và tỉ số tiến về 0. Khi mẫu số tiến về 0 nhanh hơn, mẫu số thắng và tỉ số phình to ra vô cùng. Còn khi cả hai đi với tốc độ tương đương nhau, tỉ số sẽ ổn định quanh một con số hữu hạn nào đó. Chính vì vậy, khi gặp dạng $0/0$, chúng ta không được vội kết luận; chúng ta cần biến đổi biểu thức để làm lộ ra cuộc so tốc độ ẩn bên trong. Ở những phần tiếp theo, mình sẽ giới thiệu các công cụ giúp chúng ta làm việc đó.

---

Công cụ đầu tiên và cũng là công cụ cơ bản nhất, đó là **phân tích thành nhân tử**. Ý tưởng như sau: nếu một đa thức bằng 0 khi $x = a$ thì đa thức đó chắc chắn chứa nhân tử $(x - a)$. Vì vậy, khi cả tử và mẫu đều bằng 0 tại $a$, cả hai thường có chung nhân tử $(x - a)$. Nhân tử chung này chính là thủ phạm gây ra dạng $0/0$. Nếu chúng ta loại bỏ được nó thì vấn đề thường sẽ được giải quyết.

Hãy thử làm một ví dụ nhé: Hãy tính giới hạn của $\frac{x^2 - 1}{x - 1}$ khi $x$ tiến tới 1.

* Đầu tiên, chúng ta thử thay $x = 1$: tử số trở thành $1 - 1 = 0$, mẫu số cũng là $1 - 1 = 0$; vậy đây đúng là dạng $0/0$.


* Tiếp theo, chúng ta phân tích tử số theo hằng đẳng thức hiệu hai bình phương: $x^2 - 1 = (x - 1)(x + 1)$.


* Lúc này, biểu thức trở thành $\frac{(x - 1)(x + 1)}{x - 1}$. Vì $x$ chỉ tiến tới 1 chứ không bằng 1 nên $x - 1 \neq 0$ và chúng ta được phép rút gọn, biểu thức còn lại là $x + 1$.


* Cuối cùng, chúng ta thay $x = 1$ vào $x + 1$ và được kết quả là 2.



Bạn hãy để ý một chi tiết nhỏ nhưng rất quan trọng: hàm số ban đầu không xác định tại $x = 1$, còn hàm $x + 1$ thì xác định ở mọi nơi. Hai hàm này giống hệt nhau ở mọi điểm, chỉ khác nhau đúng tại $x = 1$. Nhưng vì giới hạn không quan tâm đến giá trị tại chính điểm đó nên hai hàm có cùng giới hạn. Đây chính là lý do việc rút gọn hoàn toàn hợp lệ.

Chúng ta thử thêm một ví dụ khó hơn một chút: Hãy tính giới hạn của $\frac{x^3 - 8}{x^2 - 4}$ khi $x$ tiến tới 2.

* Thay $x = 2$, tử số là $8 - 8 = 0$, mẫu số là $4 - 4 = 0$, lại là dạng $0/0$.


* Với tử số, chúng ta dùng hằng đẳng thức hiệu hai lập phương: $x^3 - 8 = (x - 2)(x^2 + 2x + 4)$.


* Với mẫu số: $x^2 - 4 = (x - 2)(x + 2)$.


* Sau khi rút gọn nhân tử chung $(x - 2)$, chúng ta còn lại $\frac{x^2 + 2x + 4}{x + 2}$.


* Thay $x = 2$, tử số là $4 + 4 + 4 = 12$, mẫu số là 4; vậy giới hạn bằng 3.



---

Phân tích nhân tử hoạt động rất tốt với đa thức. Tuy nhiên, khi biểu thức có chứa căn bậc hai, việc tìm nhân tử chung trở nên khó khăn hơn. Lúc này chúng ta cần đến một kỹ thuật khác gọi là **nhân liên hợp**. Biểu thức liên hợp của $\sqrt{A} - B$ là $\sqrt{A} + B$. Khi nhân hai biểu thức này với nhau theo hằng đẳng thức hiệu hai bình phương, chúng ta được $A - B^2$, dấu căn đã biến mất; đó chính là mục đích của việc nhân liên hợp.

Chúng ta cùng xét ví dụ sau: Hãy tính giới hạn của $\frac{\sqrt{x + 1} - 1}{x}$ khi $x$ tiến tới 0.

* Thay $x = 0$, tử số là $\sqrt{1} - 1 = 0$, mẫu số cũng bằng 0; vậy chúng ta lại gặp dạng $0/0$.


* Lần này chúng ta không thể dễ dàng phân tích tử số thành nhân tử, vì vậy chúng ta nhân cả tử và mẫu với biểu thức liên hợp của tử số, tức là $(\sqrt{x + 1} + 1)$.


* Ở tử số: $(\sqrt{x + 1} - 1)(\sqrt{x + 1} + 1) = (x + 1) - 1 = x$.


* Ở mẫu số, chúng ta có $x(\sqrt{x + 1} + 1)$.


* Bây giờ biểu thức trở thành $\frac{x}{x(\sqrt{x + 1} + 1)}$. Nhân tử $x$ đã xuất hiện ở cả tử lẫn mẫu và chúng ta có thể rút gọn nó.


* Phần còn lại là $\frac{1}{\sqrt{x + 1} + 1}$. Thay $x = 0$, mẫu số trở thành $\sqrt{1} + 1 = 2$; vậy giới hạn bằng $1/2$.



Bạn có thể thấy, nhân liên hợp thực chất là một cách khéo léo để làm lộ ra nhân tử chung đang bị che giấu bên trong dấu căn. Sau khi nhân tử đó lộ diện, chúng ta xử lý giống hệt như cách thứ nhất.

---

Bây giờ chúng ta chuyển sang dạng vô định thứ hai: **$\infty/\infty$**. Dạng này thường xuất hiện khi $x$ tiến ra vô cùng và cả tử lẫn mẫu đều lớn dần không giới hạn. Lý do dạng này vô định thì cũng giống như dạng $0/0$: đó là cuộc so tốc độ. Lần này câu hỏi là: đại lượng nào lớn lên nhanh hơn?

Chúng ta xét ví dụ sau: Giới hạn của $\frac{3x^2 + 2x}{x^2 - 5}$ khi $x$ tiến ra vô cùng. Khi $x$ rất lớn, cả tử và mẫu đều rất lớn. Để xử lý, chúng ta dùng một kỹ thuật quen thuộc là chia cả tử và mẫu cho lũy thừa bậc cao nhất của $x$ ở mẫu số; trong trường hợp này đó là $x^2$.

* Sau khi chia, tử số trở thành $3 + \frac{2}{x}$.


* Mẫu số trở thành $1 - \frac{5}{x^2}$.


* Khi $x$ tiến ra vô cùng, $\frac{2}{x}$ tiến về 0 và $\frac{5}{x^2}$ cũng tiến về 0. Vậy tử số tiến về 3, mẫu số tiến về 1, và giới hạn bằng 3.



Kỹ thuật này cho chúng ta một cái nhìn rất rõ: khi $x$ đủ lớn, các số hạng bậc thấp gần như không còn ý nghĩa, chỉ có số hạng bậc cao nhất mới thực sự quyết định hành vi của biểu thức. Từ đó, chúng ta có một quy tắc tiện lợi cho phân thức gồm hai đa thức khi $x$ tiến ra vô cùng:

* Nếu bậc của tử bằng bậc của mẫu, giới hạn bằng tỉ số giữa hai hệ số của số hạng bậc cao nhất. (Ví dụ vừa rồi có hệ số 3 ở tử và 1 ở mẫu nên kết quả bằng 3).


* Nếu bậc của tử nhỏ hơn bậc của mẫu, mẫu số lớn lên nhanh hơn và giới hạn bằng 0. (Ví dụ: $\frac{2x + 1}{x^2 + 1}$ sẽ tiến về 0).


* Nếu bậc của tử lớn hơn bậc của mẫu, tử số lớn lên nhanh hơn và biểu thức tiến ra vô cùng với dấu phụ thuộc vào hệ số của các số hạng bậc cao nhất. (Ví dụ: $\frac{x^3}{x^2 + 1}$ sẽ tiến ra dương vô cùng).



Bạn có thể thấy, dạng $\infty/\infty$ và dạng $0/0$ thực chất có quan hệ rất gần gũi. Nếu bạn lấy nghịch đảo của cả tử và mẫu, một biểu thức dạng $\infty/\infty$ sẽ biến thành dạng $0/0$ và ngược lại. Đây là một nhận xét đơn giản nhưng nó sẽ giúp ích cho chúng ta ở phần tiếp theo.

---

Các kỹ thuật vừa rồi đều dựa trên biến đổi đại số. Chúng rất hiệu quả với đa thức và căn thức. Tuy nhiên, khi biểu thức chứa logarit, hàm mũ hay kết hợp nhiều loại hàm khác nhau, việc biến đổi đại số có thể trở nên rất khó. Trong những trường hợp như vậy, chúng ta có một công cụ mạnh hơn, đó là **quy tắc L'Hôpital**.

Quy tắc này phát biểu như sau: Giả sử $f$ và $g$ là hai hàm khả vi gần điểm $a$, đạo hàm của $g$ khác 0 ở gần $a$, và tỉ số $f/g$ có dạng $0/0$ hoặc $\infty/\infty$ khi $x$ tiến tới $a$. Nếu giới hạn của $f'/g'$ tồn tại hoặc bằng vô cùng thì giới hạn của $f/g$ cũng bằng đúng giá trị đó. Nói một cách đơn giản, thay vì so sánh trực tiếp hai hàm, chúng ta so sánh tốc độ thay đổi của chúng. Điều này rất hợp lý với những gì chúng ta đã nói từ đầu video: dạng vô định về bản chất là một cuộc so tốc độ, và đạo hàm chính là công cụ đo tốc độ.

Mình muốn nhấn mạnh một điểm mà nhiều bạn dễ nhầm lẫn: chúng ta lấy đạo hàm của tử số và đạo hàm của mẫu số một cách riêng biệt, chúng ta không áp dụng quy tắc đạo hàm của một thương ở đây.

Chúng ta cùng làm ví dụ đầu tiên: Hãy tính giới hạn của $\frac{\ln(x)}{x}$ khi $x$ tiến ra vô cùng.

* Cả $\ln(x)$ và $x$ đều tiến ra vô cùng nên đây là dạng $\infty/\infty$.


* Đạo hàm của $\ln(x)$ là $1/x$, đạo hàm của $x$ là 1.


* Vậy chúng ta xét giới hạn của $\frac{1/x}{1}$, tức là $1/x$. Khi $x$ tiến ra vô cùng, $1/x$ tiến về 0; vậy giới hạn ban đầu bằng 0.


* Kết quả này cho chúng ta biết một điều thú vị: hàm logarit tuy vẫn tăng ra vô cùng nhưng nó tăng chậm hơn rất nhiều so với hàm $x$.



Ví dụ thứ hai là giới hạn của $\frac{x^2}{e^x}$ khi $x$ tiến ra vô cùng. Đây cũng là dạng $\infty/\infty$.

* Áp dụng quy tắc L'Hôpital một lần, chúng ta được $\frac{2x}{e^x}$.


* Biểu thức này vẫn là dạng $\infty/\infty$ nên chúng ta áp dụng thêm một lần nữa và được $\frac{2}{e^x}$.


* Lúc này tử số là hằng số 2, còn mẫu số tiến ra vô cùng nên giới hạn bằng 0.


* Qua ví dụ này, chúng ta thấy quy tắc L'Hôpital có thể được áp dụng nhiều lần liên tiếp, miễn là mỗi lần áp dụng biểu thức vẫn còn ở dạng vô định. Kết quả cũng cho thấy hàm mũ tăng nhanh hơn bất kỳ đa thức nào.



Quy tắc L'Hôpital rất mạnh, nhưng bạn cần sử dụng nó một cách cẩn thận. Mình xin chia sẻ một vài lưu ý:

1. **Luôn kiểm tra dạng vô định trước khi áp dụng:** Nếu biểu thức không có dạng $0/0$ hoặc $\infty/\infty$, quy tắc này sẽ cho ra kết quả sai. Ví dụ: giới hạn của $\frac{x + 1}{x + 2}$ khi $x$ tiến tới 0 bằng $1/2$ vì chúng ta chỉ cần thay trực tiếp. Nếu chúng ta áp dụng L'Hôpital một cách máy móc, chúng ta sẽ được $1/1 = 1$, đây là một kết quả sai.


2. **Quy tắc L'Hôpital có thể không đưa ra được kết luận nào ngay cả khi giới hạn ban đầu vẫn tồn tại:** Chúng ta xét giới hạn của $\frac{x + \sin(x)}{x}$ khi $x$ tiến ra vô cùng; đây là dạng $\infty/\infty$. Nếu áp dụng L'Hôpital, chúng ta được $\frac{1 + \cos(x)}{1}$. Biểu thức $1 + \cos(x)$ dao động liên tục giữa 0 và 2 nên nó không có giới hạn. Tuy nhiên điều đó không có nghĩa là giới hạn ban đầu không tồn tại. Quy tắc chỉ nói rằng nếu giới hạn của tỉ số các đạo hàm tồn tại thì giới hạn ban đầu cũng tồn tại; khi tỉ số các đạo hàm không có giới hạn, quy tắc đơn giản là không đưa ra kết luận nào. Với ví dụ này, chúng ta có thể tách biểu thức thành $1 + \frac{\sin(x)}{x}$. Vì $\sin(x)$ luôn nằm giữa $-1$ và $1$, còn $x$ tiến ra vô cùng nên $\frac{\sin(x)}{x}$ tiến về 0; vậy giới hạn ban đầu bằng 1.


3. **Đôi khi các phương pháp đại số lại nhanh và gọn hơn:** Với phân thức hai đa thức, việc chia cho lũy thừa bậc cao nhất thường cho kết quả ngay, trong khi áp dụng L'Hôpital có thể phải lấy đạo hàm nhiều lần. Vì vậy, chúng ta nên xem L'Hôpital chỉ là một trong nhiều công cụ chứ chưa hẳn là lựa chọn đầu tiên cho mọi bài toán.



---

Ngoài $0/0$ và $\infty/\infty$, giải tích còn có một số dạng vô định khác, bao gồm: $0 \cdot \infty$, $\infty - \infty$, $1^\infty$, $0^0$ và $\infty^0$. Tin vui là tất cả các dạng này đều có thể biến đổi về một trong hai dạng mà chúng ta đã học.

Chúng ta bắt đầu với **dạng $0 \cdot \infty$**:

* Ví dụ: Hãy tính giới hạn của $x \cdot \ln(x)$ khi $x$ tiến tới 0 từ phía dương. Khi đó $x$ tiến về 0, còn $\ln(x)$ tiến về $-\infty$.


* Để xử lý, chúng ta viết lại tích này thành một thương: $\frac{\ln(x)}{1/x}$. Lúc này biểu thức có dạng $\infty/\infty$.


* Áp dụng quy tắc L'Hôpital: tử số có đạo hàm là $1/x$, mẫu số có đạo hàm là $-1/x^2$.


* Tỉ số của chúng bằng $-x$, và $-x$ tiến về 0; vậy giới hạn bằng 0.



Tiếp theo là **dạng $\infty - \infty$**:

* Ví dụ: Hãy tính giới hạn của $\sqrt{x^2 + x} - x$ khi $x$ tiến ra vô cùng. Cả hai số hạng đều tiến ra vô cùng nên chúng ta chưa biết hiệu của chúng sẽ ra sao.


* Ở đây, chúng ta dùng lại kỹ thuật nhân liên hợp. Sau khi nhân và chia cho $(\sqrt{x^2 + x} + x)$, tử số trở thành $(x^2 + x) - x^2 = x$.


* Biểu thức trở thành $\frac{x}{\sqrt{x^2 + x} + x}$; đây là dạng $\infty/\infty$.


* Chia cả tử và mẫu cho $x$, chúng ta được $\frac{1}{\sqrt{1 + 1/x} + 1}$. Khi $x$ tiến ra vô cùng, biểu thức này tiến về $1/2$.



Cuối cùng là **các dạng lũy thừa như $1^\infty$**:

* Ví dụ nổi tiếng nhất là giới hạn của $\left(1 + \frac{1}{x}\right)^x$ khi $x$ tiến ra vô cùng. Cơ số tiến về 1, còn số mũ tiến ra vô cùng. Một số rất gần 1 nhưng lại được nâng lên lũy thừa ngày càng lớn nên chúng ta chưa biết kết quả sẽ ra sao.


* Chúng ta có thể dùng mẹo sau: gọi giới hạn cần tìm là $L$, rồi lấy logarit tự nhiên. Logarit sẽ đưa số mũ xuống thành một phép nhân nên:



$$\ln(L) = \lim_{x \to \infty} \left[ x \cdot \ln\left(1 + \frac{1}{x}\right) \right]$$





* Biểu thức này có dạng $\infty \cdot 0$. Theo cách vừa học, chúng ta viết lại tích này thành thương:



$$\frac{\ln(1 + 1/x)}{1/x}$$



Lúc này cả tử và mẫu đều tiến về 0 nên đây là dạng $0/0$.


* Áp dụng quy tắc L'Hôpital:
* Đạo hàm của tử là: $\frac{-1/x^2}{1 + 1/x}$


* Đạo hàm của mẫu là: $-1/x^2$




* Rút gọn, chúng ta được $\frac{1}{1 + 1/x}$ và biểu thức này tiến về 1.


* Vậy $\ln(L) = 1$, nghĩa là $L = e^1$, tức là số $e$ (xấp xỉ 2,718). Điều thú vị là chỉ từ một dạng vô định, chúng ta đã đi đến số $e$ – một trong những hằng số quan trọng nhất của toán học.



---

Trước khi kết thúc video, mình xin tóm tắt lại những ý chính để các bạn dễ ghi nhớ:

* Dạng vô định xuất hiện khi việc thay giá trị trực tiếp cho ra những biểu thức như $0/0$ hay $\infty/\infty$. Chúng được gọi là "vô định" vì hình thức bên ngoài không đủ để kết luận. Kết quả thực sự phụ thuộc vào việc tử số và mẫu số thay đổi nhanh hay chậm hơn nhau.


* Để xử lý dạng $0/0$, chúng ta có thể phân tích thành nhân tử hoặc nhân với biểu thức liên hợp.


* Để xử lý dạng $\infty/\infty$, chúng ta thường chia cho lũy thừa bậc cao nhất để thấy số hạng nào thực sự chi phối.


* Khi các phép biến đổi đại số trở nên phức tạp, quy tắc L'Hôpital cho phép chúng ta so sánh tốc độ thay đổi thông qua đạo hàm.


* Còn với những dạng vô định khác, chúng ta biến đổi chúng về một trong hai dạng cơ bản này.



Dạng vô định thực chất là một cuộc so tốc độ. Mỗi khi bạn gặp một dạng vô định, bạn hãy nhớ rằng có hai đại lượng đang chạy đua, và nhiệm vụ của chúng ta là tìm ra đại lượng nào chạy nhanh hơn. Mọi kỹ thuật chúng ta vừa học – từ rút gọn nhân tử cho đến quy tắc L'Hôpital – đều chỉ là những cách khác nhau để quan sát cuộc đua đó cho rõ hơn.

Cảm ơn bạn đã dành thời gian theo dõi đến cuối video. Hẹn gặp lại bạn trong video sau!
