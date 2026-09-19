import { pngHexToDataUrl } from '../../pngHex.ts'
import hex0 from './radish-portrait.hex.00.ts'
import hex1 from './radish-portrait.hex.01.ts'
import hex2 from './radish-portrait.hex.02.ts'
import hex3 from './radish-portrait.hex.03.ts'
import hex4 from './radish-portrait.hex.04.ts'

export default pngHexToDataUrl([hex0, hex1, hex2, hex3, hex4].join(''))
