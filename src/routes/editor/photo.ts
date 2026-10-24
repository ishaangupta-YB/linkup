import { photoProblem, squareCrop } from './helpers'

export const PHOTO_SIZE = 512

/** Reads a chosen file into a square JPEG data URL, at most 512px a side, so it fits in localStorage. */
export async function readPhoto(file: File): Promise<string> {
  const problem = photoProblem(file)
  if (problem) throw new Error(problem)
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode().catch(() => {
      throw new Error('That image could not be read. Try another file.')
    })
    const { sx, sy, side, out } = squareCrop(img.naturalWidth, img.naturalHeight, PHOTO_SIZE)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser could not resize the image.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
