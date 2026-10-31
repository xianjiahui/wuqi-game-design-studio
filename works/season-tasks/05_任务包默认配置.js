/* 固定任务包是 Demo 的独立策划配置；不改写 CFG-0.3.0 的详细自选生成空间。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DemoPackages=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='PKG-0.1.0',MAPS=['dam','valley','spacebase','bakesh','az3'],HIGH_MAPS=['bakesh','spacebase'];
 const defs={
  1:{combat:{stars:3,sequence:[['operator_kill',1],['in_raid_activity',1],['operator_kill',1],['in_raid_activity',1],['operator_kill',1]]},sweep:{stars:3,sequence:[['npc_kill',3],['successful_extraction',1],['npc_kill',4],['successful_extraction',1],['npc_kill',5]]},search:{stars:2,sequence:[['container_search',2],['carry_out',1],['container_search',3],['carry_out',1],['container_search',3]]}},
  2:{combat:{stars:4,sequence:[['operator_kill',1],['in_raid_activity',1],['operator_kill',2],['in_raid_activity',1],['operator_kill',2]]},sweep:{stars:3,sequence:[['npc_kill',4],['successful_extraction',1],['npc_kill',5],['successful_extraction',1],['successful_extraction',1]]},search:{stars:2,sequence:[['container_search',3],['carry_out',1],['container_search',3],['carry_out',1],['container_search',3]]}},
  3:{combat:{stars:5,sequence:[['operator_kill',1],['in_raid_activity',1],['operator_kill',2],['in_raid_activity',1],['operator_kill',2],['in_raid_activity',1]]},sweep:{stars:4,sequence:[['npc_kill',5],['successful_extraction',1],['npc_kill',5],['successful_extraction',1],['npc_kill',5],['successful_extraction',1]]},search:{stars:3,sequence:[['container_search',3],['carry_out',1],['container_search',4],['carry_out',1],['container_search',4],['carry_out',1]]}}
 };
 const info={
  combat:{name:'交战与行动',level:'高压',summary:'干员交战与局内行动交替推进。',mapLabel:'巴克什或航天基地',maps:HIGH_MAPS,preferences:['operator_kill','in_raid_activity']},
  sweep:{name:'扫荡与撤离',level:'中压',summary:'队伍清剿 NPC，本人完成成功撤离。',mapLabel:'五张可选地图任选',maps:MAPS,preferences:['npc_kill','successful_extraction']},
  search:{name:'搜索与带出',level:'低压',summary:'本人搜索容器并携物带出。',mapLabel:'五张可选地图任选',maps:MAPS,preferences:['container_search','carry_out']}
 };
 const starOptions={1:[2,3],2:[2,3,4],3:[3,4,5]},quantityCeiling=99;
 const goalLabels={operator_kill:'本人击败干员',in_raid_activity:'局内行动（队伍共享）',npc_kill:'击败 NPC（队伍共享）',successful_extraction:'本人成功撤离',container_search:'本人搜索容器',carry_out:'本人携物带出'};
 const clone=v=>JSON.parse(JSON.stringify(v));
 function hash(v){let n=2166136261;for(const ch of JSON.stringify(v))n=Math.imul(n^ch.charCodeAt(0),16777619)>>>0;return n.toString(16).padStart(8,'0');}
 function getDefaults(stage){if(stage===undefined)return Object.fromEntries([1,2,3].map(n=>[n,getDefaults(n)]));if(![1,2,3].includes(stage))throw new Error('任务包阶段无效。');return Object.fromEntries(['combat','sweep','search'].map(id=>[id,{stars:defs[stage][id].stars,nodes:defs[stage][id].sequence.map(([goalType,quantity])=>({goalType,quantity}))}]));}
 function goalOptions(id){if(!Object.hasOwn(info,id))throw new Error('任务包类型无效。');return info[id].preferences.map(type=>({id:type,label:goalLabels[type]}));}
 function normalizeStage(stage,packages,allowedStars=starOptions[stage]){
  if(![1,2,3].includes(stage)||!packages||typeof packages!=='object'||Array.isArray(packages)||Object.keys(packages).sort().join(',')!=='combat,search,sweep')throw new Error('任务包须完整提供本阶段三种类型。');
  const normalized={};
  for(const id of ['combat','sweep','search']){
   const row=packages[id],count=defs[stage][id].sequence.length,allowed=info[id].preferences;
   if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='nodes,stars'||!Array.isArray(row.nodes)||row.nodes.length!==count)throw new Error('任务包星数或固定节点数量无效：'+stage+'/'+id);
   if(!Array.isArray(allowedStars)||!allowedStars.includes(row.stars))throw new Error('任务包星数不在当前阶段合法星档：'+stage+'/'+id);
   const nodes=row.nodes.map((node,i)=>{
    if(!node||typeof node!=='object'||Array.isArray(node)||Object.keys(node).sort().join(',')!=='goalType,quantity'||!allowed.includes(node.goalType)||!Number.isInteger(node.quantity)||node.quantity<1||node.quantity>quantityCeiling)throw new Error('任务包节点主题或数量无效：'+stage+'/'+id+'/'+(i+1));
    return {goalType:node.goalType,quantity:node.quantity};
   });
   if(!allowed.every(type=>nodes.some(n=>n.goalType===type)))throw new Error('任务包必须同时包含两种主题目标：'+stage+'/'+id);
   normalized[id]={stars:row.stars,nodes};
  }
  if(normalized.combat.stars<normalized.sweep.stars||normalized.sweep.stars<normalized.search.stars)throw new Error('任务包星档必须保持交战与行动≥扫荡与撤离≥搜索与带出。');
  return normalized;
 }
 function definition(stage,id,plannerConfig){if(![1,2,3].includes(stage)||!Object.hasOwn(info,id)||!defs[stage][id])throw new Error('任务包阶段或类型无效。');if(plannerConfig===undefined)return {stars:defs[stage][id].stars,sequence:defs[stage][id].sequence.map(x=>x.slice())};const packages=normalizeStage(stage,plannerConfig?.stages?.[stage]?.packages),row=packages[id];return {stars:row.stars,sequence:row.nodes.map(n=>[n.goalType,n.quantity])};}
 function list(stage,plannerConfig){if(![1,2,3].includes(stage))return [];return ['combat','sweep','search'].map((id,order)=>{const d=definition(stage,id,plannerConfig),m=info[id];return {id,stage,name:m.name,stars:d.stars,level:m.level,summary:m.summary,mapLabel:m.mapLabel,mapPolicy:'any_of_allowed',allowedMapIds:m.maps.slice(),nodeCount:d.sequence.length,order:order+1,version:VERSION};});}
 function detail(kind,quantity,mapLabel){
  switch(kind){
   case 'operator_kill':return {title:'交战目标',description:'在'+mapLabel+'，本人击败敌方特战干员 '+quantity+' 名。',eventType:'operator_kill',scope:'self_only',target:'敌方特战干员',window:'CROSS_MATCH',requiresSuccessfulExtraction:false};
   case 'in_raid_activity':return {title:'局内行动',description:'在'+mapLabel+'，完成“清理区域敌人”局内行动 '+quantity+' 次；本人或队友完成均计入。',eventType:'activity_complete',scope:'team_progress',target:'清理区域敌人',window:'CROSS_MATCH',requiresSuccessfulExtraction:false};
   case 'npc_kill':return {title:'区域扫荡',description:'在任意可选地图击败 NPC '+quantity+' 名；本人或队友击败均计入。',eventType:'npc_kill',scope:'team_progress',target:'NPC',window:'CROSS_MATCH',requiresSuccessfulExtraction:false};
   case 'successful_extraction':return {title:'成功撤离',description:'在任意可选地图，本人成功撤离 '+quantity+' 次。',eventType:'holder_successful_extraction',scope:'self_only',target:'成功撤离',window:'CROSS_MATCH',requiresSuccessfulExtraction:true};
   case 'container_search':return {title:'物资搜索',description:'在任意可选地图，本人搜索容器 '+quantity+' 次。',eventType:'container_first_open',scope:'self_only',target:'容器',window:'CROSS_MATCH',requiresSuccessfulExtraction:false};
   case 'carry_out':return {title:'物资带出',description:'在任意可选地图，本人携物成功带出 '+quantity+' 件。',eventType:'holder_item_extracted',scope:'self_only',target:'物资',window:'SINGLE_MATCH',requiresSuccessfulExtraction:true};
   default:throw new Error('任务包目标类型无效。');
  }
 }
 function getConfig(stage,id,plannerConfig){
  const d=definition(stage,id,plannerConfig),m=info[id],specId=VERSION+'-P'+stage+'-'+id+'-'+hash(d);
  const nodes=d.sequence.map(([kind,quantity],i)=>{
   const no=i+1,meta=detail(kind,quantity,m.mapLabel),nodeId='N'+no,goalId='G'+no;
   const goal={goalId,goalType:kind,primaryBehaviorId:kind,title:meta.title,description:meta.description,eventType:meta.eventType,scope:meta.scope,mapId:null,mode:null,quantity,requiresSuccessfulExtraction:meta.requiresSuccessfulExtraction,targetLabel:meta.target,condition:null,locations:[],targetIds:Array.from({length:quantity},(_,j)=>specId+'-'+goalId+'-'+(j+1))};
   return {nodeId,sequence:no,title:meta.title+' · '+meta.target,themeId:kind,primaryBehaviorId:kind,window:meta.window,incompleteReset:meta.window==='SINGLE_MATCH'?'RESET_INCOMPLETE_MATCH':'KEEP_VALID_PROGRESS',objectives:[goal]};
  });
  const lineSpec={specId,instanceId:null,stage,stars:d.stars,title:'阶段'+stage+' · '+m.name,packageId:id,packageVersion:VERSION,preferenceIds:m.preferences.slice(),mapIds:[],allowedMapIds:m.maps.slice(),requiredMapIds:[],mapPolicy:'any_of_allowed',expiry:{durationDays:3,clock:'demo_simulation'},settlement:{mode:'whole_line_once',stars:d.stars,stageThreshold:{1:7,2:10,3:14}[stage]},nodes,lockedVersions:{package:VERSION,schema:'FIXED-PACKAGE-1',evaluation:'PLANNING-WU-D2-QUANTITY-R1',source:'user_confirmed_theme_star_map_scope__demo_quantity_parameters'}};
  const displayNodes=nodes.map(n=>({id:n.nodeId,title:n.title,name:n.title,themeId:n.themeId,behaviorId:n.primaryBehaviorId,objectives:n.objectives.map(g=>g.description),conditions:n.objectives.map(g=>g.description),description:n.objectives.map(g=>g.description).join('；'),constraints:[n.objectives[0].scope==='team_progress'?'本人或队友均可计入':'仅本人计入',...(n.window==='SINGLE_MATCH'?['本节点须同局完成']:[])],mapId:null,mapName:m.mapLabel,maps:[m.mapLabel],mode:null}));
  return clone({id:specId,specId,title:lineSpec.title,name:lineSpec.title,stage,stars:d.stars,nodes:displayNodes,fee:0,ttlHours:72,durationHours:72,expiry:lineSpec.expiry,mapPolicy:lineSpec.mapPolicy,allowedMapIds:m.maps.slice(),selectedMapIds:[],requiredMapIds:[],maps:[m.mapLabel],preferences:m.preferences.slice(),packageId:id,packageVersion:VERSION,plannerRecord:{lineSpec,generationRecord:{origin:'fixed_package',version:VERSION,quantityNature:'D',realDifficultyVerified:false,spatialAvoidanceVerified:false,designerConfigIndependent:true},sourceFingerprint:VERSION}});
 }
 return {version:VERSION,list,getConfig,getDefaults,goalOptions,normalizeStage,allowedMapIds:MAPS.slice(),quantityCeiling};
});
