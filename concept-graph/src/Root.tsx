import { lazy, Suspense, useEffect, useState } from 'react'
import App from './App'
import { learningSession } from './assistant/context-store'
import { createHttpRecordClient, createMockRecordClient } from './record/client'
import type { AdjustOptions, RecordRoute, RecordScene } from './record/view-props'
import { parseRoute, routeHash } from './shell/routes'
import TodayView from './views/today/TodayView'
import LibraryView from './views/library/LibraryView'
import PanoramaView from './views/panorama/PanoramaView'
import AdjustLayer from './views/layers/AdjustLayer'
import ViewsPreview from './views/dev/ViewsPreview'
const StarDive = lazy(() => import('./star-dive/StarDive'))
const GlobalAssistant = lazy(() => import('./assistant/ui/GlobalAssistant'))
const client = new URLSearchParams(location.search).get('record')==='mock' ? createMockRecordClient() : createHttpRecordClient()
const navigate = (route: RecordRoute) => {location.hash = routeHash(route)}
const openAdjust = (opts: AdjustOptions = {}) => {const [path,query='']=location.hash.split('?'); const q=new URLSearchParams(query);q.set('sheet','adjust');for(const [k,v] of Object.entries(opts))if(v)q.set(k,v);location.hash=path+'?'+q}
const reportScene = (scene: RecordScene) => learningSession.updateRecord(scene)
export default function Root() {
 const [route,setRoute]=useState(()=>parseRoute(location.hash))
 useEffect(()=>{const change=()=>setRoute(parseRoute(location.hash));addEventListener('hashchange',change);return()=>removeEventListener('hashchange',change)},[])
 useEffect(()=>{if(route.view!=='star-dive')learningSession.updateScene({view:route.view==='dev'?'none':route.view,topic:null,concept:null,card:null,interaction:null,layer:route.adjust?'adjust':route.view==='today'?route.layer??null:null})},[route])
 const props={client,route:route as RecordRoute,navigate,openAdjust,reportScene}
 return <>
 {route.view==='graph'?<App/>:route.view==='dev'?<ViewsPreview/>:route.view==='today'?<TodayView {...props}/>:route.view==='library'?<LibraryView {...props}/>:route.view==='panorama'?<PanoramaView {...props}/>:<Suspense fallback={<p>正在加载星图…</p>}><StarDive initialFocus={route.conceptId??(route.topicId==='cs-demo'?null:route.topicId)}/></Suspense>}
 {route.adjust&&<AdjustLayer client={client} {...route.adjust} navigate={navigate} onClose={()=>{location.hash=location.hash.replace(/([?&])(sheet|changeLogId|itemId)=[^&]*/g,'').replace(/^([^?]*)&/,'$1?')}}/>}
 <Suspense fallback={null}><GlobalAssistant/></Suspense>
 </>
}
