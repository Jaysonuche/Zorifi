// Public module over the same companion/director core used by the running app.
import * as runtime from './zorifi-director-engine.js';
const api=globalThis.ZorifiDirectorEngine||runtime.default;
export const ZorifiVanessaDirectorEngine=api.ZorifiVanessaDirectorEngine;
export default ZorifiVanessaDirectorEngine;
