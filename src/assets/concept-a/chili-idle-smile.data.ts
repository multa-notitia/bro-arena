import { pngHexToDataUrl } from '../pngHex.ts'
import hex0 from './chili-idle-smile.hex.00.ts'
import hex1 from './chili-idle-smile.hex.01.ts'
import hex2 from './chili-idle-smile.hex.02.ts'
import hex3 from './chili-idle-smile.hex.03.ts'

export default pngHexToDataUrl([hex0, hex1, hex2, hex3].join(''))
