// ES-module entry point over the same director used by the running app.
import * as runtime from './zorifi-studio-director.js';
const api=globalThis.ZorifiStudioDirector||runtime.default;
export const ZorifiVanessaStudioDirector=api.ZorifiVanessaStudioDirector;
export default ZorifiVanessaStudioDirector;
