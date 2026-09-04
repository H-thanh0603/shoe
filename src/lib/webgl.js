// Không import three ở đây — để dynamic import() tách chunk 3D riêng.
export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch {
    return false
  }
}
