import { pngHexToDataUrl } from '../../pngHex.ts'
import hex0 from './radish-body.hex.00.ts'
import hex1 from './radish-body.hex.01.ts'
import hex2 from './radish-body.hex.02.ts'
import hex3 from './radish-body.hex.03.ts'
import hex4 from './radish-body.hex.04.ts'

export default pngHexToDataUrl([hex0, hex1, hex2, hex3, hex4].join(''))
