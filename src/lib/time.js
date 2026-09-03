// Time context (Bước 7.4) — greeting theo giờ VN + weekend flag.
const greet = (h) => (h < 11 ? 'CHÀO BUỔI SÁNG' : h < 14 ? 'CHÀO BUỔI TRƯA' : h < 18 ? 'CHÀO BUỔI CHIỀU' : 'CHÀO BUỔI TỐI')

export function timeContext(date = new Date()) {
  return { greeting: greet(date.getHours()), weekend: [0, 6].includes(date.getDay()) }
}
