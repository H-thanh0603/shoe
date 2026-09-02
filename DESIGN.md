# DESIGN.md

# 👟 FOOTWEAR E-COMMERCE — DESIGN SYSTEM & CREATIVE DIRECTION

> **Design comes first.**
>
> Đây không phải một website e-commerce thông thường.
>
> Mục tiêu là tạo ra một **digital footwear experience** có khả năng khiến người dùng dừng lại, tò mò, khám phá và muốn mua sản phẩm.

---

# 01 — CORE DESIGN PHILOSOPHY

## Primary Goal

Website phải đạt được 5 cảm giác:

1. **WOW**
2. **Curiosity**
3. **Desire**
4. **Premium**
5. **Memorable**

Người dùng không nên cảm thấy:

> "Đây là một shop bán giày."

Mà phải cảm thấy:

> "Đây là một thương hiệu thời trang / sneaker brand có website cực kỳ đặc biệt."

---

# 02 — DESIGN PRIORITY

Ưu tiên theo thứ tự:

```text
VISUAL IMPACT
      ↓
BRAND IDENTITY
      ↓
PRODUCT PRESENTATION
      ↓
INTERACTION
      ↓
TYPOGRAPHY
      ↓
UX
      ↓
CONVERSION
      ↓
PERFORMANCE
```

Không được hy sinh visual identity để tạo một UI CRUD/e-commerce thông thường.

Nhưng cũng không được hy sinh usability chỉ để tạo animation.

---

# 03 — DESIGN REFERENCES

Trước khi xây dựng UI, AI phải nghiên cứu và tham khảo các nguồn thiết kế hiện đại.

Không copy trực tiếp.

Mục tiêu là:

> Study → Extract principles → Reinterpret → Create original design.

---

# 04 — COMPONENT / UI REFERENCES

## 4.1 21st.dev

Ưu tiên tham khảo:

- Animated Hero
- Hero sections
- Navigation
- Cards
- Product grids
- Gallery
- 3D sections
- Marquee
- Text animations
- Background effects
- Buttons
- Hover interactions
- Footer
- Bento layouts

21st.dev hiện cung cấp một registry lớn gồm React components, screens và themes, với nhiều component được xây dựng theo React/Tailwind/shadcn conventions.

Website:

https://21st.dev

Khi cần một component đẹp:

1. Search component.
2. Preview.
3. Phân tích animation.
4. Phân tích layout.
5. Kiểm tra license.
6. Nếu phù hợp thì sử dụng/copy source.
7. Adapt vào design system của website.

Không được ghép nguyên xi nhiều component có aesthetic khác nhau.

---

# 05 — SHADCN/UI

Sử dụng shadcn/ui làm nền tảng cho các primitive cần tính nhất quán.

Có thể tham khảo:

- Button
- Dialog
- Drawer
- Sheet
- Command
- Tabs
- Accordion
- Carousel
- Navigation
- Tooltip
- Select
- Input
- Skeleton
- Toast
- Data display

shadcn/ui cung cấp nhiều primitive/component có thể lấy source và tùy biến sâu thay vì bị khóa vào một visual style cố định.

Website:

https://ui.shadcn.com

### IMPORTANT

Không được để website cuối cùng trông giống:

> "shadcn demo website."

shadcn chỉ là **foundation**.

Visual identity phải được xây dựng riêng.

---

# 06 — ACETERNITY UI

Tham khảo cho:

- Animated Hero
- Background effects
- Spotlight
- Text reveal
- Card effects
- Hover effects
- Infinite scrolling
- Parallax
- Glowing effects
- 3D interactions

Aceternity phù hợp cho các khu vực cần cinematic/visual impact mạnh.

Website:

https://ui.aceternity.com

### RULE

Không biến toàn bộ website thành Aceternity showcase.

Chỉ sử dụng animation mạnh tại những điểm quan trọng.

---

# 07 — OTHER SOURCES TO RESEARCH

AI có thể chủ động nghiên cứu:

- Magic UI
- React Bits
- Motion Primitives
- Origin UI
- Kokonut UI
- ReUI
- Tailark
- Shadcn Blocks
- Base UI
- Geist
- Radix UI
- Framer Motion examples
- GSAP examples
- Three.js examples

Các registry như 21st.dev hiện cũng tổng hợp nhiều hệ component khác nhau, giúp tìm inspiration thay vì phụ thuộc vào một thư viện duy nhất.

---

# 08 — INSPIRATION SOURCES

Tham khảo:

- Awwwards
- CSS Design Awards
- Godly
- Lapa Ninja
- Land-book
- Dribbble
- Behance
- Mobbin
- SiteInspire

Đặc biệt nghiên cứu:

- fashion websites
- sneaker websites
- luxury brands
- sports brands
- automotive websites
- technology brands

Không chỉ nghiên cứu website bán giày.

---

# 09 — BRAND POSITIONING

Website phải nằm giữa:

```text
SPORT
   +
STREETWEAR
   +
FASHION
   +
TECHNOLOGY
```

Không quá:

- corporate
- generic
- childish
- gaming
- luxury cliché

---

# 10 — VISUAL DIRECTION

Phong cách chính:

## FUTURISTIC STREETWEAR

Keywords:

```text
Bold
Experimental
Editorial
Dynamic
Premium
Urban
Athletic
Digital
Minimal
Unexpected
```

---

# 11 — COLOR SYSTEM

Không sử dụng quá nhiều màu.

Base:

```text
BLACK
OFF-WHITE
CHARCOAL
```

Accent:

Chọn **một màu signature**.

Ví dụ:

```text
Electric Red
Cyber Lime
Cobalt Blue
Acid Orange
Hyper Violet
```

Không sử dụng tất cả cùng lúc.

---

# 12 — COLOR PHILOSOPHY

80%

Neutral.

15%

Secondary neutral.

5%

Accent.

Accent chỉ dùng để:

- CTA
- hover
- active state
- important information
- product highlight
- interaction

---

# 13 — TYPOGRAPHY

Typography phải là một phần của artwork.

Sử dụng:

## Display Font

Cho:

- Hero
- Section title
- Campaign
- Collection

## Sans-serif

Cho:

- product
- navigation
- price
- metadata

---

# 14 — TYPOGRAPHY RULE

Không dùng quá nhiều font.

Tối đa:

```text
1 Display Font
+
1 UI Font
```

Hero typography có thể cực lớn.

Ví dụ:

```text
MOVE
DIFFERENT.
```

hoặc:

```text
BUILT
TO
MOVE.
```

---

# 15 — OVERSIZED TYPOGRAPHY

Sử dụng typography lớn hơn bình thường.

Ví dụ:

```text
font-size:
clamp(64px, 12vw, 220px)
```

Nhưng phải đảm bảo:

- responsive
- không overflow
- không che content
- accessibility

---

# 16 — HERO SECTION

Hero là **quan trọng nhất**.

Không được thiết kế hero theo kiểu:

```text
[Image]

Title
Description
Button
```

Đó là template.

---

# 17 — HERO CONCEPT

Hero nên có:

```text
MASSIVE TYPOGRAPHY
        +
HERO SHOE
        +
MOTION
        +
NEGATIVE SPACE
        +
STRONG CTA
```

Ví dụ:

```text
          RUN

     [ GIÀY 3D ]

          WILD
```

hoặc:

```text
NOT
JUST
A
SHOE.
```

Product nằm xuyên qua typography.

---

# 18 — HERO PRODUCT

Sản phẩm phải là **visual protagonist**.

Không để sản phẩm quá nhỏ.

Hero shoe có thể:

- floating
- rotate
- parallax
- scale
- move theo cursor
- reveal khi scroll

---

# 19 — HERO INTERACTION

Desktop:

Cursor interaction.

Mouse movement:

```text
X → rotateY
Y → rotateX
```

Nhưng movement phải subtle.

Không gây chóng mặt.

---

# 20 — HERO SCROLL STORY

Khi scroll:

### Stage 1

Product xuất hiện.

### Stage 2

Product zoom.

### Stage 3

Typography chuyển vị trí.

### Stage 4

Product chuyển sang collection.

### Stage 5

CTA xuất hiện.

Tạo cảm giác:

> Website đang kể một câu chuyện.

---

# 21 — NAVIGATION

Header phải tối giản.

Ví dụ:

```text
LOGO

SHOP
NEW
COLLECTIONS
MEN
WOMEN

                    SEARCH
                    BAG
```

Không nhồi quá nhiều menu.

---

# 22 — FLOATING NAVBAR

Có thể dùng:

```text
position: fixed
```

với:

- blur
- transparency
- subtle border

Khi scroll:

Header shrink.

---

# 23 — MENU INTERACTION

Hover SHOP:

mega menu mở.

Có:

- categories
- collections
- visual thumbnails

Menu không chỉ là text list.

---

# 24 — PRODUCT DISCOVERY

Không tạo:

```text
□ □ □ □
□ □ □ □
□ □ □ □
```

đơn điệu.

---

# 25 — EDITORIAL PRODUCT GRID

Sử dụng asymmetric layout.

Ví dụ:

```text
┌────────────────┐ ┌───────┐
│                │ │       │
│   PRODUCT A    │ │   B   │
│                │ │       │
│                │ └───────┘
│                │ ┌───────┐
│                │ │   C   │
└────────────────┘ └───────┘
```

hoặc:

```text
A        B

     C

D        E
```

---

# 26 — PRODUCT CARD

Product card phải tối giản.

Thông tin:

```text
IMAGE

BRAND
PRODUCT NAME
PRICE

COLOR DOTS
```

Không nhồi quá nhiều text.

---

# 27 — PRODUCT HOVER

Hover:

- image swap
- zoom
- color change
- quick add
- product information reveal

Animation khoảng:

```text
200–500ms
```

---

# 28 — PRODUCT IMAGE

Product image là yếu tố quan trọng nhất.

Ưu tiên:

- high resolution
- transparent background nếu phù hợp
- studio photography
- consistent lighting
- consistent scale

---

# 29 — PRODUCT IMAGE INTERACTION

Có thể:

- drag
- rotate
- zoom
- hover reveal

Nhưng chỉ khi thực sự giúp người dùng hiểu sản phẩm.

---

# 30 — COLLECTION SECTION

Mỗi collection phải giống một campaign.

Không chỉ:

```text
Collection name
Product grid
```

Mà:

```text
Visual
+
Typography
+
Motion
+
Story
+
Products
```

---

# 31 — COLLECTION EXAMPLES

### STREET FUTURE

Dark.

Metallic.

Urban.

### NIGHT RUNNER

Black.

Neon accent.

Motion blur.

### RAW MOTION

Minimal.

White.

Editorial.

### CITY HEAT

Concrete.

Red accent.

High energy.

---

# 32 — MARQUEE

Sử dụng horizontal marquee.

Ví dụ:

```text
MOVE DIFFERENT — MOVE DIFFERENT — MOVE DIFFERENT
```

Có thể dùng:

- infinite scroll
- velocity interaction
- hover pause

---

# 33 — SCROLL VELOCITY

Một số section có thể phản ứng theo tốc độ scroll.

Ví dụ:

Text chạy nhanh hơn khi scroll nhanh.

Nhưng:

Không được áp dụng toàn website.

---

# 34 — PARALLAX

Dùng parallax cho:

- hero
- campaign image
- collection
- editorial sections

Không dùng cho:

- checkout
- forms
- important UI

---

# 35 — PRODUCT STORY

Product Detail không nên là:

```text
Image | Info
```

đơn giản.

Thay vào đó:

```text
PRODUCT
↓
STORY
↓
MATERIAL
↓
DETAIL
↓
TECHNOLOGY
↓
FIT
↓
REVIEWS
```

---

# 36 — PRODUCT DETAIL HERO

Fullscreen.

Tên sản phẩm cực lớn.

Ví dụ:

```text
AIR
VECTOR
01
```

Giày nằm phía dưới.

Price và CTA floating.

---

# 37 — PRODUCT DETAIL GALLERY

Sử dụng:

- fullscreen image
- horizontal gallery
- sticky image
- scroll reveal

Có thể kết hợp:

```text
01 / 05
```

---

# 38 — SIZE SELECTOR

Size selector phải đẹp và dễ sử dụng.

Ví dụ:

```text
36  37  38  39  40

41  42  43  44  45
```

Selected:

Accent border/background.

Unavailable:

disabled.

---

# 39 — ADD TO CART

CTA phải cực kỳ rõ.

Không dùng nút nhỏ.

Ví dụ:

```text
┌───────────────────────────┐
│       ADD TO BAG   →      │
└───────────────────────────┘
```

---

# 40 — CART ANIMATION

Khi add:

Product thumbnail:

```text
product → cart
```

Cart count:

```text
0 → 1
```

Có micro-animation.

Không block interaction.

---

# 41 — QUICK VIEW

Hover hoặc button:

Quick View.

Mở:

Drawer / Modal.

Không reload page.

---

# 42 — SEARCH EXPERIENCE

Search phải có cảm giác như một **command interface**.

Click Search:

Toàn màn hình mở overlay.

Ví dụ:

```text
WHAT ARE YOU LOOKING FOR?

[ white sneakers________ ]

TRENDING

Air
Runner
Street
Limited
```

---

# 43 — SEARCH RESULTS

Realtime:

```text
PRODUCTS
COLLECTIONS
BRANDS
```

Không chỉ trả về text.

---

# 44 — "DISCOVER YOUR STYLE"

Tạo một interactive experience.

Question:

```text
WHAT MOVES YOU?
```

Options:

```text
RUN
STREET
COURT
DAILY
NIGHT
```

Sau đó UI chuyển đổi.

---

# 45 — INTERACTIVE SHOE FINDER

Có thể sử dụng:

```text
STEP 01

WHAT DO YOU DO?

RUNNING
STREET
GYM
BASKETBALL
CASUAL
```

Sau đó:

```text
STEP 02

WHAT'S YOUR STYLE?

MINIMAL
BOLD
RETRO
FUTURE
```

Cuối cùng:

```text
YOUR MATCH

[PRODUCT]

92% MATCH
```

---

# 46 — SOCIAL PROOF

Không dùng testimonial section nhàm chán.

Tạo:

## WORN IN THE WILD

Masonry gallery.

Ảnh người dùng mang giày.

Hover:

Tên sản phẩm.

---

# 47 — REVIEW DESIGN

Review nên giống social content.

Ví dụ:

```text
★★★★★

"Feels ridiculously light."

@username

VERIFIED PURCHASE
```

---

# 48 — LIMITED DROP

Tạo cảm giác event.

Ví dụ:

```text
DROP 004

ONLY
120
PAIRS
```

Countdown.

Large typography.

Product animation.

---

# 49 — COUNTDOWN

Countdown phải rõ ràng.

Không dùng quá nhiều glow.

Có thể:

```text
12
:
48
:
03
```

Typography monospaced.

---

# 50 — MICRO INTERACTIONS

Mọi interaction quan trọng đều nên có feedback.

Ví dụ:

Button hover:

```text
arrow moves →
```

Wishlist:

```text
♡ → ♥
```

Cart:

```text
badge bounce
```

Search:

```text
overlay reveal
```

Image:

```text
scale 1 → 1.04
```

---

# 51 — MAGNETIC BUTTON

CTA quan trọng có thể sử dụng magnetic interaction.

Ví dụ:

Cursor tiến gần:

Button di chuyển nhẹ về phía cursor.

Biên độ:

```text
5–12px
```

Không quá mạnh.

---

# 52 — CURSOR

Desktop:

Custom cursor.

Các state:

```text
DEFAULT
VIEW
DRAG
OPEN
```

Mobile:

Disable.

---

# 53 — 3D

Có thể sử dụng:

- Three.js
- React Three Fiber

cho:

- hero shoe
- product viewer
- interactive object

Nhưng chỉ sử dụng khi asset 3D thực sự tốt.

Không tạo 3D chỉ vì "có thể".

---

# 54 — PERFORMANCE RULE FOR 3D

3D phải:

- lazy load
- dynamic import
- mobile fallback
- reduced-motion fallback

Nếu thiết bị yếu:

Hiển thị static image.

---

# 55 — BACKGROUND

Không dùng background gradient everywhere.

Có thể dùng:

- solid
- subtle grain
- noise
- grid
- radial light
- image
- video

Background phải phục vụ content.

---

# 56 — GRAIN / NOISE

Có thể sử dụng subtle film grain.

Opacity rất thấp.

Mục tiêu:

Tạo cảm giác editorial.

Không làm text khó đọc.

---

# 57 — GRID SYSTEM

Website nên sử dụng grid rõ ràng.

Desktop:

12 columns.

Mobile:

4 columns.

Spacing:

8px base system.

---

# 58 — NEGATIVE SPACE

Không cố lấp đầy màn hình.

Whitespace là một phần của design.

Đặc biệt:

- hero
- product showcase
- editorial section

---

# 59 — ASYMMETRY

Có thể cố tình phá grid.

Ví dụ:

Product lệch khỏi center.

Typography vượt grid.

Image overlap.

CTA floating.

Nhưng visual hierarchy vẫn phải rõ.

---

# 60 — EDITORIAL DESIGN

Website phải có cảm giác giống:

```text
FASHION MAGAZINE
+
DIGITAL PRODUCT EXPERIENCE
+
E-COMMERCE
```

---

# 61 — SECTION TRANSITIONS

Không để các section nối với nhau một cách cứng.

Có thể dùng:

- overlapping image
- color transition
- typography transition
- horizontal scroll
- clip-path
- reveal

---

# 62 — PAGE TRANSITIONS

Khi chuyển page:

Không cần animation quá dài.

Khoảng:

```text
300–600ms
```

Mục tiêu:

smooth.

Không gây chậm.

---

# 63 — MOTION LANGUAGE

Toàn website phải có một motion language thống nhất.

Ví dụ:

### Fast

Buttons.

### Medium

Cards.

### Slow

Hero.

### Cinematic

Campaign.

Không random animation.

---

# 64 — MOTION EASING

Ưu tiên easing tự nhiên.

Ví dụ:

```text
ease-out
ease-in-out
spring
```

Không dùng linear cho mọi thứ.

---

# 65 — REDUCED MOTION

Bắt buộc hỗ trợ:

```css
prefers-reduced-motion
```

Nếu người dùng bật reduced motion:

- disable parallax
- disable cursor
- disable excessive movement
- reduce transitions

---

# 66 — RESPONSIVE CREATIVE DESIGN

Mobile không phải:

> Desktop thu nhỏ.

Mobile phải có composition riêng.

---

# 67 — MOBILE HERO

Mobile:

- typography lớn
- product center
- CTA rõ
- ít animation
- không overflow

---

# 68 — MOBILE NAVIGATION

Có thể sử dụng:

Bottom navigation:

```text
HOME
SHOP
SEARCH
WISHLIST
BAG
```

Hoặc floating menu.

---

# 69 — MOBILE PRODUCT

Swipe.

Touch.

Large images.

Sticky:

```text
ADD TO BAG
```

---

# 70 — DESIGN SYSTEM

Tạo các design tokens:

```text
colors
typography
spacing
radius
shadow
motion
breakpoints
```

Không hard-code từng page.

---

# 71 — BORDER RADIUS

Không bo tròn mọi thứ.

Có thể:

- product image: 0–16px
- card: 0–20px
- buttons: pill hoặc 8–12px
- modal: 16–24px

Tùy visual direction.

---

# 72 — SHADOW

Không lạm dụng shadow.

Ưu tiên:

- contrast
- spacing
- border
- background

thay vì shadow nặng.

---

# 73 — GLASSMORPHISM

Chỉ dùng ở:

- navbar
- overlay
- floating UI

Không biến mọi card thành glass.

---

# 74 — PRODUCT BADGES

Không spam badge.

Chỉ:

```text
NEW
LIMITED
BESTSELLER
SALE
```

---

# 75 — SALE DESIGN

Sale phải premium.

Không:

```text
🔥🔥🔥 SUPER SALE 70% OFF 🔥🔥🔥
```

Thay vào đó:

```text
LAST DROP

-30%
```

---

# 76 — VISUAL HIERARCHY

Mỗi section phải có:

### Primary

Điều người dùng cần nhìn đầu tiên.

### Secondary

Thông tin bổ trợ.

### Tertiary

Metadata.

Không để mọi thứ cùng kích thước.

---

# 77 — DESIGN DON'TS

Tuyệt đối tránh:

- generic Bootstrap layout
- generic Shopify clone
- excessive cards
- excessive gradients
- excessive shadows
- excessive rounded corners
- rainbow colors
- excessive glassmorphism
- animation everywhere
- giant loading screens
- unnecessary 3D
- tiny CTA
- cluttered navigation

---

# 78 — DO NOT COPY

Không sao chép:

- Nike website
- Adidas website
- Apple website
- Awwwards website
- component library demo

Hãy:

```text
REFERENCE
↓
ANALYZE
↓
ABSTRACT
↓
COMBINE
↓
CREATE ORIGINAL
```

---

# 79 — COMPONENT REUSE STRATEGY

Khi cần component:

### Step 1

Search existing components.

### Step 2

Xem:

- 21st.dev
- shadcn/ui
- Aceternity UI
- Magic UI
- React Bits
- Motion Primitives
- Origin UI
- ReUI

### Step 3

Chọn component phù hợp.

### Step 4

Adapt:

- colors
- typography
- spacing
- border
- motion
- radius

### Step 5

Integrate.

---

# 80 — COMPONENT SELECTION RULE

Không chọn component chỉ vì:

> "Nó đẹp."

Phải hỏi:

1. Có phù hợp brand không?
2. Có phù hợp UX không?
3. Có performance tốt không?
4. Có responsive không?
5. Có accessibility không?
6. Có thể customize không?
7. License có phù hợp không?

---

# 81 — COMPONENT LIBRARY POLICY

Ưu tiên component source code mà project có thể sở hữu và chỉnh sửa.

Không tạo dependency vào một UI library chỉ vì một animation duy nhất.

---

# 82 — DESIGN AUDIT

Sau khi làm xong mỗi page:

AI phải tự hỏi:

### First impression

"5 giây đầu tiên có ấn tượng không?"

### Brand

"Có cảm giác đây là cùng một thương hiệu không?"

### Hierarchy

"Mắt người dùng nhìn vào đâu trước?"

### Interaction

"Hover/scroll có thú vị không?"

### Conversion

"Người dùng có biết phải làm gì tiếp theo không?"

---

# 83 — VISUAL QA

Phải kiểm tra:

```text
360px
390px
430px
768px
1024px
1280px
1440px
1920px
```

---

# 84 — BROWSER QA

Kiểm tra:

- Chrome
- Edge
- Safari
- Firefox

---

# 85 — PERFORMANCE QA

Kiểm tra:

- LCP
- CLS
- INP
- bundle size
- image size
- animation FPS

Animation đẹp nhưng làm:

```text
FPS < 50
```

→ phải tối ưu.

---

# 86 — DESIGN QUALITY GATE

Không được coi UI hoàn thành nếu:

- hero generic
- product grid generic
- typography yếu
- navigation nhàm chán
- animation rời rạc
- mobile xấu
- spacing không nhất quán
- component mỗi nơi một style

---

# 87 — FINAL CREATIVE REVIEW

Sau khi hoàn thành:

Hãy đứng ở góc nhìn một người dùng mới.

Mở homepage.

Không đọc code.

Không biết architecture.

Chỉ nhìn UI.

Đánh giá:

```text
WOW FACTOR       /10
BRAND IDENTITY   /10
VISUAL QUALITY   /10
CREATIVITY       /10
PRODUCT APPEAL   /10
UX               /10
MOBILE           /10
MOTION           /10
```

Nếu tổng điểm < 85:

**Tiếp tục redesign.**

---

# 88 — MOST IMPORTANT RULE

> **DO NOT BUILD A NORMAL E-COMMERCE WEBSITE.**

Website phải có cảm giác:

```text
Nike campaign
+
Apple-level product presentation
+
Awwwards-style interaction
+
Modern fashion editorial
+
Real e-commerce UX
```

Nhưng phải tạo ra:

> **một design identity hoàn toàn riêng.**

---

# 89 — IMPLEMENTATION ORDER

Không bắt đầu bằng Product Card.

Thứ tự:

```text
01
BRAND IDENTITY

02
DESIGN TOKENS

03
TYPOGRAPHY

04
COLOR SYSTEM

05
NAVIGATION

06
HERO

07
MOTION SYSTEM

08
PRODUCT PRESENTATION

09
COLLECTIONS

10
SHOP

11
PRODUCT DETAIL

12
CART

13
CHECKOUT

14
MOBILE

15
MICRO INTERACTIONS

16
PERFORMANCE

17
ACCESSIBILITY

18
FINAL VISUAL QA
```

---

# 90 — FINAL DIRECTIVE

Trước khi viết code frontend:

**Hãy nghiên cứu các component/library/reference nói trên.**

Không cần sử dụng tất cả.

Chọn những thứ tốt nhất.

Sau đó tạo:

```text
DESIGN DIRECTION
+
DESIGN TOKENS
+
COMPONENT MAP
+
PAGE COMPOSITION
+
MOTION SYSTEM
```

rồi mới implement.

Nếu một component có sẵn đẹp hơn component tự viết:

> **Ưu tiên nghiên cứu và tái sử dụng/adapt component có sẵn**, miễn là license và kiến trúc cho phép.

Nếu nhiều component đẹp nhưng khác phong cách:

> **Không ghép tất cả lại.**

Hãy biến chúng thành **một hệ thống thiết kế thống nhất**.

---

# 91 — THE FINAL TEST

Hãy tưởng tượng người dùng mở website lần đầu.

Sau 3 giây họ phải nghĩ:

> **"Ồ..."**

Sau 10 giây:

> **"Để xem tiếp."**

Sau 30 giây:

> **"Đôi này đẹp."**

Sau đó:

> **"Mình muốn mua."**

Đó là mục tiêu của toàn bộ DESIGN SYSTEM này.