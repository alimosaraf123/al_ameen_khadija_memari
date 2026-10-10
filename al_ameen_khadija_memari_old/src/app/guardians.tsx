import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, Image, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AcademyHeader from '../components/AcademyHeader';
import {Select} from '../components/StudentDirectory';
import {Field} from '../components/ui';
import {api, API_BASE} from '../lib/api';
import {matchesGuardianSearch} from '../lib/guardianSearch';

type Credentials = {login_id:string; password:string};
function confirmAction(title:string,message:string):Promise<boolean> {
  if(Platform.OS==='web')return Promise.resolve(window.confirm(title+'\n\n'+message));
  return new Promise(resolve=>Alert.alert(title,message,[{text:'Cancel',style:'cancel',onPress:()=>resolve(false)},{text:'Confirm',onPress:()=>resolve(true)}],{cancelable:true,onDismiss:()=>resolve(false)}));
}
function notify(message:string) {if(Platform.OS==='web')window.alert(message);else Alert.alert('Guardian Login',message);}
function whatsappNumber(value:any){const digits=String(value||'').replace(/\D/g,'');return digits.length===10?'91'+digits:/^91\d{10}$/.test(digits)?digits:'';}
const GUARDIAN_WHATSAPP_GROUPS:Record<string,string>={
 v:'https://chat.whatsapp.com/DJAmEnz806aLKwDeHJWAbA',
 vi:'https://chat.whatsapp.com/E88K0FhqQ79LsP4Chsj5QG',
 vii:'https://chat.whatsapp.com/JheyvGRu9qUI76bmvdJQ6F',
 viii:'https://chat.whatsapp.com/If8ZQCcJZwqJ43aHIJplmH',
 ix:'https://chat.whatsapp.com/CjfZ4JxSzF897zONZhhsQw',
 x:'https://chat.whatsapp.com/LC63a3C1QJh3NyMN2hXpI0',
 xi:'https://chat.whatsapp.com/DJIJmG6OmPb8qqra9WVDnI',
 xii:'https://chat.whatsapp.com/GNUjwROoO0ULdnmws13S9v',
};
function guardianWhatsAppGroup(className:any){
 const value=String(className||'').trim().toLowerCase().replace(/^class\s+/,'');
 const key=(value.match(/^(xii|xi|viii|vii|vi|ix|x|v)(?:\b|-)/)||[])[1]||'';
 return GUARDIAN_WHATSAPP_GROUPS[key]||'';
}
export default function Guardians(){
 const [students,setStudents]=useState<any[]>([]),[guardians,setGuardians]=useState<any[]>([]),[search,setSearch]=useState(''),[size,setSize]=useState('25'),[page,setPage]=useState(1),[busy,setBusy]=useState<number|null>(null),[error,setError]=useState(''),[passwords,setPasswords]=useState<Record<string,Credentials>>({});
 const load=useCallback(async()=>{const [s,g,c]=await Promise.all([api('/api/students'),api('/api/guardians'),api('/api/guardians/temporary-passwords')]);setStudents(s.students||[]);setGuardians(g.guardians||[]);setPasswords(Object.fromEntries((c.credentials||[]).map((x:Credentials)=>[x.login_id,x])));},[]);
 useEffect(()=>{
  let active=true;
  Promise.all([api('/api/students'),api('/api/guardians'),api('/api/guardians/temporary-passwords')]).then(([s,g,c])=>{
   if(active){setStudents(s.students||[]);setGuardians(g.guardians||[]);setPasswords(Object.fromEntries((c.credentials||[]).map((x:Credentials)=>[x.login_id,x])));}
  }).catch(e=>{if(active)setError(e.message)});
  return()=>{active=false};
 },[]);

 const rows=useMemo(()=>{const links=new Map<number,any>();guardians.forEach(g=>(g.students||[]).forEach((s:any)=>{if(!links.has(Number(s.id)))links.set(Number(s.id),g)}));return students.map(s=>({...s,guardian:links.get(Number(s.id))})).filter(s=>matchesGuardianSearch(s,search)).sort((a,b)=>String(a.student_name).localeCompare(String(b.student_name)));},[students,guardians,search]);
 const pageSize=size==='all'?Math.max(1,rows.length):Number(size),pages=Math.max(1,Math.ceil(rows.length/pageSize)),currentPage=Math.min(page,pages),start=(currentPage-1)*pageSize;
 const issue=async(student:any):Promise<Credentials>=>{
  const g=student.guardian;const data=await api(g?`/api/guardians/${g.id}/reset-password`:'/api/guardians/create-for-student',{method:'POST',...(g?{}:{body:JSON.stringify({registration_no:student.registration_no})})});
  if(!data.credentials?.password)throw new Error('Temporary password could not be generated.');
  setPasswords(old=>({...old,[String(data.credentials.login_id)]:data.credentials}));await load();return data.credentials;
 };
 const resetAll=async()=>{
  if(!await confirmAction('Create All Logins & Temporary Passwords','Create missing guardian logins for all students, reset every guardian password and sign out all devices? Locked accounts will stay locked.'))return;
  setBusy(-1);
  try{
   const data=await api('/api/guardians/reset-all-passwords',{method:'POST',body:JSON.stringify({create_missing:true})});
   const next:Record<string,Credentials>={};
   (data.credentials||[]).forEach((credential:Credentials)=>{next[credential.login_id]=credential});
   setPasswords(next);
   await load();
   notify(`Temporary passwords generated for ${data.count} guardian accounts. Use each WhatsApp button to prepare its message.`);
  }catch(e:any){notify(e.message)}finally{setBusy(null)}
 };
 const reset=async(student:any)=>{if(!await confirmAction(student.guardian?'Reset Password':'Create Guardian Login',student.guardian?'Generate a new temporary password and sign out existing devices?':'Create a guardian login with a random temporary password?'))return;setBusy(student.id);try{await issue(student);}catch(e:any){notify(e.message)}finally{setBusy(null)}};
 const whatsapp=async(student:any)=>{
  const phone=whatsappNumber(student.whatsapp_number||student.guardian?.mobile||student.guardian_mobile||student.father_mobile||student.mobile_number);
  if(!phone)return notify('A valid 10 digit WhatsApp number is required. Update the student contact number first.');
  let credentials=passwords[String(student.guardian?.login_id||student.registration_no)];
  if(!credentials&&!await confirmAction('Prepare WhatsApp Message',student.guardian?'The existing password cannot be retrieved. Generate a new temporary password and sign out existing devices?':'Create a guardian login and prepare its temporary password message?'))return;
  const opened=Platform.OS==='web'?window.open('about:blank','_blank'):null;
  if(Platform.OS==='web'&&!opened)return notify('Please allow pop-ups and try again.');
  setBusy(student.id);try{
   if(!credentials)credentials=await issue(student);
   const groupLink=guardianWhatsAppGroup(student.class_name);
   const groupLine=groupLink?`\nWhatsApp Group: ${groupLink}\n`:'';
   const message=`As-salamu alaykum, Respected Guardian.\nWelcome to Al-Ameen Mission Academy, Memari.\n\nStudent: ${student.student_name}\nRegistration No: ${student.registration_no}\n\n*Guardian Login ID: ${credentials.login_id}*\n\nPlease click the link below to download the app from the WhatsApp group.\n\n*Temporary Password: ${credentials.password}*\n${groupLine}\nPlease change this temporary password after your first login. Do not share your login details with anyone.\n\nThank you,\nAl-Ameen Mission Academy, Memari`;
   const url='https://wa.me/'+phone+'?text='+encodeURIComponent(message);
   if(opened)opened.location.href=url;else await Linking.openURL(url);
  }catch(e:any){opened?.close();notify(e.message)}finally{setBusy(null)}
 };
 const lock=async(student:any)=>{const g=student.guardian;if(!g)return;const locked=!!g.user_active;if(!await confirmAction(locked?'Lock Guardian':'Unlock Guardian',locked?'Block guardian login and sign out all devices?':'Allow this guardian to log in again?'))return;setBusy(student.id);try{await api(`/api/guardians/${g.id}/lock`,{method:'PATCH',body:JSON.stringify({locked})});await load()}catch(e:any){notify(e.message)}finally{setBusy(null)}};
 const remove=async(student:any)=>{const g=student.guardian;if(!g)return;if(!await confirmAction('Delete Guardian Account',`Delete guardian login ${g.login_id}? This removes its guardian profile and access for all linked students. Student records and documents will remain.`))return;setBusy(student.id);try{await api(`/api/guardians/${g.id}`,{method:'DELETE'});setPasswords(old=>{const next={...old};delete next[g.login_id];return next});await load()}catch(e:any){notify(e.message)}finally{setBusy(null)}};
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled"><AcademyHeader/><Text style={s.title}>Guardian Login Management</Text><TouchableOpacity disabled={busy!==null} onPress={resetAll} style={[s.refresh,busy!==null&&s.disabled]}><Text style={s.bold}>{busy===-1?'Generating temporary passwords...':'Generate All Temporary Passwords'}</Text></TouchableOpacity><Text style={s.help}>Login ID is the registration number. Temporary passwords remain visible until changed by the guardian. Guardians must change their password after first login.</Text>{!!error&&<Text style={s.error}>{error}</Text>}<View style={s.filters}><View style={{flex:1,minWidth:220}}><Field placeholder="Search registration / student / class / mobile" value={search} onChangeText={value=>{setSearch(value);setPage(1)}}/></View><Text>Show</Text><Select label="Entries" value={size} onChange={value=>{setSize(value);setPage(1)}} options={['10','25','50','100','all'].map(value=>({value,label:value==='all'?'All':value}))}/><TouchableOpacity onPress={()=>{void load().catch(e=>notify(e.message))}} style={s.refresh}><Text>Refresh</Text></TouchableOpacity></View><ScrollView horizontal><View><View style={[s.row,s.header]}>{['Sl.','Photo','Reg. / Login ID','Student','Class','Temporary Password','Status','WhatsApp','Actions'].map((h,i)=><Text key={h} style={[s.cell,{width:widths[i]},s.bold]}>{h}</Text>)}</View>{rows.slice(start,start+pageSize).map((student,i)=>{const g=student.guardian,credential=passwords[String(g?.login_id||student.registration_no)],disabled=busy!==null;return <View key={student.id} style={[s.row,i%2===0&&s.striped]}><Text style={[s.cell,{width:widths[0]}]}>{start+i+1}</Text><View style={[s.cell,{width:widths[1]}]}>{student.photo_url&&<Image source={{uri:/^https?:/.test(student.photo_url)?student.photo_url:API_BASE+student.photo_url}} style={s.photo}/>}</View><Text style={[s.cell,{width:widths[2]},s.bold]}>{g?.login_id||student.registration_no}</Text><Text style={[s.cell,{width:widths[3]}]}>{student.student_name}</Text><Text style={[s.cell,{width:widths[4]}]}>{student.class_name||'-'}</Text><Text selectable style={[s.cell,{width:widths[5],color:'#1769aa',fontWeight:'700'}]}>{credential?.password||'—'}</Text><Text style={[s.cell,{width:widths[6],color:g?.user_active?'#16834f':'#b42318'}]}>{g?g.user_active?'Active':'Locked':'Not Created'}</Text><Text style={[s.cell,{width:widths[7]}]}>{student.whatsapp_number||g?.mobile||student.guardian_mobile||student.mobile_number||'-'}</Text><View style={[s.actions,{width:widths[8]}]}>{[["WhatsApp",()=>whatsapp(student),'#16834f','WA'],[g?'Reset password':'Create login',()=>reset(student),'#e0a800','🔑'],[g?.user_active?'Lock guardian':'Unlock guardian',()=>lock(student),'#b64a4a',g?.user_active?'🔒':'🔓'],['Delete guardian',()=>remove(student),'#d33448','🗑']].map(([label,action,color,icon],index)=><TouchableOpacity key={String(label)} accessibilityRole="button" accessibilityLabel={String(label)} disabled={disabled||(index>=2&&!g)} onPress={action as ()=>void} style={[s.action,{backgroundColor:String(color)},(disabled||(index>=2&&!g))&&s.disabled]}><Text style={s.white}>{String(icon)}</Text></TouchableOpacity>)}</View></View>})}</View></ScrollView><View style={s.filters}><Text>Showing {rows.length?start+1:0} to {Math.min(start+pageSize,rows.length)} of {rows.length}</Text><TouchableOpacity disabled={currentPage===1} onPress={()=>setPage(currentPage-1)} style={s.refresh}><Text>Previous</Text></TouchableOpacity><Text>{currentPage} / {pages}</Text><TouchableOpacity disabled={currentPage===pages} onPress={()=>setPage(currentPage+1)} style={s.refresh}><Text>Next</Text></TouchableOpacity></View>{busy!==null&&<Text style={s.help}>Updating guardian account...</Text>}</ScrollView></SafeAreaView>;
}
const widths=[55,65,135,220,65,170,110,150,190];
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f3f6fa'},body:{padding:16,width:'100%',maxWidth:1500,alignSelf:'center',paddingBottom:40},title:{fontSize:25,fontWeight:'800',color:'#174f75',marginBottom:10},help:{color:'#53657a',marginBottom:14,lineHeight:21},error:{color:'#b42318',marginVertical:10},filters:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10,marginVertical:12},refresh:{padding:12,backgroundColor:'#e2eaf3',borderRadius:7},row:{flexDirection:'row',backgroundColor:'#fff',alignItems:'stretch',minHeight:64},header:{backgroundColor:'#dbe7f5',minHeight:48},striped:{backgroundColor:'#eef0f2'},cell:{padding:10,borderRightWidth:1,borderBottomWidth:1,borderColor:'#d5dce5',textAlignVertical:'center',alignItems:'center',justifyContent:'center'},bold:{fontWeight:'700'},photo:{width:36,height:44,resizeMode:'cover'},actions:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,borderBottomWidth:1,borderColor:'#d5dce5'},action:{minWidth:34,padding:8,borderRadius:4,alignItems:'center'},white:{color:'#fff',fontWeight:'800'},disabled:{opacity:.45}});
