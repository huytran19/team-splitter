# ⚔️ TEAM SPLITTER — Hextech Edition

Web chia đội ngẫu nhiên với hiệu ứng particle, animation và âm thanh epic.
Thay thế cho Wheel of Names khi cần chia 2 đội nhanh.

**👉 Dùng ngay: https://huytran19.github.io/team-splitter/**

Không cần cài gì, mở link là chạy. Gửi link này cho cả team.

## Chạy local

```bash
python3 -m http.server 5173
```

Mở http://localhost:5173

> Cần chạy qua HTTP server (không mở trực tiếp file), vì dự án dùng ES modules.

## Tính năng

| | |
|---|---|
| **2 chế độ nhập** | Số lượng (auto sinh "Người 1…N") hoặc dán danh sách tên |
| **Chia đôi** | Số lẻ → một bên nhiều hơn đúng 1 người, chọn bên nào (hoặc ngẫu nhiên) |
| **Ghép cặp cố định** | Tick để chọn 2 người **luôn cùng đội** |
| **Tách đối thủ** | Tick để chọn 2 người **luôn khác đội** |
| **Tốc độ chia** | ⚡ Nhanh (bỏ đếm ngược) · ⚔ Thường · 🎬 Từng người (thẻ tên hiện giữa màn hình rồi bay về đội) |
| **Hiệu ứng** | Particle nền, hút vào tâm, sóng xung kích, tia lửa, screen shake, flash |
| **Âm thanh** | Riser → impact → chuông từng tên → fanfare (tổng hợp bằng Web Audio, không dùng file bản quyền) |
| **Thu gọn** | Nút « (hoặc phím `H`) thu bảng thiết lập thành thanh mảnh — sàn đấu chiếm trọn màn hình khi trình chiếu |
| **Tiện ích** | Đổi bên, copy kết quả, lưu thiết lập vào localStorage |

## Phím tắt

- `Space` / `Enter` — chia đội
- `R` — chia lại
- `S` — đổi bên
- `C` — copy kết quả
- `H` — thu gọn / mở lại bảng thiết lập
- `Esc` — bỏ qua hiệu ứng (kể cả đang chia chậm: đổ hết kết quả ra ngay)

## Cấu trúc

```
index.html
css/style.css
js/
  app.js        điều phối UI + chuỗi animation
  splitter.js   thuật toán chia đội có ràng buộc
  particles.js  2 lớp canvas (nền + hiệu ứng)
  audio.js      SFX tổng hợp bằng Web Audio API
```

## Thuật toán chia có ràng buộc

1. **Union-Find** gộp các cặp "đi chung" thành nhóm dính liền.
2. Dựng đồ thị "kỵ nhau" giữa các nhóm → **tô 2 màu** (phát hiện vòng lẻ không thể thoả mãn).
3. Mỗi thành phần liên thông có 2 lựa chọn (lật màu hay không).
4. **DP subset-sum** chọn tổ hợp để sĩ số đội 1 đúng mục tiêu; truy vết ngược có random hoá
   → vẫn ngẫu nhiên thật sự chứ không ra một kết quả cố định.

Nếu ràng buộc khiến không thể chia đều tuyệt đối, app báo rõ mức lệch thay vì im lặng.

## Kiểm thử thuật toán

```bash
node test/splitter.test.mjs
```

38 assertion: sĩ số, ràng buộc cặp/kỵ nhau (1000 lần mỗi loại), phát hiện mâu thuẫn,
tính ngẫu nhiên và parse tên.

## ⚠️ Lưu ý về font

Cả 3 font đều **bắt buộc** phải có subset `vietnamese` của Google Fonts, nếu không
mọi ký tự có dấu (ĐỘI, NGƯỜI, THIẾT LẬP…) sẽ rơi xuống font fallback → chữ nhảy font.

| Vai trò | Font | Vietnamese |
|---|---|---|
| `--ff-display` | Playfair Display | ✅ |
| `--ff-tech` | Oswald | ✅ |
| `--ff-body` | Be Vietnam Pro | ✅ |

Trước khi đổi font, kiểm tra bằng:

```bash
curl -s -A "Mozilla/5.0 Chrome/125.0" \
  "https://fonts.googleapis.com/css2?family=TEN+FONT&display=swap" | grep vietnamese
```

Không ra kết quả nghĩa là font đó **không** dùng được cho tiếng Việt.
(Cinzel và Rajdhani đã bị loại vì lý do này.)

## Tâm hiệu ứng

Thẻ tên ở chế độ chia chậm, pháo hoa và sóng xung kích đều neo vào **huy hiệu VS**
— tức chính giữa hai bảng đội — chứ không phải giữa màn hình (`innerWidth / 2`).
Bảng thiết lập bên trái đẩy sàn đấu lệch sang phải tới ~208px ở màn hình 1500px,
nên dùng giữa màn hình sẽ thấy thẻ lệch hẳn sang một bên.

Hàm phụ trách: `arenaCenter()` trong [js/app.js](js/app.js).

## Cập nhật site đã host

Site chạy trên GitHub Pages, deploy thẳng từ nhánh `main` — không có build step.
Sửa file xong chỉ cần:

```bash
git add -A && git commit -m "mô tả thay đổi" && git push
```

Khoảng 1 phút sau là link công khai tự cập nhật.
