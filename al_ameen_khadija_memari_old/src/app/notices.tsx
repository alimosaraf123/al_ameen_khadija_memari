import React,{useEffect,useState} from 'react';
import {ScrollView,Text,Alert,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {api} from '../lib/api';
import {getUser} from '../lib/auth';
import {Field,Button,Card,H1,Muted} from '../components/ui';
export default function Notices(){
 const [list,setList]=useState<any[]>([]),[title,setTitle]=useState(''),[text,setText]=useState(''),[type,setType]=useState(''),[canPublish,setCanPublish]=useState(false);
 const load=async()=>{try{const d=await api('/api/notices');setList(d.notices||[]);}catch(e:any){Alert.alert('Error',e.message);}};
 useEffect(()=>{void load();void getUser<any>().then(u=>setCanPublish(['admin','super_admin'].includes(u?.role)));},[]);
 const add=async()=>{if(!title.trim())return Alert.alert('Required','Enter a title.');try{await api('/api/notices',{method:'POST',body:JSON.stringify({title,notice_text:text,notice_type:type,targets:[{target_type:'all'}]})});setTitle('');setText('');setType('');await load();Alert.alert('Published','Notice published successfully.');}catch(e:any){Alert.alert('Error',e.message);}};
 return <SafeAreaView style={{flex:1,backgroundColor:'#f3f6f9'}}><ScrollView contentContainerStyle={{padding:16,maxWidth:900,width:'100%',alignSelf:'center'}}><H1>Notices</H1>
 {canPublish?<View><Field placeholder="Notice type (Visiting Day/Holiday/Result...)" value={type} onChangeText={setType}/><Field placeholder="Title" value={title} onChangeText={setTitle}/><Field placeholder="Notice" value={text} onChangeText={setText} multiline/><Button title="Publish Notice" onPress={add}/></View>:<Card><Muted>Notices are view only for teachers.</Muted></Card>}
 {list.length===0?<Card><Muted>No active notice.</Muted></Card>:list.map(x=><Card key={x.id}><Text style={{fontWeight:'800',fontSize:16}}>{x.title}</Text><Text style={{color:'#6b7280',marginVertical:4}}>{x.notice_type||'Notice'} · {String(x.published_at||'').slice(0,10)}</Text><Text>{x.notice_text||''}</Text></Card>)}
 </ScrollView></SafeAreaView>;
}