import {useMemo,type ReactNode} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import MarkdownIt,{type Token} from 'markdown-it';
import {colors} from './ui';

// Parse the original reply into tokens, never HTML. Only native Text/View nodes are rendered.
const markdown=new MarkdownIt({html:false,linkify:false,typographer:false});

function inline(tokens:Token[]):ReactNode[]{
 let cursor=0;
 function read(until?:string):ReactNode[]{
  const result:ReactNode[]=[];
  while(cursor<tokens.length){
   const key=cursor,token=tokens[cursor++]!;
   if(token.type===until)break;
   if(token.type==='strong_open'||token.type==='em_open'||token.type==='s_open'){
    const type=token.type;
    result.push(<Text key={key} style={type==='strong_open'?styles.strong:type==='em_open'?styles.em:styles.strike}>{read(type.replace('_open','_close'))}</Text>);
   }else if(token.type==='link_open'){
    // Link labels remain readable without creating navigation or accepting model-provided URLs.
    result.push(<Text key={key}>{read('link_close')}</Text>);
   }else if(token.type==='softbreak'||token.type==='hardbreak')result.push('\n');
   else if(token.type==='code_inline')result.push(<Text key={key} style={styles.code}>{token.content}</Text>);
   else if(token.type==='image')result.push(token.content);
   else result.push(token.content);
  }
  return result;
 }
 return read();
}

function blocks(tokens:Token[]):ReactNode[]{
 let cursor=0;
 function read(until?:string):ReactNode[]{
  const result:ReactNode[]=[];
  while(cursor<tokens.length){
   const key=cursor,token=tokens[cursor++]!;
   if(token.type===until)break;
   if(token.type==='paragraph_open'||token.type==='heading_open'){
    const heading=token.type==='heading_open';
    const body=tokens[cursor]?.type==='inline'?tokens[cursor++]:undefined;
    if(tokens[cursor]?.type===(heading?'heading_close':'paragraph_close'))cursor++;
    result.push(<Text key={key} selectable accessibilityRole={heading?'header':undefined} style={[styles.text,heading&&styles.heading,heading&&token.tag==='h1'&&styles.h1]}>{inline(body?.children??[])}</Text>);
   }else if(token.type==='bullet_list_open'||token.type==='ordered_list_open'){
    const ordered=token.type==='ordered_list_open';
    let number=Number(token.attrGet('start')??1);
    const items:ReactNode[]=[];
    while(cursor<tokens.length&&tokens[cursor]?.type!==(ordered?'ordered_list_close':'bullet_list_close')){
     if(tokens[cursor]?.type==='list_item_open'){
      const itemKey=cursor++;const content=read('list_item_close');
      items.push(<View key={itemKey} style={styles.listItem}><Text style={[styles.text,styles.marker]}>{ordered?`${number++}.`:'•'}</Text><View style={styles.listBody}>{content}</View></View>);
     }else cursor++;
    }
    cursor++;
    result.push(<View key={key} style={styles.list}>{items}</View>);
   }else if(token.type==='blockquote_open')result.push(<View key={key} style={styles.quote}>{read('blockquote_close')}</View>);
   else if(token.type==='fence'||token.type==='code_block')result.push(<Text key={key} selectable style={[styles.text,styles.codeBlock]}>{token.content}</Text>);
   else if(token.type==='hr')result.push(<View key={key} style={styles.rule}/>);
   else if(token.type==='inline')result.push(<Text key={key} selectable style={styles.text}>{inline(token.children??[])}</Text>);
   else if(token.content)result.push(<Text key={key} selectable style={styles.text}>{token.content}</Text>);
  }
  return result;
 }
 return read();
}

export function TutorMarkdown({text}:{text:string}){
 const content=useMemo(()=>blocks(markdown.parse(text,{})),[text]);
 return <View style={styles.document}>{content}</View>;
}

const styles=StyleSheet.create({
 document:{gap:12,minWidth:0,flexShrink:1},
 text:{fontSize:15,lineHeight:25,color:colors.text,flexShrink:1},
 strong:{fontWeight:'700'},em:{fontStyle:'italic'},strike:{textDecorationLine:'line-through'},
 heading:{fontSize:18,lineHeight:27,fontWeight:'700'},h1:{fontSize:21,lineHeight:30},
 list:{gap:9},listItem:{flexDirection:'row',gap:8,alignItems:'flex-start'},
 marker:{minWidth:20},listBody:{flex:1,minWidth:0,gap:8},
 quote:{borderLeftWidth:3,borderLeftColor:'#B8C9DF',paddingLeft:14,gap:10},
 code:{fontFamily:'monospace',backgroundColor:'#EDF2F8'},
 codeBlock:{fontFamily:'monospace',backgroundColor:'#EDF2F8',padding:12,borderRadius:8},
 rule:{height:1,backgroundColor:colors.border,marginVertical:6},
});
