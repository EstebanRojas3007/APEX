import type {AdminSelectProps} from './AdminSelect';
export default function AdminSelect({label,value,items,onChange,disabled}:AdminSelectProps){
 return <label style={{display:'flex',flexDirection:'column',gap:7,flex:1,minWidth:160,color:'#26394C',fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',fontSize:14,fontWeight:600}}>{label}<select aria-label={label} value={value} disabled={disabled} onChange={event=>onChange(event.currentTarget.value)} style={{width:'100%',minHeight:48,border:'1px solid #8998A7',borderRadius:10,padding:'11px 12px',font:'inherit',fontWeight:400,color:'#26394C',background:'#fff'}}>{items.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;
}
