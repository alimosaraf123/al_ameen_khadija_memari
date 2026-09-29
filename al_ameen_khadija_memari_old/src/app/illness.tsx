import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AcademyHeader from '../components/AcademyHeader';
import { Field } from '../components/ui';
import { api } from '../lib/api';

export default function Illness() {
  const [registrationNo,setRegistrationNo]=useState('');
  const [student,setStudent]=useState<any>(null);
  const [records,setRecords]=useState<any[]>([]);
  const [details,setDetails]=useState('');
  const [action,setAction]=useState('');
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);

  const search=async()=>{
    if(!registrationNo.trim()) return Alert.alert('Required','Enter registration number.');
    setLoading(true);
    try{const data=await api(`/api/illness/registration/${encodeURIComponent(registrationNo.trim())}`);setStudent(data.student);setRecords(data.records||[]);}
    catch(error:any){setStudent(null);setRecords([]);Alert.alert('Not Found',error.message);}
    finally{setLoading(false);}
  };
  const save=async()=>{
    if(!student||!details.trim()) return Alert.alert('Required','Search a student and write illness/problem details.');
    setSaving(true);
    try{await api('/api/illness',{method:'POST',body:JSON.stringify({registration_no:student.registration_no,illness_details:details.trim(),action_taken:action.trim()||null})});setDetails('');setAction('');await search();Alert.alert('Reported','Student illness/problem reported.');}
    catch(error:any){Alert.alert('Error',error.message);}finally{setSaving(false);}
  };
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <AcademyHeader />
    <Text style={s.title}>Student Illness / Problem</Text>
    <Text style={s.help}>Room নির্বাচন প্রয়োজন নেই—শুধু Registration Number লিখুন।</Text>
    <View style={s.searchRow}><Field placeholder="Registration number" value={registrationNo} onChangeText={setRegistrationNo} style={s.searchInput}/><TouchableOpacity onPress={search} style={s.searchButton}><Text style={s.buttonText}>{loading?'Searching...':'Search'}</Text></TouchableOpacity></View>
    {loading&&<ActivityIndicator color="#c05a18"/>}
    {student&&<>
      <View style={s.studentCard}><Text style={s.studentName}>{student.student_name}</Text><Text style={s.meta}>Reg. {student.registration_no} · Class {student.class_name||'-'} · Room {student.room_name||'-'}</Text></View>
      <View style={s.formCard}><Field placeholder="Illness or problem details *" value={details} onChangeText={setDetails} multiline numberOfLines={3} style={s.multiline}/><Field placeholder="Action taken / medicine / referred to" value={action} onChangeText={setAction} multiline numberOfLines={2} style={s.multiline}/><TouchableOpacity disabled={saving} onPress={save} style={s.saveButton}><Text style={s.buttonText}>{saving?'Sending...':'Report Illness / Problem'}</Text></TouchableOpacity></View>
      <Text style={s.sectionTitle}>Previous Reports ({records.length})</Text>
      {records.map(record=><View key={record.id} style={s.recordCard}><Text style={s.recordTitle}>{String(record.record_date).slice(0,10)}</Text><Text style={s.recordText}>{record.illness_details}</Text>{!!record.action_taken&&<Text style={s.actionText}>Action: {record.action_taken}</Text>}<Text style={s.reporter}>By {record.reported_by_name||'User'}</Text></View>)}
    </>}
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#fff7ef'},content:{width:'100%',maxWidth:900,alignSelf:'center',padding:16,paddingBottom:45},title:{fontSize:27,fontWeight:'900',color:'#73350f',marginTop:6},help:{color:'#806a5d',marginTop:4,marginBottom:16},searchRow:{flexDirection:'row',gap:8},searchInput:{flex:1,marginBottom:0},searchButton:{backgroundColor:'#c05a18',borderRadius:9,paddingHorizontal:22,justifyContent:'center'},buttonText:{color:'#fff',fontWeight:'900',textAlign:'center'},studentCard:{backgroundColor:'#ffead8',borderRadius:13,padding:14,marginTop:14},studentName:{fontSize:18,fontWeight:'900',color:'#6b310e'},meta:{color:'#765d4e',marginTop:4},formCard:{backgroundColor:'#fff',borderRadius:15,padding:15,marginVertical:14,borderWidth:1,borderColor:'#f0ddcf'},multiline:{minHeight:72,textAlignVertical:'top'},saveButton:{backgroundColor:'#c05a18',borderRadius:9,padding:14},sectionTitle:{fontSize:18,fontWeight:'900',color:'#6c3514',marginBottom:10},recordCard:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:9,borderWidth:1,borderColor:'#f0e0d4'},recordTitle:{fontWeight:'900',color:'#8a461a'},recordText:{color:'#3e454d',marginTop:5},actionText:{color:'#17633c',marginTop:5,fontWeight:'700'},reporter:{color:'#7b8490',fontSize:12,marginTop:8}});
