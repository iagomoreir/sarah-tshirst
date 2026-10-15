import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'

export type SignaturePadHandle = { clear: () => void; isEmpty: () => boolean; toPng: () => string | null }

/** Área para desenhar a assinatura (mouse, dedo ou caneta). PNG com fundo transparente. */
export function SignaturePad({ ref }: { ref: Ref<SignaturePadHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const c = canvas.current!
    let lastWidth = 0
    const setup = () => {
      const { width, height } = c.getBoundingClientRect()
      // No celular a barra do navegador muda a altura ao rolar: só reinicia se a largura mudar
      if (width === 0 || Math.round(width) === lastWidth) return
      lastWidth = Math.round(width)
      // Redimensionar apaga o canvas: guarda o desenho e redesenha na nova escala
      let previous: HTMLCanvasElement | null = null
      if (c.width > 0) {
        previous = document.createElement('canvas')
        previous.width = c.width
        previous.height = c.height
        previous.getContext('2d')!.drawImage(c, 0, 0)
      }
      const ratio = window.devicePixelRatio || 1
      c.width = Math.round(width * ratio)
      c.height = Math.round(height * ratio)
      const ctx = c.getContext('2d')!
      ctx.scale(ratio, ratio)
      if (previous) ctx.drawImage(previous, 0, 0, width, height)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#2a211a'
    }
    setup()
    const observer = new ResizeObserver(setup)
    observer.observe(c)
    return () => observer.disconnect()
  }, [])

  function isEmpty() {
    const c = canvas.current
    if (!c || c.width === 0) return true
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return false
    return true
  }

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvas.current!
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    },
    isEmpty,
    toPng() {
      return isEmpty() ? null : canvas.current!.toDataURL('image/png')
    },
  }))

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }

  return (
    <canvas
      ref={canvas}
      className="signature-pad"
      aria-label="Zone de signature : dessinez votre signature"
      role="img"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drawing.current = true
        const ctx = e.currentTarget.getContext('2d')!
        const [x, y] = point(e)
        ctx.beginPath()
        ctx.moveTo(x, y)
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return
        const ctx = e.currentTarget.getContext('2d')!
        const [x, y] = point(e)
        ctx.lineTo(x, y)
        ctx.stroke()
      }}
      onPointerUp={() => {
        drawing.current = false
      }}
      onPointerCancel={() => {
        drawing.current = false
      }}
    />
  )
}
