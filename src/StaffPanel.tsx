import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Platform,Text,View,useWindowDimensions} from 'react-native';
import type {AdminAudit,AdminCatalog,AdminChange,AdminInvitation,AdminOverview,AdminPage,AdminUser} from '../shared/admin';
import type {TeacherGroup} from '../shared/teacher';
import {rpc,RequestError,dispatchTeacherInvitation} from './api';
import {AdminCatalogForms,AdminGroupEditor,AdminGroupPeople,AdminInvitationModes,AdminUserEditor,Choices,roleChoices,statusChoices} from './AdminForms';
import {Button,Card,Confirm,Field,colors,styles as s,type Confirmation} from './ui';
import type {AdminLocation} from './AdminNavigation';
import {adminTitle} from './AdminNavigation';
import {AdminWelcome,AdminUserRow,AdminStudentResults,adminDate as date} from './AdminPresentation';
import AdminSelect from './AdminSelect';
import AdminDateField from './AdminDateField';
import {associationCondition,catalogProjection,catalogReflectsChange,catalogReply,catalogSuccess,isCatalogChange,UnconfirmedCatalogReply,type CatalogFeedback} from './adminCatalog';

const auditEntities=[['','Todas las entidades'],['usuario','Cuentas'],['grupo','Salones'],['grupo_docente','Responsables de salones'],['grupo_integrante','Integrantes de salones'],['program','Programas'],['component','Componentes'],['asociacion','Asociaciones'],['invitacion','Invitaciones']] as const;
const auditActions=[['','Todas las acciones'],['cambiar_rol','Cambiar rol'],['cambiar_estado','Cambiar estado de cuenta'],['guardar_catalogo','Guardar catálogo'],['admin_association_add','Asociar componente'],['admin_association_remove','Retirar asociación'],['preparar_invitacion','Preparar invitación'],['enviar_invitacion','Enviar invitación'],['error_envio_invitacion','Error de envío'],['reenviar_invitacion','Reenviar invitación'],['cancelar_invitacion','Cancelar invitación'],['vencer_invitacion','Vencer invitación'],['aceptar_invitacion','Aceptar invitación'],['INSERT','Crear registro de salón'],['UPDATE','Actualizar registro de salón'],['DELETE','Retirar registro de salón']] as const;
function validDate(value:string){if(!value)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const candidate=new Date(`${value}T12:00:00Z`);return Number.isFinite(candidate.getTime())&&candidate.toISOString().slice(0,10)===value;}
type Data={overview?:AdminOverview;users?:AdminPage<AdminUser>;invitations?:AdminPage<AdminInvitation>;groups?:AdminPage<TeacherGroup>;group?:{group:TeacherGroup;teachers:AdminUser[];students:AdminUser[]};catalog?:AdminCatalog;audit?:AdminPage<AdminAudit>};
const invitationStatus={pending:'Pendiente de envío',processing:'En proceso',sent:'Envío aceptado por el proveedor · pendiente de aceptación',error:'Envío no confirmado',cancelled:'Cancelada',expired:'Vencida',accepted:'Aceptada'};
function Pagination({data,busy,onPage}:{data:AdminPage<unknown>;busy:boolean;onPage:(page:number)=>void}){
 return <View style={s.row}><Text style={s.muted}>{data.total} registros · Página {data.page+1}</Text><Button secondary label="Página anterior" disabled={busy||data.page===0} onPress={()=>onPage(data.page-1)}/><Button secondary label="Página siguiente" disabled={busy||(data.page+1)*data.pageSize>=data.total} onPress={()=>onPage(data.page+1)}/></View>;
}
export function StaffPanel({role,onError,location,go}:{role:string;onError:(error:unknown)=>void;location:AdminLocation;go:(next:AdminLocation)=>void}){
 const {width}=useWindowDimensions();
 const [search,setSearch]=useState(''),[roleFilter,setRoleFilter]=useState(location.tab==='usuarios'&&location.directory!=='all'?'estudiante':''),[stateFilter,setStateFilter]=useState('');
 const [page,setPage]=useState(0),[invitePage,setInvitePage]=useState(0),[revision,setRevision]=useState(0),[entity,setEntity]=useState(''),[action,setAction]=useState('');
 const [fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState('');
 const [loaded,setLoaded]=useState<{owner:string;data:Data}|null>(null),[dataKey,setDataKey]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[blocked,setBlocked]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[confirmation,setConfirmation]=useState<Confirmation|null>(null),[selectedUser,setSelectedUser]=useState<AdminUser|null>(null);
 const [operationError,setOperationError]=useState(''),[teachersOpen,setTeachersOpen]=useState(false);
 const [resultsUser,setResultsUser]=useState<AdminUser|null>(null);
 const [catalogFeedback,setCatalogFeedback]=useState<CatalogFeedback>();
 const catalogGeneration=useRef(0);
 const dateError=!validDate(fromDate)||!validDate(toDate)?'Selecciona fechas válidas.':fromDate&&toDate&&fromDate>toDate?'Desde no puede ser posterior a Hasta.':'';
 const inFlight=useRef(false),alive=useRef(true),onErrorRef=useRef(onError);onErrorRef.current=onError;
 const owner=JSON.stringify([location,search,roleFilter,stateFilter,page,invitePage,entity,action,fromDate,toDate]),requestKey=JSON.stringify([owner,revision]);
 const currentOwner=useRef(owner);currentOwner.current=owner;
 const pending=loading||dataKey!==requestKey;
 const data=loaded?.owner===owner?loaded.data:null;
 const catalogAccess=useRef({data:data?.catalog,checking:pending,error,blocked});catalogAccess.current={data:data?.catalog,checking:pending,error,blocked};
 const refresh=()=>setRevision(value=>value+1);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  const subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();}),timer=setInterval(refresh,30000);
  if(Platform.OS==='web')window.addEventListener('focus',refresh);
  return()=>{subscription.remove();clearInterval(timer);if(Platform.OS==='web')window.removeEventListener('focus',refresh);};
 },[]);

 useEffect(()=>{
  let valid=true;const generation=catalogGeneration.current;setLoading(true);setError('');setDataKey(requestKey);
  const relevant=()=>valid&&(location.tab!=='catalogo'||generation===catalogGeneration.current);
  if(location.tab==='auditoria'&&dateError){setLoading(false);return;}
  const payload={search,role:roleFilter,status:stateFilter,page,pageSize:20};
  async function read():Promise<Data>{
   if(role!=='administrador')throw new RequestError(403,'Solo administrador activo.');
   if(location.tab==='inicio')return {overview:await rpc('admin_overview')};
   if(location.tab==='usuarios')return {users:await rpc('admin_users',payload)};
   if(location.tab==='profesores'){
    const [users,invitations]=await Promise.all([rpc<AdminPage<AdminUser>>('admin_users',{...payload,role:'docente'}),rpc<AdminPage<AdminInvitation>>
        ('admin_invitations',{search,page:invitePage})]);return {users,invitations};
   }
   if(location.tab==='salones')return location.groupId?{group:await rpc('admin_group_detail',{groupId:location.groupId})}:
   {groups:await rpc('admin_groups',payload)};
   if(location.tab==='catalogo')return {catalog:catalogProjection(await rpc<AdminCatalog>('admin_catalog'))};
   return {audit:await rpc('admin_audit',{...payload,entity,action,fromDate,toDate})};
  }
  void read().then(value=>{if(relevant()){setLoaded({owner,data:value});setBlocked(false);if(value.catalog){const catalog=value.catalog;setCatalogFeedback(previous=>previous?.status==='success'&&previous.refresh!=='ready'?{...previous,refresh:catalogReflectsChange(catalog,previous.change)?'ready':'mismatch'}:previous);}}}).catch(err=>{
   if(!relevant())return;setError(err instanceof Error?err.message:'No se pudo cargar la administración.');
   if(location.tab==='catalogo')setCatalogFeedback(previous=>previous?.status==='success'&&previous.refresh!=='ready'?{...previous,refresh:'error'}:previous);
   if(err instanceof RequestError&&(err.status===401||err.status===403))
    {setLoaded(null);setSelectedUser(null);setResultsUser(null);setConfirmation(null);setBlocked(true);onErrorRef.current(err);}
  }).finally(()=>{if(relevant())setLoading(false);});
  return()=>{valid=false;};
 }
 
 
 ,[requestKey,role]);
 function denied(err:unknown){
  if(err instanceof RequestError&&(err.status===401||err.status===403)){setLoaded(null);setSelectedUser(null);setResultsUser(null);setConfirmation(null);setBlocked(true);onErrorRef.current(err);}
 }
 async function perform(change:AdminChange){
  if(inFlight.current)return;
  const catalogChange=isCatalogChange(change);
  const associationIndex=change.operation==='admin_association_remove'?catalogAccess.current.data?.associations.findIndex(item=>item.programId===change.payload.programId&&item.componentId===change.payload.componentId):undefined;
  if(catalogChange){
   const access=catalogAccess.current;
   let refusal=access.checking?'La comprobación del catálogo sigue en curso. Espera a que termine antes de confirmar.':access.error||access.blocked||!access.data?'No se pudieron comprobar los datos actuales del catálogo. Actualiza antes de confirmar.':'';
   if(!refusal&&change.operation==='admin_association_remove'){
    const association=access.data!.associations.find(item=>item.programId===change.payload.programId&&item.componentId===change.payload.componentId);
    if(!association)refusal='La asociación ya no aparece en el catálogo actual. Comprueba sus datos antes de repetir.';
    else{const condition=associationCondition(association,false,'');if(condition.state!=='allowed')refusal=condition.message;}
   }
   if(refusal){setCatalogFeedback({change,status:'error',message:refusal,associationIndex});return;}
   catalogGeneration.current++;setCatalogFeedback({change,status:'pending',message:change.operation==='admin_catalog_save'?'Guardando el catálogo…':'Procesando la asociación…',associationIndex});
  }
  inFlight.current=true;setBusy(true);setNotice('');setError('');setOperationError('');
  const origin=owner;
  try{
   if(catalogChange){
    const result=await rpc<unknown>(change.operation,change.payload),message=catalogReply(result);
    if(alive.current&&currentOwner.current===origin)setCatalogFeedback({change,status:'success',message:catalogSuccess(change,message),refresh:'checking',associationIndex});
   }else if(change.operation==='dispatch_invitation'){
    const result=await dispatchTeacherInvitation(String(change.payload.invitationId));if(alive.current&&currentOwner.current===origin)setNotice(result.message);
   }else{
    const result=await rpc<{message?:string;id?:string}>(change.operation,change.payload);
    if(change.dispatch&&result.id){
     if(!alive.current||currentOwner.current!==origin)return;
     const sent=await dispatchTeacherInvitation(result.id);if(alive.current&&currentOwner.current===origin)setNotice(sent.message);
    }else if(alive.current&&currentOwner.current===origin)setNotice(result.message??'Operación completada.');
   }
   if(alive.current&&currentOwner.current===origin){if(catalogChange)catalogGeneration.current++;setSelectedUser(null);refresh();}
  }catch(err){
   if(alive.current&&currentOwner.current===origin){
    if(catalogChange){catalogGeneration.current++;setCatalogFeedback({change,status:err instanceof UnconfirmedCatalogReply||err instanceof RequestError&&(err.status===0||err.status>=500)?'uncertain':'error',message:err instanceof Error?err.message:'No se pudo completar la operación de catálogo.',associationIndex});}
    else setOperationError(err instanceof Error?err.message:'No se pudo completar la operación.');
    denied(err);refresh();
   }
  }finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 const confirm=(change:AdminChange)=>setConfirmation({title:change.title,body:change.body,confirmLabel:'Confirmar operación',onConfirm:()=>void perform(change)});
 const filtering=location.tab!=='profesores'&&location.tab!=='inicio'&&location.tab!=='catalogo'&&!location.groupId;
 const searchChange=(value:string)=>{setSearch(value);setPage(0);setInvitePage(0);};
 return <View style={s.stack} testID="admin-panel">
  <View style={{flexDirection:width<700?'column':'row',alignItems:width<700?'stretch':'center',justifyContent:'space-between',gap:16}}><View style={{gap:4,flex:width<700?undefined:1,minWidth:0}}><Text style={s.tag}>ADMINISTRACIÓN DE APEX</Text><Text accessibilityRole="header" style={s.title}>{adminTitle(location)}</Text></View><Button secondary label={blocked?'Comprobar acceso administrativo':'Actualizar administración'} disabled={pending||busy} onPress={refresh}/></View>
  {(location.tab==='profesores'||location.tab==='salones')&&!blocked&&<><Text style={s.muted}>Gestiona profesores, invitaciones y salones. La propuesta del rol Profesor requiere la aceptación explícita del destinatario.</Text><Choices label="Gestión de asignaciones" value={location.tab} items={[["profesores","Profesores e invitaciones"],["salones","Salones"]]} onChange={tab=>go({tab})}/></>}
  {location.groupId&&!blocked&&<Button secondary label="Volver a salones" onPress={()=>go({tab:'salones'})}/>}
  {filtering&&!blocked&&<Field label="Buscar en administración" placeholder="Nombre, correo, ID o acción" value={search} onChangeText={searchChange}/>}
  {location.tab==='usuarios'&&!blocked&&<>
   <Text style={s.muted}>Busca por nombre, ID APEX o correo en todas las cuentas del filtro seleccionado.</Text>
   <Choices label="Consultar cuentas" value={roleFilter} items={[["estudiante","Estudiantes"],["docente","Profesores"],["","Todas las cuentas"]]} onChange={value=>{setRoleFilter(value);setPage(0);setSelectedUser(null);setResultsUser(null);}}/>
   <View style={s.row}><AdminSelect label="Filtrar rol" value={roleFilter} items={[["","Todos los roles"],...roleChoices]} onChange={value=>{setRoleFilter(value);setPage(0);setSelectedUser(null);setResultsUser(null);}}/><AdminSelect label="Filtrar estado" value={stateFilter} items={[["","Todos los estados"],...statusChoices]} onChange={value=>{setStateFilter(value);setPage(0);}}/></View>
  </>}
  {location.tab==='auditoria'&&!blocked&&<Card>
   <Text accessibilityRole="header" style={s.heading}>Filtros de auditoría</Text>
   <View style={s.row}><AdminSelect label="Entidad de auditoría" value={entity} items={auditEntities} onChange={value=>{setEntity(value);setPage(0);}}/><AdminSelect label="Acción de auditoría" value={action} items={auditActions} onChange={value=>{setAction(value);setPage(0);}}/></View>
   <View style={s.row}><AdminDateField label="Desde" value={fromDate} onChange={value=>{setFromDate(value);setPage(0);}}/><AdminDateField label="Hasta" value={toDate} onChange={value=>{setToDate(value);setPage(0);}}/></View>
   <Text style={s.muted}>Fechas civiles inclusivas en America/Bogota. La búsqueda admite actor, destinatario, acción o motivo.</Text>
   {!!dateError&&<Text accessibilityRole="alert" style={s.notice}>{dateError}</Text>}
   <Button secondary label="Limpiar filtros" onPress={()=>{setSearch('');setEntity('');setAction('');setFromDate('');setToDate('');setPage(0);}}/>
  </Card>}
  {pending&&!data&&<Card><ActivityIndicator color={colors.primary}/><Text accessibilityLiveRegion="polite" style={s.text}>Cargando administración…</Text></Card>}
  {!!error&&<Card><Text accessibilityRole="alert" style={s.text}>{error}</Text></Card>}
  {!!operationError&&<Text accessibilityRole="alert" style={s.notice}>{operationError}</Text>}
  {!!notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
  {busy&&<Text accessibilityLiveRegion="polite" style={s.notice}>Procesando operación…</Text>}
  <View style={[s.stack,blocked&&{display:'none'}]} accessibilityElementsHidden={blocked} importantForAccessibility={blocked?'no-hide-descendants':'auto'}>
   {data?.overview&&<AdminWelcome overview={data.overview} go={go}/>}
   {location.tab==='profesores'&&!blocked&&<Button secondary expanded={teachersOpen} label={teachersOpen?'Ocultar lista de profesores':'Desplegar lista de profesores'} onPress={()=>setTeachersOpen(value=>!value)}/>}
   {location.tab==='profesores'&&teachersOpen&&!blocked&&<Field label="Buscar profesores e invitaciones" value={search} onChangeText={searchChange}/>}
   {data?.users&&(location.tab!=='profesores'||teachersOpen)&&<>
    <Text accessibilityRole="header" style={s.heading}>{location.tab==='profesores'?'Profesores registrados':roleFilter==='estudiante'?'Estudiantes registrados':roleFilter==='docente'?'Profesores registrados':'Usuarios y roles'}</Text>
    <Text style={s.muted}>Las fechas son registros históricos; no indican presencia en línea.</Text>
    {!data.users.rows.length&&<Card><Text style={s.text}>Sin cuentas que coincidan con los filtros.</Text></Card>}
    {data.users.rows.map(user=><AdminUserRow key={user.id} user={user} busy={busy} onManage={()=>setSelectedUser(user)} onResults={()=>setResultsUser(user)}/>)}
    <Pagination data={data.users} busy={busy} onPage={setPage}/>
    {selectedUser&&<AdminUserEditor key={selectedUser.id} user={selectedUser} busy={busy} onChange={confirm} onClose={()=>setSelectedUser(null)}/>}
    {resultsUser&&<AdminStudentResults key={resultsUser.id} user={resultsUser} revision={revision} onError={denied} onClose={()=>setResultsUser(null)}/>}
   </>}
   {location.tab==='profesores'&&!blocked&&<AdminInvitationModes busy={busy} onChange={confirm} onError={denied}/>}
   {location.tab==='profesores'&&!blocked&&<Card><Text accessibilityRole="header" style={s.heading}>Transición de cuentas</Text><Text style={s.text}>Consulta una cuenta para revisar las acciones de rol y estado permitidas. Para convertir un estudiante en profesor utiliza la invitación por ID APEX.</Text><Button secondary label="Consultar todas las cuentas y roles" onPress={()=>go({tab:'usuarios',directory:'all'})}/></Card>}
   {data?.invitations&&<>
    <Text accessibilityRole="header" style={s.heading}>Invitaciones de profesores</Text>
    {data.invitations.rows.some(invite=>invite.status==='error')&&<Text style={s.notice}>Un envío no confirmado puede haber llegado. Antes de reintentar, actualiza el estado y consulta al responsable del correo para evitar duplicados. La aceptación del rol sigue siendo única.</Text>}
    {!data.invitations.rows.length&&<Card><Text style={s.text}>Sin invitaciones registradas.</Text></Card>}
    {data.invitations.rows.map(invite=><Card key={invite.id}><Text style={s.heading}>{invite.name}</Text><Text style={s.text}>{invite.email} · {invitationStatus[invite.status]}</Text><Text style={s.muted}>{invite.mode==='existing'?'Cuenta existente':'Cuenta nueva'} · Rol propuesto: Profesor · Motivo: {invite.reason}</Text><Text style={s.muted}>Creada: {date(invite.createdAt)} · Vence: {date(invite.expiresAt)}</Text>{invite.errorCode&&<Text style={s.notice}>El envío requiere revisión. Consulta la modalidad elegida y la configuración del servicio de correo. La solicitud no concede permisos.</Text>}{['pending','processing','error'].includes(invite.status)&&<Button label={`Enviar o reintentar ${invite.email}`} disabled={busy} onPress={()=>confirm({title:'Confirmar envío',body:'Se comprobarán sesión administrativa, estado y vínculo de la invitación antes de enviar.',operation:'dispatch_invitation',payload:{invitationId:invite.id}})}/>}{invite.status==='sent'&&<Button secondary label={`Reenviar invitación ${invite.email}`} disabled={busy} onPress={()=>confirm({title:'Confirmar reenvío',body:'Se reenviará el enlace a la misma identidad vinculada, sin ampliar el vencimiento ni crear otra cuenta.',operation:'admin_invite_resend',payload:{invitationId:invite.id,reason:'Reenvío explícito de invitación vigente',confirmed:true},dispatch:true})}/>}{['pending','processing','sent','error'].includes(invite.status)&&<Button secondary label={`Cancelar invitación ${invite.email}`} disabled={busy} onPress={()=>confirm({title:'Cancelar invitación',body:'El enlace no concederá acceso docente. Se conservan la solicitud y cualquier identidad pendiente como evidencia.',operation:'admin_invite_cancel',payload:{invitationId:invite.id,reason:'Cancelación explícita de invitación desde el panel administrador',confirmed:true}})}/>}</Card>)}
    <Pagination data={data.invitations} busy={busy} onPage={setInvitePage}/>
   </>}
   {data?.groups&&<>
    {!data.groups.rows.length&&<Card><Text style={s.text}>Sin salones que coincidan con la búsqueda.</Text></Card>}
    {data.groups.rows.map(group=><Card key={group.id}><Text style={s.heading}>{group.code} · {group.name}</Text><Text style={s.text}>{group.status} · Ocupación: {group.membershipCount}/20 · Elegibles: {group.activeCount}</Text><Button label={`Gestionar salón ${group.code}`} onPress={()=>go({tab:'salones',groupId:group.id})}/></Card>)}
    <Pagination data={data.groups} busy={busy} onPage={setPage}/><AdminGroupEditor busy={busy} onChange={confirm}/>
   </>}
   {data?.group&&<><Text accessibilityRole="header" style={s.heading}>{data.group.group.name} · {data.group.group.code}</Text><Text style={s.text}>Ocupación: {data.group.group.membershipCount}/20 · {data.group.group.activeCount} estudiantes elegibles</Text><AdminGroupEditor key={data.group.group.id} group={data.group.group} busy={busy} onChange={confirm}/><AdminGroupPeople groupId={data.group.group.id} teachers={data.group.teachers} students={data.group.students} busy={busy} onChange={confirm}/></>}
   {location.tab==='catalogo'&&!blocked&&<Card><Text accessibilityRole="header" style={s.heading}>Organiza la oferta académica</Text><Text style={s.text}>Crea o renombra programas y componentes conservando sus IDs. Revisa las asociaciones autorizadas y su impacto antes de proponer cambios.</Text><Text style={s.muted}>Las asociaciones conservan sus restricciones; no asignan evaluaciones ni cambian carreras automáticamente.</Text></Card>}
   {data?.catalog&&<AdminCatalogForms data={data.catalog} busy={busy} onChange={confirm} checking={pending} queryError={error} feedback={catalogFeedback} onRefresh={refresh}/>}
   {data?.audit&&<>
    {!data.audit.rows.length&&<Card><Text style={s.text}>Sin acciones que coincidan con los filtros.</Text></Card>}
    {data.audit.rows.map(event=><Card key={event.id}><Text style={s.heading}>{auditEntities.find(([id])=>id===event.entity)?.[1]??event.entity} · {auditActions.find(([id])=>id===event.action)?.[1]??event.action}</Text><Text style={s.text}>{date(event.createdAt)} · Actor: {event.actor??'Propietario / procedimiento dirigido'}</Text><Text selectable style={s.muted}>Destinatario: {event.target}</Text><Text style={s.text}>Motivo: {event.reason}</Text><Text selectable style={s.muted}>Antes: {JSON.stringify(event.before)}{ '\n' }Después: {JSON.stringify(event.after)}</Text></Card>)}
    <Pagination data={data.audit} busy={busy} onPage={setPage}/>
   </>}
  </View>
  <Confirm value={confirmation} onClose={()=>setConfirmation(null)}/>
 </View>;
}
