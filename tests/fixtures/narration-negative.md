# Vì sao âm nhân âm lại thành dương

Chúng ta đều được dạy một quy tắc từ rất sớm: âm nhân âm bằng dương. Nó thường được học như một câu thần chú, kèm theo một mẹo nhỏ là "trừ của trừ thành cộng". Nhưng nếu chỉ có vậy thì quy tắc này chẳng khác gì một quy ước do ai đó đặt ra. Vậy điều gì khiến nó buộc phải đúng?

Hãy tưởng tượng chúng ta đứng trên một trục số, quay mặt về phía những số dương. Nhân với một số dương thì kéo dài bước đi theo hướng đang nhìn. Nhân với âm một thì không kéo dài gì cả, chỉ đơn giản là quay người lại. Đó là lý do ta có thể hình dung số âm như một phép đổi chiều, chứ không phải một con số kỳ lạ đứng ngoài quy luật.

Thử kiểm tra cách nhìn này. Hai nhân ba là sáu, nên hai nhân âm ba là âm sáu: ta đi ba bước về phía âm, lặp lại hai lần, và dừng ở phía âm. Giờ đổi dấu của hai: âm hai nhân âm ba. Ta vẫn đi ba bước, nhưng lần này hướng bị lật một lần, rồi bị lật thêm một lần nữa vì chính hệ số cũng âm. Hai lần lật liên tiếp đưa ta về hướng ban đầu. Kết quả là dương sáu. Cách hình dung này khớp với mọi ví dụ nhỏ ta thử, nhưng một hình ảnh khớp chưa đủ để chứng minh. Nó chỉ cho ta biết nên tin vào đâu.

Phần đại số mới là chỗ quy tắc được ép buộc. Hãy bắt đầu từ một điều hiển nhiên: ba cộng với âm ba bằng không. Nhân cả hai vế với âm hai. Vế trái vẫn bằng không. Vế phải là âm hai nhân ba, cộng với âm hai nhân âm ba. Ta biết âm hai nhân ba bằng âm sáu. Vậy âm sáu cộng với tích của âm hai và âm ba phải bằng không. Muốn vậy, tích đó chỉ có thể là dương sáu.

```text
3 + (-3) = 0
(-2) * (3 + (-3)) = 0
(-2) * 3 + (-2) * (-3) = 0
-6 + (-2) * (-3) = 0
(-2) * (-3) = 6
```

Điều đáng chú ý là ta không hề giả định trước kết quả. Ta chỉ giữ hai thứ: phép nhân phân phối được với phép cộng, và số không nhân với gì cũng bằng không. Chính hai yêu cầu đó dẫn thẳng tới kết luận. Nếu ai đó chọn âm nhân âm bằng âm, họ sẽ phải phá vỡ một trong hai điều trên, và toàn bộ số học quen thuộc sẽ rối loạn.

Có một ngộ nhận rất phổ biến ở đây. Nhiều người nói "âm nhân âm bằng dương vì trừ của trừ là cộng" và xem như đã giải thích xong. Thật ra đó chỉ là một cách ghi nhớ. Nó không nói vì sao phép đổi dấu hai lần lại quay về chỗ cũ, cũng không nói vì sao quy tắc phải tương thích với phần còn lại của số học. Một cách ghi nhớ tiện lợi không thay thế được một lý do.

Một ngộ nhận khác là nghĩ quy tắc này chỉ đúng với số nguyên. Thực ra lập luận trên chỉ dùng tính phân phối và vai trò của số không, nên nó đúng với số hữu tỉ và số thực nữa. Điều kiện duy nhất là ta đang làm việc trong một hệ số học có các phép cộng và nhân bình thường. Không có phép chia nào ở đây, nên không cần loại trừ mẫu số.

Vậy điều gì đã thay đổi sau khi đi hết đoạn đường này? Lúc đầu, quy tắc trông như một điều cần học thuộc. Bây giờ nó là hệ quả của việc giữ cho số học nhất quán. Hai lần đổi chiều đưa ta về hướng cũ, không phải vì vũ trụ thích sự đối xứng, mà vì đó là lựa chọn duy nhất để phép nhân vẫn phân phối được và số không vẫn giữ nguyên vai trò của nó. Từ đây, mỗi lần gặp một dấu trừ nhân với một dấu trừ, ta có thể nhớ tới hình ảnh hai lần quay đầu, và nhớ luôn rằng phía sau hình ảnh đó có một lập luận.
