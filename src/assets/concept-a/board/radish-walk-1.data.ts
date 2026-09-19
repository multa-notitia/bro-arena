import { pngHexToDataUrl } from '../../pngHex.ts'
import hex0 from './radish-walk-1.hex.00.ts'
import hex1 from './radish-walk-1.hex.01.ts'

export default pngHexToDataUrl([hex0, hex1].join(''))
