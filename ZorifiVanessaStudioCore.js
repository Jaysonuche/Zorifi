// Public ES-module adapters for the editor booted by index.html.
function master(){
  if(!globalThis.ZorifiMasterApp)throw new Error('Wait for the Zorifi editor to finish loading before using the studio API.');
  return globalThis.ZorifiMasterApp;
}
export class ZorifiAIProviderGateway {
  generateAIResponse(service,payload,options){return master().aiGateway.generateAIResponse(service,payload,options);}
  requestGeneration({model='lyria-3-clip-preview',payload={}}={},options){
    if(model!=='lyria-3-clip-preview')throw new Error('This adapter supports configured Lyria Clip music requests only.');
    const input=payload.parameters||payload,key=String(input.key||'D Minor').match(/^([A-G](?:#|b)?)(?:\s+(Major|Minor|Pentatonic))?$/i);
    const settings={...input,prompt:payload.prompt||input.prompt||`${input.mood||'Cinematic'} ${input.genre||'soundtrack'}`,key:key?key[1].toUpperCase():input.key,scaleMode:input.scaleMode||key?.[2]?.toLowerCase()||'minor',bpm:input.bpm||input.tempo||120,duration:input.duration||30};
    return this.generateAIResponse('vanessa-music',{action:'start',...globalThis.ZorifiMusicStudio.providerPayload(settings)},options);
  }
}
export {ZorifiVanessaStudioDirector} from './ZorifiVanessaStudioDirector.js';
export const ZorifiScenePlanner=globalThis.ZorifiScenePlanner;
