// Sent to the authenticated workflow so Gemini receives the exact output contract.
const text={type:'string'};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const refs={type:'array',minItems:1,maxItems:12,items:object({fragmentId:text,sourceId:text,page:{type:'integer',minimum:1}})};
const exercise=object({prompt:text,response:text,explanation:text});
export function outputSchema(kind:'sections'|'chat',level?:number){
 if(kind==='chat')return object({contractVersion:{type:'integer',enum:[2]},kind:{type:'string',enum:['chat']},text,references:refs});
 return object({contractVersion:{type:'integer',enum:[2]},kind:{type:'string',enum:['sections']},level:{type:'integer',enum:[level]},reason:text,agent:object({provider:text,model:text,promptVersion:text}),sections:{type:'array',minItems:7,maxItems:7,items:object({title:text,order:{type:'integer',minimum:1,maximum:7},skillId:text,objective:text,explanation:text,examples:{type:'array',minItems:1,maxItems:8,items:exercise},practice:{type:'array',minItems:1,maxItems:12,items:exercise},references:refs,reason:text,prerequisites:{type:'array',items:{type:'integer',minimum:1,maximum:6}},origin:{type:'string',enum:['original_ai_apex']}})}});
}
