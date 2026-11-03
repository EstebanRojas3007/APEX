export async function copyAdminId(value:string){
 if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}
 const input=document.createElement('textarea'),focused=document.activeElement;
 input.value=value;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();
 try{if(!document.execCommand('copy'))throw new Error('Copy unavailable');}
 finally{input.remove();if(focused instanceof HTMLElement)focused.focus({preventScroll:true});}
}
