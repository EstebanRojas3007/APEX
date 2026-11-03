import {createContext,useCallback,useContext,useLayoutEffect,useRef,type ReactNode,type RefObject} from 'react';
import {Platform,ScrollView,View,type ViewProps} from 'react-native';

type Rect={top:number;bottom:number};
type Snapshot={view:string;id:string;top:number;scroll:number};
const Anchors=createContext<(id:string)=>(node:View|null)=>void>(()=>()=>{});
export function TeacherAnchor({id,children,...props}:ViewProps&{id:string;children:ReactNode}){
 const register=useContext(Anchors);
 return <View {...props} testID={props.testID??`teacher-anchor-${id}`} ref={register(id)} collapsable={false}>{children}</View>;
}
function bounds(node:View|ScrollView):Promise<Rect>{
 if(Platform.OS==='web'){
  const element=('getScrollableNode' in node?node.getScrollableNode():node) as unknown as HTMLElement;
  const rect=element.getBoundingClientRect();return Promise.resolve({top:rect.top,bottom:rect.bottom});
 }
 const native='getNativeScrollRef' in node?node.getNativeScrollRef():node;
 if(!native)return Promise.resolve({top:0,bottom:0});
 return new Promise(resolve=>{
  const timer=setTimeout(()=>resolve({top:0,bottom:0}),100);
  native.measureInWindow((_x:number,y:number,_width:number,height:number)=>{clearTimeout(timer);resolve({top:y,bottom:y+height});});
 });
}
export function useTeacherViewport({view,ready,scrollRef,getScrollY,scrollTo}:{view:string;ready:boolean;scrollRef:RefObject<ScrollView|null>;getScrollY:()=>number;scrollTo:(y?:number)=>void}){
 const nodes=useRef(new Map<string,View>()),callbacks=useRef(new Map<string,(node:View|null)=>void>());
 const positions=useRef(new Map<string,number>()),navigation=useRef<{view:string;y:number}|null>(null);
 const mounted=useRef(true);
 useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const correction=useRef<Snapshot|null>(null),active=useRef({view,ready,getScrollY,scrollTo});
 active.current={view,ready,getScrollY,scrollTo};
 const register=useCallback((id:string)=>{
  if(!callbacks.current.has(id))callbacks.current.set(id,node=>{if(node)nodes.current.set(id,node);else nodes.current.delete(id);});
  return callbacks.current.get(id)!;
 },[]);
 const save=()=>{if(active.current.ready)positions.current.set(active.current.view,active.current.getScrollY());};
 const reset=(keep?:string)=>{
  const retained=keep?positions.current.get(keep):undefined;
  positions.current.clear();if(keep&&retained!==undefined)positions.current.set(keep,retained);
  correction.current=null;navigation.current=null;
 };
 const navigate=(target:string)=>{correction.current=null;navigation.current={view:target,y:positions.current.get(target)??0};};
 const capture=async():Promise<Snapshot|null>=>{
  const current=active.current,scroll=scrollRef.current;
  if(!current.ready||!scroll||navigation.current)return null;
  const viewport=await bounds(scroll);
  const measured=await Promise.all([...nodes.current].map(async([id,node])=>({id,...await bounds(node)})));
  if(active.current.view!==current.view)return null;
  const visible=measured.filter(rect=>rect.bottom>viewport.top&&rect.top<viewport.bottom).sort((a,b)=>a.top-b.top);
  const focused=Platform.OS==='web'?document.activeElement:null;
  const focusAnchor=focused?visible.filter(rect=>(nodes.current.get(rect.id) as unknown as HTMLElement)?.contains(focused)).sort((a,b)=>(a.bottom-a.top)-(b.bottom-b.top))[0]:undefined;
  const anchor=focusAnchor??visible.find(rect=>rect.top>=viewport.top)??visible.at(-1);
  return anchor?{view:current.view,id:anchor.id,top:anchor.top,scroll:current.getScrollY()}:null;
 };
 const preserve=(snapshot:Snapshot|null)=>{correction.current=snapshot;};
 useLayoutEffect(()=>{
  if(!ready)return;
  const target=navigation.current;
  if(target?.view===view){
   const frame=requestAnimationFrame(()=>{
    if(navigation.current!==target||active.current.view!==view||!active.current.ready)return;
    navigation.current=null;active.current.scrollTo(target.y);
   });
   return()=>cancelAnimationFrame(frame);
  }
 });
 useLayoutEffect(()=>{
  const snapshot=correction.current;
  if(!ready||!snapshot||snapshot.view!==view)return;
  const frame=requestAnimationFrame(()=>{
   if(correction.current!==snapshot)return;correction.current=null;
   const node=nodes.current.get(snapshot.id);if(!node)return;
   void bounds(node).then(rect=>{
    const current=active.current;
    if(!mounted.current||current.view!==snapshot.view||!current.ready||navigation.current)return;
    const y=current.getScrollY();
    // Respect a user gesture, browser anchoring or natural clamping that has
    // already moved the viewport. Never keep replaying an earlier scroll value.
    if(Math.abs(y-snapshot.scroll)>2)return;
    const delta=rect.top-snapshot.top;
    if(Math.abs(delta)>1)current.scrollTo(Math.max(0,y+delta));
   });
  });
  return()=>cancelAnimationFrame(frame);
 });
 return {register,save,reset,navigate,capture,preserve,Provider:Anchors.Provider};
}
