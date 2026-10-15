// Public ES-module adapters for the editor booted by index.html.
function master(){
  if(!globalThis.ZorifiMasterApp)throw new Error('Wait for the Zorifi editor to finish loading before using the studio API.');
  return globalThis.ZorifiMasterApp;
}
export class ZorifiAIProviderGateway {
  generateAIResponse(service,payload,options){return master().aiGateway.generateAIResponse(service,payload,options);}
}
export class ZorifiVanessaStudioDirector {
  // The existing director reads the live project and preserves its consent flow.
  processUserPrompt(prompt){return master().consultVanessa(prompt);}
}
export const ZorifiScenePlanner=globalThis.ZorifiScenePlanner;
