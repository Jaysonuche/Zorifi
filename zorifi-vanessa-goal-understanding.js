(function(root,factory){
  const commonJs=typeof window==='undefined'&&typeof module==='object'&&module.exports&&typeof require==='function';
  const api=factory(commonJs?require('./zorifi-vanessa-intent.js'):root.ZorifiVanessaIntent,commonJs?require('./zorifi-vanessa-task-continuity.js'):root.ZorifiVanessaTaskContinuity);
  if(commonJs)module.exports=api;else root.ZorifiVanessaGoalUnderstanding=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Intent,Continuity){
  'use strict';
  if(!Intent||!Continuity)throw new Error('Goal understanding requires Vanessa Intent and Task Continuity.');

  const STATUS=Object.freeze({NONE:'NONE',UNDERSTOOD:'UNDERSTOOD',NEEDS_CLARIFICATION:'NEEDS_CLARIFICATION',UNSUPPORTED:'UNSUPPORTED',STALE:'STALE'});
  const CONFIDENCE=Object.freeze({HIGH:'HIGH',MEDIUM:'MEDIUM',LOW:'LOW'});
  const CATEGORY=Object.freeze({VISUAL_STYLE:'VISUAL_STYLE',PACING:'PACING',ENERGY:'ENERGY',MOOD:'MOOD',EMPHASIS:'EMPHASIS',READABILITY:'READABILITY',AUDIO_BALANCE:'AUDIO_BALANCE',TRANSITION_FEEL:'TRANSITION_FEEL',TIMING:'TIMING',CINEMATIC_TREATMENT:'CINEMATIC_TREATMENT',SOCIAL_FORMATTING:'SOCIAL_FORMATTING',STORYTELLING:'STORYTELLING',VISUAL_CONSISTENCY:'VISUAL_CONSISTENCY',TEXT_PRESENTATION:'TEXT_PRESENTATION',CAPTION_PRESENTATION:'CAPTION_PRESENTATION'});
  const LIMITS=Object.freeze({history:8,strategies:5,text:500,requirements:10});
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const clean=(value,max=LIMITS.text)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,max);
  const unique=items=>[...new Set(items.filter(Boolean))];
  const now=()=>new Date().toISOString();

  const CATEGORY_RULES=Object.freeze([
    [CATEGORY.CINEMATIC_TREATMENT,/\b(?:cinematic|film(?:ic|[- ]?like)?|movie[- ]?like)\b/i],
    [CATEGORY.CAPTION_PRESENTATION,/\b(?:captions?|subtitles?)\b.*\b(?:stand out|style|readable|clear|bold|presentation|look)\b|\b(?:style|improve|fix|make)\b.*\b(?:captions?|subtitles?)\b/i],
    [CATEGORY.TEXT_PRESENTATION,/\b(?:title|text|typography|font)\b.*\b(?:stand out|style|readable|clear|bold|presentation|look|better)\b|\b(?:style|improve|fix|make)\b.*\b(?:title|text|typography)\b/i],
    [CATEGORY.TRANSITION_FEEL,/\btransitions?\b|\b(?:smoother|seamless)\b.*\b(?:cut|change)\b/i],
    [CATEGORY.AUDIO_BALANCE,/\b(?:audio|music|voice|dialogue|sound)\b.*\b(?:balance|balanced|clearer|quieter|louder|overpower|mix)\b|\b(?:balance|mix)\b.*\b(?:audio|music|voice|dialogue|sound)\b/i],
    [CATEGORY.SOCIAL_FORMATTING,/\b(?:tiktok|reels?|shorts?|instagram|youtube|social|vertical|square|9:16|1:1)\b/i],
    [CATEGORY.STORYTELLING,/\b(?:story|storytelling|narrative|hook|beginning|ending|payoff)\b/i],
    [CATEGORY.VISUAL_CONSISTENCY,/\b(?:consistent|consistency|match the look|same look|cohesive)\b/i],
    [CATEGORY.READABILITY,/\b(?:readable|legible|easier to read|clearer text|stand out)\b/i],
    [CATEGORY.PACING,/\b(?:pacing|pace|faster|slower|speed|speed up|slow down|dragging|too long)\b/i],
    [CATEGORY.ENERGY,/\b(?:energetic|energy|punchy|hit harder|more impact|dynamic|exciting)\b/i],
    [CATEGORY.MOOD,/\b(?:emotional|dramatic|calm|tense|uplifting|warm|dark|moody|fun|serious)\b/i],
    [CATEGORY.EMPHASIS,/\b(?:emphasis|emphasize|highlight|focus attention|draw attention|important moment)\b/i],
    [CATEGORY.TIMING,/\b(?:timing|on beat|beat sync|sync(?:ed)? to|rhythm)\b/i],
    [CATEGORY.VISUAL_STYLE,/\b(?:professional|polished|clean|stylish|visual style|look better|aesthetic)\b/i]
  ]);
  const EXPLANATION=/^(?:what(?:'s| is| are)|how (?:does|do|can)|why|explain|tell me about|define)\b/i;
  const PREFERENCE=/^(?:i (?:like|love|prefer|enjoy)|my favorite|i(?:'m| am) into)\b/i;
  const ACTION=/\b(?:make|improve|change|edit|adjust|fix|turn|give|add|apply|style|format|balance|smooth|polish|enhance|help me (?:make|edit|improve)|i want (?:this|that|the|my|it))\b/i;
  const REVISION=/^(?:actually|no[,.]?|instead|rather|wait|also|and|but|keep|don['’]?t|do not|make it|make that)\b/i;
  const VAGUE=/\b(?:make it better|improve it|fix it|make this good|make it pop|do something creative)\b/i;

  const STRATEGIES=Object.freeze({
    [CATEGORY.CINEMATIC_TREATMENT]:[
      {id:'cinematic-colour',label:'Refine the colour treatment for a more cinematic visual tone.',capability:'colour'},
      {id:'cinematic-framing',label:'Review framing and crop consistency.',capability:'transform'},
      {id:'cinematic-motion',label:'Use restrained supported motion where it strengthens the shot.',capability:'keyframes'}
    ],
    [CATEGORY.VISUAL_STYLE]:[{id:'visual-colour',label:'Refine colour and tonal balance.',capability:'colour'},{id:'visual-consistency',label:'Align the supported visual treatment across the target.',capability:'filters'}],
    [CATEGORY.PACING]:[{id:'pacing-trim',label:'Review trims and clip timing.',capability:'trim'},{id:'pacing-speed',label:'Adjust supported playback speed only where needed.',capability:'speed'}],
    [CATEGORY.ENERGY]:[{id:'energy-cuts',label:'Tighten supported cuts and timing.',capability:'trim'},{id:'energy-motion',label:'Use supported motion and emphasis selectively.',capability:'keyframes'},{id:'energy-audio',label:'Review audio emphasis without overpowering dialogue.',capability:'audio'}],
    [CATEGORY.MOOD]:[{id:'mood-colour',label:'Shape the supported colour treatment toward the requested mood.',capability:'colour'},{id:'mood-audio',label:'Review the audio balance for the requested mood.',capability:'audio'}],
    [CATEGORY.EMPHASIS]:[{id:'emphasis-motion',label:'Use supported scale, position or opacity animation to guide attention.',capability:'keyframes'},{id:'emphasis-timing',label:'Refine timing around the important moment.',capability:'trim'}],
    [CATEGORY.READABILITY]:[{id:'readability-style',label:'Improve text contrast, sizing and placement.',capability:'text'}],
    [CATEGORY.AUDIO_BALANCE]:[{id:'audio-mix',label:'Balance clip, music and voice levels with supported audio controls.',capability:'audio'}],
    [CATEGORY.TRANSITION_FEEL]:[{id:'transition-refine',label:'Review transition choice and duration.',capability:'transitions'}],
    [CATEGORY.TIMING]:[{id:'timing-cuts',label:'Align supported cuts more closely with the intended rhythm.',capability:'trim'},{id:'timing-beats',label:'Use available beat timing as a guide.',capability:'beats'}],
    [CATEGORY.SOCIAL_FORMATTING]:[{id:'social-frame',label:'Use the supported project aspect ratio for the target platform.',capability:'aspectRatio'},{id:'social-safe-area',label:'Review text and caption placement for the target frame.',capability:'text'}],
    [CATEGORY.STORYTELLING]:[{id:'story-structure',label:'Review the supported clip order and timing around the hook and payoff.',capability:'timeline'}],
    [CATEGORY.VISUAL_CONSISTENCY]:[{id:'consistent-colour',label:'Align supported colour and filter treatment across the selected scope.',capability:'colour'}],
    [CATEGORY.TEXT_PRESENTATION]:[{id:'text-presentation',label:'Refine supported text styling, placement and animation.',capability:'text'}],
    [CATEGORY.CAPTION_PRESENTATION]:[{id:'caption-presentation',label:'Refine supported caption styling and placement.',capability:'captions'}]
  });
  const DEFAULT_CAPABILITIES=Object.freeze({colour:true,transform:true,keyframes:true,filters:true,trim:true,speed:true,audio:true,text:true,transitions:true,beats:true,aspectRatio:true,timeline:true,captions:true});

  function categoriesFor(text){return unique(CATEGORY_RULES.filter(([,rule])=>rule.test(text)).map(([category])=>category));}
  function targetFor(text,options={}){
    const explicit=[[/\bintro(?:duction)?\b/i,'intro'],[/\b(?:outro|ending)\b/i,'outro'],[/\b(?:captions?|subtitles?)\b/i,'captions'],[/\b(?:title|text)\b/i,'text'],[/\btransitions?\b/i,'transition'],[/\b(?:music|soundtrack|audio|voice|dialogue)\b/i,'audio'],[/\b(?:whole|entire) (?:video|project|edit)\b|\b(?:video|project) overall\b/i,'project'],[/\b(?:selected|this|that) (?:clip|image|video|layer)\b/i,'selected clip']].find(([rule])=>rule.test(text));
    if(explicit)return {kind:explicit[1],explicit:true,id:explicit[1]==='selected clip'?(options.targetId||''):''};
    if(options.continuity?.status===Continuity.RESOLUTION.RESOLVED)return {kind:options.continuity.targetRole||'selected clip',explicit:false,id:options.continuity.targetId||'',grounded:true};
    if(options.editorContext?.selectedClipId)return {kind:'selected clip',explicit:false,id:clean(options.editorContext.selectedClipId,120)};
    return {kind:'project',explicit:false,id:''};
  }
  function requirementsFor(text){
    const explicit=[];
    if(/\b(?:keep|preserve|don['’]?t change|do not change)\b.*\b(?:speed|pacing|pace|timing)\b|\bkeep (?:the )?original pacing\b/i.test(text))explicit.push({id:'preserve-pacing',type:'constraint',value:'Preserve the current pacing and speed.'});
    if(/\b(?:keep|preserve|don['’]?t change|do not change)\b.*\b(?:audio|music|sound|voice)\b/i.test(text))explicit.push({id:'preserve-audio',type:'constraint',value:'Preserve the current audio treatment.'});
    if(/\b(?:only|just)\b.*\b(?:intro|outro|ending|captions?|text|transition|audio|music)\b/i.test(text)){const match=text.match(/\b(intro|outro|ending|captions?|text|transition|audio|music)\b/i);if(match)explicit.push({id:'scope-only',type:'scope',value:`Limit the change to ${match[1].toLowerCase()}.`});}
    return explicit.slice(0,LIMITS.requirements);
  }
  function strategiesFor(categories,capabilities=DEFAULT_CAPABILITIES,requirements=[]){
    const preservePacing=requirements.some(item=>item.id==='preserve-pacing'),preserveAudio=requirements.some(item=>item.id==='preserve-audio'),available=[],unavailable=[];
    for(const item of categories.flatMap(category=>STRATEGIES[category]||[])){
      if((preservePacing&&['trim','speed','beats'].includes(item.capability))||(preserveAudio&&item.capability==='audio'))continue;
      const strategy={...item,available:capabilities[item.capability]!==false};
      (strategy.available?available:unavailable).push(strategy);
    }
    return {available:[...new Map(available.map(item=>[item.id,item])).values()].slice(0,LIMITS.strategies),unavailable:[...new Map(unavailable.map(item=>[item.id,item])).values()].slice(0,LIMITS.strategies)};
  }
  function actionable(text,hasActive=false){if(!text||EXPLANATION.test(text)||PREFERENCE.test(text))return false;return ACTION.test(text)||(hasActive&&REVISION.test(text));}
  function desiredOutcome(text,categories){
    if(VAGUE.test(text))return 'Improve the edit in a way that fits the user’s intent.';
    const phrase=clean(text.replace(/^(?:please\s+)?(?:can you\s+|could you\s+|i want you to\s+|help me\s+)?/i,''),220);
    return phrase||`Refine ${categories.map(item=>item.toLowerCase().replace(/_/g,' ')).join(' and ')}.`;
  }
  function clarificationFor(goal){
    if(!goal.categories.length||VAGUE.test(goal.source))return 'What should feel better—its pacing, visual style, audio balance, text, or storytelling?';
    if(goal.categories.includes(CATEGORY.ENERGY)&&!goal.target.explicit)return 'Should the extra energy come mainly from tighter pacing, stronger motion, audio emphasis, or a combination?';
    if(goal.categories.includes(CATEGORY.MOOD)&&!goal.target.explicit)return 'Which part should carry that mood, and should it come mainly from colour, timing, audio, or a combination?';
    if(!goal.target.explicit&&!goal.target.grounded&&!goal.target.id)return `Should I apply that ${goal.categories[0].toLowerCase().replace(/_/g,' ')} direction to the whole project or a specific clip or section?`;
    return 'Which result matters most here, and what part of the edit should I change?';
  }
  function explain(goal){
    const target=goal.target.kind==='project'?'the project':goal.target.kind;
    if(goal.status===STATUS.NEEDS_CLARIFICATION)return goal.clarification;
    if(goal.status===STATUS.UNSUPPORTED)return `I understand the direction for ${target}, but none of the required editing capabilities are available in this version. I have not changed the project.`;
    const directions=goal.categories.map(item=>item.toLowerCase().replace(/_/g,' ')).join(', ');
    return `I understand: refine ${target} toward ${directions}. I’ve kept your stated constraints and prepared only strategies Zorifi can support. No edit has been applied yet.`;
  }
  function understandGoal(message,options={}){
    const source=clean(message),hasActive=Boolean(options.activeGoal);
    if(options.continuity&&[Continuity.RESOLUTION.STALE,Continuity.RESOLUTION.AMBIGUOUS].includes(options.continuity.status))return {status:STATUS.STALE,mutates:false,source,message:clean(options.continuity.message)||'I need you to identify the current target again.'};
    if(!actionable(source,hasActive))return {status:STATUS.NONE,mutates:false,source};
    let categories=categoriesFor(source);const revision=hasActive&&REVISION.test(source),additive=/^(?:also|and)\b/i.test(source),constraintOnly=/^(?:(?:but|and)\s+)?(?:keep|preserve|don['’]?t change|do not change)\b/i.test(source);
    if(revision&&options.activeGoal){if(!categories.length||constraintOnly)categories=clone(options.activeGoal.categories||[]);else if(additive)categories=unique([...(options.activeGoal.categories||[]),...categories]);}
    const target=targetFor(source,{...options,targetId:options.continuity?.targetId||options.editorContext?.selectedClipId});
    let explicitRequirements=requirementsFor(source);
    if(revision&&options.activeGoal)explicitRequirements=unique([...(options.activeGoal.explicitRequirements||[]).map(item=>JSON.stringify(item)),...explicitRequirements.map(item=>JSON.stringify(item))]).map(item=>JSON.parse(item));
    const inferredRequirements=[];
    if(categories.includes(CATEGORY.READABILITY))inferredRequirements.push({id:'maintain-legibility',type:'quality',value:'Keep the affected text legible in the current frame.'});
    if(categories.includes(CATEGORY.AUDIO_BALANCE))inferredRequirements.push({id:'avoid-clipping',type:'quality',value:'Avoid clipping while balancing available audio.'});
    const capabilitySet={...DEFAULT_CAPABILITIES,...(options.capabilities||{})},strategies=strategiesFor(categories,capabilitySet,explicitRequirements);
    const vague=VAGUE.test(source)||!categories.length,ambiguousDirection=categories.includes(CATEGORY.ENERGY)&&/\bhit harder\b/i.test(source)&&!target.explicit;
    let confidence=vague?CONFIDENCE.LOW:(target.explicit||target.grounded)?CONFIDENCE.HIGH:CONFIDENCE.MEDIUM;
    if(ambiguousDirection)confidence=CONFIDENCE.LOW;
    let status=confidence===CONFIDENCE.LOW?STATUS.NEEDS_CLARIFICATION:STATUS.UNDERSTOOD;
    if(categories.length&&strategies.available.length===0&&strategies.unavailable.length)status=STATUS.UNSUPPORTED;
    const goal={id:options.activeGoal?.id||`goal-${Date.now().toString(36)}`,revision:Number(options.activeGoal?.revision||0)+(revision?1:0),status,confidence,mutates:false,executable:false,source,target,desiredOutcome:desiredOutcome(source,categories),scope:explicitRequirements.find(item=>item.id==='scope-only')?.value||target.kind,categories,explicitRequirements:explicitRequirements.slice(0,LIMITS.requirements),inferredRequirements:inferredRequirements.slice(0,LIMITS.requirements),ambiguities:[],unresolved:[],candidateStrategies:strategies.available,unavailableStrategies:strategies.unavailable,createdAt:options.activeGoal?.createdAt||now(),updatedAt:now()};
    if(vague)goal.ambiguities.push('The desired improvement is not specific enough to choose a safe editing direction.');
    if(ambiguousDirection)goal.ambiguities.push('“Hit harder” could refer to pacing, motion, audio or several of them.');
    if(!target.explicit&&!target.grounded&&!target.id)goal.unresolved.push('target scope');
    if(status===STATUS.NEEDS_CLARIFICATION)goal.clarification=clarificationFor(goal);
    goal.userExplanation=explain(goal);return goal;
  }
  function orchestrationHandoff(goal,{selectedStrategyIds=[]}={}){
    if(!goal||goal.status!==STATUS.UNDERSTOOD)return {ready:false,mutates:false,reason:'The editing goal still needs clarification or is unavailable.'};
    const selected=(selectedStrategyIds.length?goal.candidateStrategies.filter(item=>selectedStrategyIds.includes(item.id)):goal.candidateStrategies).slice(0,LIMITS.strategies);
    if(!selected.length)return {ready:false,mutates:false,reason:'No supported strategy has been selected.'};
    return {ready:true,mutates:false,requiresConfirmation:true,goalId:goal.id,target:clone(goal.target),desiredOutcome:goal.desiredOutcome,explicitRequirements:clone(goal.explicitRequirements),strategies:selected.map(item=>({id:item.id,description:item.label,capability:item.capability})),commandText:`Refine ${goal.target.kind} toward ${goal.categories.map(item=>item.toLowerCase().replace(/_/g,' ')).join(' and ')} while respecting: ${goal.explicitRequirements.map(item=>item.value).join('; ')||'the current project constraints'}.`};
  }

  class GoalUnderstandingManager{
    constructor({userId='guest',capabilities={}}={}){this.userId=clean(userId,100)||'guest';this.capabilities={...DEFAULT_CAPABILITIES,...capabilities};this.active=null;this.history=[];}
    understand(message,options={}){
      const result=understandGoal(message,{...options,activeGoal:this.active,capabilities:{...this.capabilities,...(options.capabilities||{})}});
      if([STATUS.UNDERSTOOD,STATUS.NEEDS_CLARIFICATION,STATUS.UNSUPPORTED].includes(result.status)){
        if(this.active&&this.active.id!==result.id)this.history.push(this.active);
        this.active=clone(result);this.history=this.history.slice(-LIMITS.history);
      }
      return clone(result);
    }
    handoff(options={}){return orchestrationHandoff(this.active,options);}
    inspect(){return {userId:this.userId,active:clone(this.active),history:this.history.map(clone),capabilities:clone(this.capabilities)};}
    clear(){this.active=null;this.history=[];}
  }

  return {STATUS,CONFIDENCE,CATEGORY,LIMITS,DEFAULT_CAPABILITIES,GoalUnderstandingManager,understandGoal,orchestrationHandoff,categoriesFor,strategiesFor};
});
