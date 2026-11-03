import {Clipboard} from 'react-native';
export async function copyAdminId(value:string){Clipboard.setString(value);}
