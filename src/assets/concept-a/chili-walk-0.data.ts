import { pngHexToDataUrl } from '../pngHex.ts'
import hex0 from './chili-walk-0.hex.00.ts'
import hex1 from './chili-walk-0.hex.01.ts'
import hex2 from './chili-walk-0.hex.02.ts'
import hex3 from './chili-walk-0.hex.03.ts'

export default pngHexToDataUrl([hex0, hex1, hex2, hex3].join(''))
