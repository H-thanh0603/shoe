// Haptic feedback (Vibration API) — mobile-only, mọi lỗi nuốt im lặng.
// pattern: ms hoặc mảng [rung, nghỉ, rung...] — vd [15, 40, 15] = "bíp bíp".
export function haptic(pattern = 10) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // trình duyệt không hỗ trợ / bị chặn — bỏ qua
  }
}