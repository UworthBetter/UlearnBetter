import type { RecordRoute, AdjustOptions } from '../record/view-props.ts'
export type ShellRoute = (RecordRoute | {view: 'graph'} | {view: 'dev'}) & {adjust?: AdjustOptions}
export function parseRoute(hash: string): ShellRoute {
 try {
 const [path,query=''] = hash.replace(/^#/, '').split('?'); const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
 const q=new URLSearchParams(query); const adjust=q.get('sheet')==='adjust'?{changeLogId:q.get('changeLogId')||undefined,itemId:q.get('itemId')||undefined}:undefined
 const [v,a,b]=parts
 if(v==='graph')return {view:'graph',adjust}
 if(v==='dev'&&a==='views')return {view:'dev',adjust}
 if(v==='library')return {view:'library',itemId:a,adjust}
 if(v==='panorama')return {view:'panorama',goalId:a,adjust}
 if(v==='star-dive')return {view:'star-dive',topicId:a||'cs-demo',conceptId:b,adjust}
 return {view:'today',layer:q.get('layer')==='stats'?'stats':null,adjust}
 } catch {return {view:'today'}}
}
export function routeHash(route: RecordRoute): string {
 if(route.view==='today')return '#/today'+(route.layer==='stats'?'?layer=stats':'')
 if(route.view==='library')return '#/library'+(route.itemId?'/'+encodeURIComponent(route.itemId):'')
 if(route.view==='panorama')return '#/panorama'+(route.goalId?'/'+encodeURIComponent(route.goalId):'')
 return '#/star-dive/'+encodeURIComponent(route.topicId)+(route.conceptId?'/'+encodeURIComponent(route.conceptId):'')
}
