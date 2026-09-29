import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';

import AcademyHeader from '../components/AcademyHeader';
import { Field } from '../components/ui';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';

export default function Routines() {
  const [list,setList]=useState<any[]>([]);
  const [title,setTitle]=useState('');
  const [text,setText]=useState('');
  const [date,setDate]=useState('');
  const [canPublish,setCanPublish]=useState(false);
  const [loading,setLoading]=useState(true);

  const load=async()=>{setLoading(true);try{const data=await api('/api/routines');setList(data.routines||[]);}catch(error:any){Alert.alert('Error',error.message);}finally{setLoading(false);}};
  useEffect(()=>{(async()=>{const user=await getUser<any>();setCanPublish(user?.role==='admin'||user?.role==='super_admin');await load();})();},[]);
  const add=async()=>{if(!title.trim()&&!text.trim())return Alert.alert('Required','Enter routine title or details.');try{await api('/api/routines',{method:'POST',body:JSON.stringify({title:title.trim()||null,routine_text:text.trim()||null,routine_date:date||null})});setTitle('');setText('');setDate('');await load();Alert.alert('Published','Routine published.');}catch(error:any){Alert.alert('Error',error.message);}};
  const printRoutine=async(routine:any)=>{const html=`<h2>${routine.title||'Routine'}</h2><p>${routine.routine_date?String(routine.routine_date).slice(0,10):''}</p><div style="white-space:pre-wrap;font-size:16px">${String(routine.routine_text||'').replace(/</g,'&lt;')}</div>`;await Print.printAsync({html});};

  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <AcademyHeader />
    <Text style={s.title}>Routine</Text>
    <Text style={s.help}>{canPublish?'Admin can publish routines. Teachers will receive view-only access.':'Routine is view only for Teacher accounts.'}</Text>
    {canPublish&&<View style={s.formCard}><Text style={s.sectionTitle}>Publish Routine</Text><Field placeholder="Title" value={title} onChangeText={setTitle}/><Field placeholder="Date YYYY-MM-DD (optional)" value={date} onChangeText={setDate}/><Field placeholder="Routine details" value={text} onChangeText={setText} multiline numberOfLines={5} style={s.multiline}/><TouchableOpacity onPress={add} style={s.publishButton}><Text style={s.buttonText}>Publish Routine</Text></TouchableOpacity></View>}
    <Text style={s.sectionTitle}>Published Routines ({list.length})</Text>
    {loading?<ActivityIndicator color="#39758e"/>:list.length===0?<View style={s.empty}><Text style={s.emptyText}>No routine published.</Text></View>:list.map(routine=><View key={routine.id} style={s.card}><Text style={s.cardTitle}>{routine.title||'Routine'}</Text><Text style={s.date}>{routine.routine_date?String(routine.routine_date).slice(0,10):''}</Text><Text style={s.body}>{routine.routine_text||''}</Text><TouchableOpacity onPress={()=>printRoutine(routine)} style={s.printButton}><Text style={s.printText}>Print Routine</Text></TouchableOpacity></View>)}
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f2f7f8'},content:{width:'100%',maxWidth:900,alignSelf:'center',padding:16,paddingBottom:45},title:{fontSize:27,fontWeight:'900',color:'#245265',marginTop:6},help:{color:'#647984',marginTop:4,marginBottom:16},formCard:{backgroundColor:'#fff',borderRadius:15,padding:15,marginBottom:22,borderWidth:1,borderColor:'#d8e6e9'},sectionTitle:{fontSize:18,fontWeight:'900',color:'#2a5262',marginBottom:11},multiline:{minHeight:110,textAlignVertical:'top'},publishButton:{backgroundColor:'#39758e',borderRadius:9,padding:14},buttonText:{color:'#fff',fontWeight:'900',textAlign:'center'},card:{backgroundColor:'#fff',borderRadius:14,padding:15,marginBottom:10,borderWidth:1,borderColor:'#dce7ea'},cardTitle:{fontSize:17,fontWeight:'900',color:'#254d5e'},date:{color:'#71828a',fontSize:12,marginTop:4},body:{color:'#37474f',lineHeight:21,marginTop:10},printButton:{borderWidth:1,borderColor:'#39758e',borderRadius:8,padding:10,marginTop:12},printText:{color:'#39758e',fontWeight:'900',textAlign:'center'},empty:{backgroundColor:'#fff',padding:24,borderRadius:12},emptyText:{color:'#72828a',textAlign:'center'}});
