export type PaintStyle = 'a' | 'b' | 'c'
export type ModelDir = 'a' | 'b' | 'c'

export const PAINT_STYLES: readonly PaintStyle[] = ['a', 'b', 'c']
export const MODEL_DIRS: readonly ModelDir[] = ['a', 'b', 'c']

export const PAINT_STYLE_LABELS: Record<PaintStyle, { kicker: string; name: string; blurb: string }> = {
  a: {
    kicker: 'A',
    name: 'Wet soil',
    blurb: 'Cream paper, wet-on-wet watercolor, pigment pooling, soil-brown drips for blight.',
  },
  b: {
    kicker: 'B',
    name: 'Nightmare ink',
    blurb: 'Ink-sketch charcoal, smoke wisps, high contrast, neon lime glow in the cracks.',
  },
  c: {
    kicker: 'C',
    name: 'Ink stain',
    blurb: 'Cute graphic veggies with vertical color-matched stain blooms fading to dark puddles.',
  },
}

export const MODEL_LABELS: Record<ModelDir, { name: string; blurb: string }> = {
  a: { name: 'Wash', blurb: 'Lumpy watercolour. The usual tuber.' },
  b: { name: 'Sketch', blurb: 'Simple oval, ink face, stick arms.' },
  c: { name: 'Stain', blurb: 'Rounder, cuter, graphic fill.' },
}

const STYLE_KEY = 'bro.paintStyle'
const MODEL_KEY = 'bro.modelDir'
const DEFAULT_STYLE: PaintStyle = 'a'
const DEFAULT_MODEL: ModelDir = 'b'

function isPaintStyle(v: unknown): v is PaintStyle {
  return v === 'a' || v === 'b' || v === 'c'
}

function isModelDir(v: unknown): v is ModelDir {
  return v === 'a' || v === 'b' || v === 'c'
}

function readStored(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    /* private mode / quota */
  }
}

function loadPaintStyle(): PaintStyle {
  const v = readStored(STYLE_KEY)
  return isPaintStyle(v) ? v : DEFAULT_STYLE
}

function loadLastModel(): ModelDir {
  const v = readStored(MODEL_KEY)
  return isModelDir(v) ? v : DEFAULT_MODEL
}

let currentStyle: PaintStyle = loadPaintStyle()
let lastModel: ModelDir = loadLastModel()

export function getPaintStyle(): PaintStyle {
  return currentStyle
}

export function applyPaintStyleToDom(): void {
  if (typeof document === 'undefined') return
  const body = document.body
  if (!body) return
  body.classList.remove('paint-a', 'paint-b', 'paint-c')
  body.classList.add(`paint-${currentStyle}`)
}

export function setPaintStyle(s: PaintStyle): void {
  currentStyle = isPaintStyle(s) ? s : DEFAULT_STYLE
  writeStored(STYLE_KEY, currentStyle)
  applyPaintStyleToDom()
}

export function lookKey(): string {
  return currentStyle
}

export function getLastModel(): ModelDir {
  return lastModel
}

export function setLastModel(m: ModelDir): void {
  lastModel = isModelDir(m) ? m : DEFAULT_MODEL
  writeStored(MODEL_KEY, lastModel)
}

function bootLook(): void {
  if (typeof document === 'undefined') return
  if (document.body) {
    applyPaintStyleToDom()
    return
  }
  document.addEventListener('DOMContentLoaded', () => applyPaintStyleToDom(), { once: true })
}

bootLook()
