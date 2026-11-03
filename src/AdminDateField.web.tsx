import type {AdminDateProps} from './AdminDateField';
export default function AdminDateField({label,value,onChange}:AdminDateProps){
 return <label style={{display:'flex',flexDirection:'column',gap:7,flex:1,minWidth:160,color:'#26394C',fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',fontSize:14,fontWeight:600}}>{label}<input type="date" aria-label={label} value={value} onChange={event=>onChange(event.currentTarget.value)} style={{width:'100%',boxSizing:'border-box',minHeight:48,border:'1px solid #8998A7',borderRadius:10,padding:'10px 12px',font:'inherit',fontWeight:400,color:'#26394C',background:'#fff'}}/></label>;
}
