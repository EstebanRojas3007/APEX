import {useEffect,useRef,useState} from 'react';
import {Text,View,useWindowDimensions} from 'react-native';
import type {AdminCatalog,AdminChange,AdminRole,AdminUser,AccountStatus} from '../shared/admin';
import type {TeacherGroup} from '../shared/teacher';
import {Button,Card,Field,styles as s} from './ui';
import {rpc} from './api';
import {associationCondition,type CatalogFeedback} from './adminCatalog';

export function Choices<T extends string>({label,value,items,onChange,disabled=false}:{label:string;value:T;items:readonly [T,string][];onChange:(value:T)=>void;disabled?:boolean}){
 return <View style={{gap:8}}><Text style={s.label}>{label}</Text><View style={s.row}>{items.map(([id,name])=><View key={id} style={{maxWidth:'100%'}}><Button secondary={value!==id} disabled={disabled} label={name} onPress={()=>onChange(id)}/></View>)}</View></View>;
}
export type ChangeHandler=(change:AdminChange)=>void;
export const roleChoices:readonly [AdminRole,string][]=[['estudiante','Estudiante'],['docente','Profesor'],['administrador','Administrador']];
export const statusChoices:readonly [AccountStatus,string][]=[['activo','Activo'],['inactivo','Inactivo']];
// Correlation IDs are not credentials; the security nonce is generated privately in PostgreSQL.
export const uuid=()=>globalThis.crypto?.randomUUID?.()??'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16);});

export function AdminUserEditor({user,busy,onChange,onClose}:{user:AdminUser;busy:boolean;onChange:ChangeHandler;onClose:()=>void}){
 const [role,setRole]=useState(user.role),[status,setStatus]=useState(user.status),[reason,setReason]=useState('');
 return <Card><Text accessibilityRole="header" style={s.heading}>Gestionar cuenta · {user.name||user.email}</Text>
  <Text selectable style={s.muted}>ID APEX: {user.id}</Text><Text selectable style={s.muted}>UUID Auth: {user.authId??'Sin vínculo'}</Text>
  <Text style={s.text}>{user.identityVerified?'Vínculo de identidad verificado':'Identidad discrepante: requiere conciliación antes de cambiar permisos.'}</Text>
  {user.emailConfirmed===false&&<Text style={s.notice}>El correo todavía no está confirmado en Auth. No se puede promover esta cuenta a profesor o administrador.</Text>}
  {user.activeExams>0&&<Text style={s.notice}>Hay {user.activeExams} examen(es) activo(s). No se permite cambiar rol o estado hasta resolverlos por su flujo académico.</Text>}
  <Choices label="Nuevo rol" value={role} items={user.role==='estudiante'?roleChoices.filter(([id])=>id!=='docente'):roleChoices} onChange={setRole} disabled={busy}/>
  {user.role==='estudiante'&&<Text style={s.notice}>Para proponer el rol Profesor, utiliza “Invitar profesor con cuenta existente” en Asignación y transición. El destinatario debe aceptar.</Text>}
  <Choices label="Nuevo estado" value={status} items={statusChoices} onChange={setStatus} disabled={busy}/>
  <Field label="Motivo del cambio de cuenta" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy}/>
  <Button label="Revisar cambio de cuenta" disabled={busy||!reason.trim()||!user.identityVerified||user.activeExams>0} onPress={()=>onChange({title:'Confirmar cambio de cuenta',body:`${user.email}: rol ${role}, estado ${status}. Se conservan perfil, historial y relaciones. Se rechaza cualquier cambio incompatible con un examen activo o con el último administrador.`,operation:'admin_user_update',payload:{userId:user.id,authId:user.authId,expectedRole:user.role,expectedStatus:user.status,role,status,reason:reason.trim(),confirmed:true}})}/>
  <Button secondary label="Cerrar edición de cuenta" onPress={onClose} disabled={busy}/>
 </Card>;
}

export function AdminGroupEditor({group,busy,onChange}:{group?:TeacherGroup;busy:boolean;onChange:ChangeHandler}){
 const [id,setId]=useState(()=>group?.id??uuid()),[code,setCode]=useState(group?.code??''),
 [name,setName]=useState(group?.name??''),[reason,setReason]=useState('');
 return <Card><Text accessibilityRole="header" style={s.heading}>{group?'Editar salón':'Crear salón'}</Text>
  <Field label="Código del salón" value={code} onChangeText={setCode} maxLength={40} editable={!busy}/>
  <Field label="Nombre del salón" value={name} onChangeText={setName} maxLength={120} editable={!busy}/>
  <Text style={s.muted}>Inglés · máximo 20 integrantes. Se conserva la excepción del MVP sin mínimo de cinco.</Text>
  <Field label="Motivo del cambio de salón" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy}/>
  <Button label={group?'Revisar edición de salón':'Revisar creación de salón'} 
  disabled=
  {busy||!code.trim()||name.trim().length<2||!reason.trim()} 
  
  onPress=
  {()=>
    onChange({title:'Confirmar salón',body:`${code.trim()} · ${name.trim()}. No se asignarán integrantes automáticamente.`,
    operation:'admin_group_save',payload:
  {groupId:id,code:code.trim(),name:name.trim(),componentId:'ingles',status:group?.status??'activo',reason:reason.trim()}})}/>
  {group&&<Button secondary label={group.status==='activo'?'Archivar salón':'Reactivar salón'}
  disabled=
  {busy||!reason.trim()} onPress={()=>onChange({title:group.status==='activo'?'Archivar salón':'Reactivar salón',body:
  'Se conservan integrantes, responsables e historial. Archivar retira el salón del seguimiento docente; no suspende ni califica exámenes.',
  operation:'admin_group_save',payload:{groupId:group.id,code:group.code,name:group.name,componentId:'ingles',status:group.status==='activo'?'inactivo':'activo',
  reason:reason.trim()
  }})}/>}
  {!group&&<Button secondary label="Preparar otro salón" disabled={busy} onPress={()=>{setId(uuid());setCode('');setName('');setReason('');}}/>}
 </Card>;
}

export function AdminGroupPeople({groupId,teachers,students,busy,onChange}:{groupId:string;teachers:AdminUser[];students:AdminUser[];busy:boolean;onChange:ChangeHandler}){
 const [kind,setKind]=useState<'teacher'|'student'>('teacher'),[id,setId]=useState(''),[reason,setReason]=useState('');
 const change=(role:'teacher'|'student',target:string,active:boolean)=>onChange({title:active?'Confirmar asignación al salón':'Confirmar retirada del salón',body:'La operación valida identidad, rol, estado y cupo en servidor. Se conservan las relaciones anteriores y el historial académico.',operation:role==='teacher'?'admin_group_teacher':'admin_group_member',payload:{groupId,[role==='teacher'?'teacherId':'studentId']:target,active,reason:reason.trim()}});
 return <Card><Text accessibilityRole="header" style={s.heading}>Responsables e integrantes</Text>
  <Field label="Motivo de asignación o retirada" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy}/>
  {([['teacher','Profesores',teachers],['student','Estudiantes',students]] as const).map(([role,title,people])=><View key={role} style={{gap:10}}><Text style={s.heading}>{title}</Text>{!people.length&&<Text style={s.muted}>Sin asignaciones registradas.</Text>}{people.map(user=><View key={user.id} style={{gap:8}}><Text style={s.text}>{user.name||user.email} · {user.status} · {user.assigned?'Asignación activa':'Asignación retirada'}</Text><Text selectable style={s.muted}>{user.id}</Text><Button secondary disabled={busy||!reason.trim()} label={`${user.assigned?'Retirar':'Asignar nuevamente'} ${user.name||user.email}`} onPress={()=>change(role,user.id,!user.assigned)}/></View>)}</View>)}
  <Choices label="Añadir al salón" value={kind} items={[["teacher","Profesor"],["student","Estudiante"]]} onChange={setKind} disabled={busy}/>
  <Field label="ID APEX de la cuenta verificada" value={id} onChangeText={setId} autoCapitalize="none" editable={!busy}/>
  <Text style={s.muted}>Consulta y copia el ID APEX en Consultar. Cada asignación se valida de nuevo; no se utilizan nombres ni posiciones como identificadores.</Text>
  <Button label="Revisar asignación al salón" disabled={busy||!id.trim()||!reason.trim()} onPress={()=>change(kind,id.trim(),true)}/>
 </Card>;
}
export function AdminInviteForm({busy,onChange,onError,mode,onBack}:{busy:boolean;onChange:ChangeHandler;onError:(error:unknown)=>void;mode:'new'|'existing';onBack:()=>void}){
 const [id,setId]=useState(uuid),[name,setName]=useState(''),[email,setEmail]=useState(''),[reason,setReason]=useState(''),[userId,setUserId]=useState('');
 const [user,setUser]=useState<(AdminUser&{revision:number})|null>(null),[looking,setLooking]=useState(false),[error,setError]=useState('');
 const lookupGeneration=useRef(0),lookupBusy=useRef(false);
 useEffect(()=>()=>{lookupGeneration.current++;},[]);
 async function lookup(){
  if(lookupBusy.current)return;lookupBusy.current=true;const generation=++lookupGeneration.current;setLooking(true);setUser(null);setError('');
  try{const value=await rpc<AdminUser&{revision:number}>('admin_invite_lookup',{userId:userId.trim()});if(generation===lookupGeneration.current)setUser(value);}
  catch(err){if(generation===lookupGeneration.current){setError(err instanceof Error?err.message:'No se pudo consultar el ID.');onError(err);}}
  finally{lookupBusy.current=false;setLooking(false);}
 }
 const ready=mode==='existing'?!!user&&user.activeExams===0:name.trim().length>=2&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
 return <Card><Text accessibilityRole="header" style={s.heading}>{mode==='existing'?'Invitar profesor con cuenta existente':'Invitar profesor sin cuenta'}</Text>
  <Button secondary label="Volver a modalidades de invitación" disabled={busy} onPress={onBack}/>
  {mode==='existing'?<>
   <Field label="ID del usuario APEX" value={userId} onChangeText={value=>{setUserId(value);setUser(null);lookupGeneration.current++;setId(uuid());}} autoCapitalize="none" editable={!busy&&!looking}/>
   <Button secondary label={looking?'Consultando identidad…':'Consultar ID APEX'} disabled={busy||looking||!userId.trim()} onPress={()=>void lookup()}/>
   {user&&<View style={{gap:8}}><Text style={s.text}>Nombre: {user.name}</Text><Text style={s.text}>Correo destinatario: {user.email}</Text><Text style={s.text}>Rol actual: {roleChoices.find(([id])=>id===user.role)?.[1]}</Text><Text style={s.muted}>Confirma que esta es la identidad destinataria. Su acceso actual se conserva hasta aceptar.</Text>{user.activeExams>0&&<Text style={s.notice}>La cuenta tiene un examen activo; resuélvelo por su flujo académico.</Text>}</View>}
  </>:<><Text style={s.text}>La persona configura su acceso y acepta antes de recibir permisos de profesor.</Text>
   <Field label="Nombre del profesor invitado" value={name} onChangeText={value=>{setName(value);setId(uuid());}} maxLength={100} editable={!busy}/>
   <Field label="Correo de invitación" value={email} onChangeText={value=>{setEmail(value);setId(uuid());}} keyboardType="email-address" autoCapitalize="none" maxLength={254} editable={!busy}/>
  </>}
  <Text style={s.label}>Rol que se asignará: Profesor</Text>
  <Field label="Motivo de la invitación" value={reason} onChangeText={value=>{setReason(value);setId(uuid());}} multiline maxLength={1000} editable={!busy}/>
  {!!error&&<Text accessibilityRole="alert" style={s.notice}>{error}</Text>}
  <Button label="Enviar invitación" disabled={busy||looking||!ready||!reason.trim()} onPress={()=>onChange({title:'Confirmar invitación de profesor',body:`Destinatario: ${user?.name??name.trim()} · ${user?.email??email.trim().toLowerCase()}\nRol actual: ${user?'Estudiante':'Sin cuenta'}\nRol propuesto: Profesor\nMotivo: ${reason.trim()}\nEl rol se concede únicamente tras la aceptación explícita de la persona.`,operation:'admin_invite_prepare',payload:{invitationId:id,mode,role:'docente',...(mode==='existing'?{userId:user!.id,expectedRole:user!.role,expectedStatus:user!.status,expectedRevision:user!.revision}:{name:name.trim(),email:email.trim().toLowerCase()}),reason:reason.trim(),confirmed:true},dispatch:true})}/>
  <Button secondary label="Preparar otra invitación" disabled={busy} onPress={()=>{setId(uuid());setName('');setEmail('');setReason('');setUserId('');setUser(null);setError('');}}/>
 </Card>;
}
export function AdminInvitationModes({busy,onChange,onError}:{busy:boolean;onChange:ChangeHandler;onError:(error:unknown)=>void}){
 const [mode,setMode]=useState<'new'|'existing'|null>(null),{width}=useWindowDimensions();
 return mode?<AdminInviteForm key={mode} mode={mode} busy={busy} onChange={onChange} onError={onError} onBack={()=>setMode(null)}/>:<View style={{flexDirection:width<700?'column':'row',gap:16}}>
  {(['existing','new'] as const).map(value=><View key={value} style={{flex:1}}><Card><Text style={s.heading}>{value==='existing'?'Ya tiene cuenta APEX':'Primera cuenta en APEX'}</Text><Text style={s.text}>{value==='existing'?'Consulta su ID y propón el rol sin alterar su acceso actual.':'Envía un enlace para configurar su acceso y aceptar.'}</Text><Button label={value==='existing'?'Invitar profesor con cuenta existente':'Invitar profesor sin cuenta'} disabled={busy} onPress={()=>setMode(value)}/></Card></View>)}
 </View>;
}
function CatalogFeedbackMessage({feedback,testID}:{feedback:CatalogFeedback|undefined;testID:string}){
 if(!feedback)return null;
 return <View testID={testID} style={{gap:8}}><Text accessibilityRole={feedback.status==='error'||feedback.status==='uncertain'?'alert':undefined} accessibilityLiveRegion="polite" style={s.notice}>{feedback.message}{feedback.refresh==='checking'?' Actualizando el catálogo y sus selectores…':feedback.refresh==='ready'?' Listado, selectores y asociaciones actualizados.':feedback.refresh==='error'?' La operación fue confirmada, pero no se pudo actualizar el catálogo. Comprueba sus datos antes de repetir.':feedback.refresh==='mismatch'?' La operación fue confirmada, pero la consulta todavía no refleja el cambio. Comprueba sus datos antes de repetir.':''}</Text></View>;
}
function AdminAssociationRow({association:a,busy,checking,queryError,reason,unavailable,feedback,onChange}:{association:AdminCatalog['associations'][number];busy:boolean;checking:boolean;queryError:string;reason:string;unavailable:boolean;feedback?:CatalogFeedback;onChange:ChangeHandler}){
 const condition=associationCondition(a,checking,queryError);
 return <View testID={`catalog-association-${a.programId}-${a.componentId}`} style={{gap:8,borderTopWidth:1,borderTopColor:'#DCE2EA',paddingTop:16}}>
  <Text style={s.heading}>{a.programId} / {a.componentId}</Text>
  {a.impact&&<Text style={s.text}>{a.impact.students??'Sin datos'} perfiles · {a.impact.memberships??'Sin datos'} membresías · {a.impact.routes??'Sin datos'} rutas · {a.impact.assignments??'Sin datos'} asignaciones · {a.impact.activeExams??'Sin datos'} exámenes activos</Text>}
  <Text accessibilityRole={condition.state==='error'?'alert':undefined} accessibilityLiveRegion="polite" style={s.notice}>{condition.state==='blocked'?'Retirada bloqueada: ':''}{condition.message}</Text>
  {!reason.trim()&&<Text style={s.muted}>Escribe el motivo en «Motivo de asociación o retirada» para revisar una retirada permitida.</Text>}
  {busy&&<Text style={s.muted}>Hay una operación en curso. Espera su respuesta.</Text>}
  <CatalogFeedbackMessage feedback={feedback} testID="catalog-association-feedback"/>
  <Button secondary label={`Retirar asociación ${a.programId} / ${a.componentId}`} disabled={unavailable||!reason.trim()||condition.state!=='allowed'} onPress={()=>onChange({title:'Confirmar retirada de asociación',body:`${a.programId} / ${a.componentId}\nMotivo: ${reason.trim()}\nEl servidor volverá a comprobar que no existan perfiles o intentos afectados. No se borra historial.`,operation:'admin_association_remove',payload:{programId:a.programId,componentId:a.componentId,reason:reason.trim(),confirmed:true}})}/>
 </View>;
}
export function AdminCatalogForms({data,busy,onChange,checking=false,queryError='',feedback,onRefresh}:{data:AdminCatalog;busy:boolean;onChange:ChangeHandler;checking?:boolean;queryError?:string;feedback?:CatalogFeedback;onRefresh:()=>void}){
 const [entity,setEntity]=useState<'program'|'component'>('program'),[id,setId]=useState(''),[name,setName]=useState(''),[reason,setReason]=useState('');
 const [programId,setProgramId]=useState(''),[componentId,setComponentId]=useState(''),[associationReason,setAssociationReason]=useState('');
 const idError=id.trim()&&!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(id.trim())?'El ID debe tener de 1 a 60 caracteres: minúsculas, números, guiones o guion bajo; comienza con letra o número.':'';
 const unavailable=busy||checking||!!queryError||feedback?.refresh==='mismatch';
 const withdrawal=feedback?.change.operation==='admin_association_remove'?feedback:undefined;
 const associationItems=data.associations.map(a=><AdminAssociationRow key={`${a.programId}/${a.componentId}`} association={a} busy={busy} checking={checking} queryError={queryError} reason={associationReason} unavailable={!!unavailable} feedback={withdrawal?.change.payload.programId===a.programId&&withdrawal.change.payload.componentId===a.componentId?withdrawal:undefined} onChange={onChange}/>);
 if(withdrawal&&!data.associations.some(a=>a.programId===withdrawal.change.payload.programId&&a.componentId===withdrawal.change.payload.componentId))associationItems.splice(Math.max(0,Math.min(withdrawal.associationIndex??associationItems.length,associationItems.length)),0,<CatalogFeedbackMessage key="withdrawal-result" feedback={withdrawal} testID="catalog-association-feedback"/>);
 return <View style={s.stack}><Card><Text accessibilityRole="header" style={s.heading}>Catálogo</Text>
  <Text style={s.muted}>Los IDs son estables. Se crean o renombran entradas; no se borran registros ni se publican módulos.</Text>
  <Choices label="Tipo de catálogo" value={entity} items={[["program","Programa"],["component","Componente"]]} onChange={value=>{setEntity(value);setId('');setName('');}} disabled={busy}/>
  {(entity==='program'?data.programs:data.components).map(item=><Button key={item.id} secondary label={`Editar ${item.name} (${item.id})`} disabled={busy} onPress={()=>{setId(item.id);setName(item.name);}}/>)}
  <Field label="ID de catálogo" value={id} onChangeText={setId} autoCapitalize="none" maxLength={60} editable={!busy}/>
  {!!idError&&<Text accessibilityRole="alert" style={s.notice}>{idError}</Text>}
  <Field label="Nombre de catálogo" value={name} onChangeText={setName} maxLength={120} editable={!busy}/>
  <Field label="Motivo del cambio de catálogo" value={reason} onChangeText={setReason} multiline maxLength={1000} editable={!busy}/>
  <CatalogFeedbackMessage feedback={feedback?.change.operation==='admin_catalog_save'?feedback:undefined} testID="catalog-save-feedback"/>
  {checking&&<Text accessibilityLiveRegion="polite" style={s.muted}>Comprobando el catálogo…</Text>}
  {!!queryError&&<Text accessibilityRole="alert" style={s.notice}>No se pudo actualizar el catálogo: {queryError} Los datos del formulario se conservan.</Text>}
  <Button label="Revisar catálogo" disabled={unavailable||!!idError||!id.trim()||name.trim().length<2||!reason.trim()} onPress={()=>onChange({title:'Confirmar catálogo',body:`${entity==='program'?'Programa':'Componente'}: ${name.trim()}\nID: ${id.trim()}\nMotivo: ${reason.trim()}\nSe conserva el ID de los registros existentes y su historial. Un componente nuevo no publica un módulo de aprendizaje.`,operation:'admin_catalog_save',payload:{entity,id:id.trim(),name:name.trim(),reason:reason.trim(),confirmed:true}})}/>
 </Card><Card><Text accessibilityRole="header" style={s.heading}>Asociaciones autorizadas</Text>
  <Text style={s.muted}>Las condiciones proceden del servidor. El recuento de perfiles incluye todos los perfiles vinculados al programa, sin filtrar su estado o rol actual.</Text>
  <Button secondary label="Comprobar condiciones de asociaciones" disabled={busy||checking} onPress={onRefresh}/>
  <Field label="Motivo de asociación o retirada" value={associationReason} onChangeText={setAssociationReason} multiline maxLength={1000} editable={!busy}/>
  <Choices label="Programa para asociar" value={programId} items={data.programs.map(p=>[p.id,p.name])} onChange={setProgramId} disabled={busy}/>
  <Choices label="Componente para asociar" value={componentId} items={data.components.map(c=>[c.id,c.name])} onChange={setComponentId} disabled={busy}/>
  <CatalogFeedbackMessage feedback={feedback?.change.operation==='admin_association_add'?feedback:undefined} testID="catalog-association-feedback"/>
  <Button label="Revisar asociación" disabled={unavailable||!programId||!componentId||!associationReason.trim()} onPress={()=>onChange({title:'Confirmar asociación',body:`${programId} / ${componentId}\nMotivo: ${associationReason.trim()}\nSe autoriza el componente para el programa sin cambiar carreras ni asignar evaluaciones automáticamente.`,operation:'admin_association_add',payload:{programId,componentId,reason:associationReason.trim(),confirmed:true}})}/>
  {!data.associations.length&&<Text style={s.muted}>Sin asociaciones.</Text>}
  {associationItems}
 </Card></View>;
}
