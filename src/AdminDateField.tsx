import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import {Text,View} from 'react-native';
import {Button,styles as s} from './ui';
export type AdminDateProps={label:string;value:string;onChange:(value:string)=>void};
export default function AdminDateField({label,value,onChange}:AdminDateProps){
 function open(){
  const parts=value.split('-').map(Number),initial=value?new Date(parts[0]!,parts[1]!-1,parts[2]!):new Date();
  DateTimePickerAndroid.open({value:initial,mode:'date',display:'calendar',onValueChange:(_event,selected)=>onChange(`${String(selected.getFullYear()).padStart(4,'0')}-${String(selected.getMonth()+1).padStart(2,'0')}-${String(selected.getDate()).padStart(2,'0')}`)});
 }
 return <View style={{gap:7,flex:1,minWidth:160}}><Text style={s.label}>{label}</Text><Button secondary label={`${label}: ${value?value.split('-').reverse().join('/'):'Seleccionar fecha'} ▦`} onPress={open}/>{!!value&&<Button secondary label={`Quitar fecha ${label}`} onPress={()=>onChange('')}/>}</View>;
}
