import React,{useEffect,useState} from 'react';
import {Alert,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {api} from '../lib/api';
import AcademyHeader from '../components/AcademyHeader';

export default function ClassResults(){
 const [tests,setTests]=useState<any[]>([]),[selected,setSelected]=useState<any>(null),[students,setStudents]=useState<any[]>([]);
 useEffect(()=>{api('/api/marks/published-results').then(x=>setTests(x.tests||[])).catch(e=>Alert.alert('Error',e.message));},[]);
 const open=async(id:number)=>{try{const x=await api(`/api/marks/published-results/${id}`);setSelected(x.test);setStudents(x.students||[]);}catch(e:any){Alert.alert('Error',e.message);}};
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.body}><AcademyHeader/><Text style={s.title}>Published Class Results</Text>
 {!selected?tests.map(t=><TouchableOpacity key={t.id} style={s.card} onPress={()=>open(t.id)}><Text style={s.bold}>{t.exam_name} · Class {t.class_name}</Text><Text>{t.subject_name} · Full Marks {t.full_marks} · {String(t.exam_date).slice(0,10)}</Text><Text>{t.student_count} students</Text></TouchableOpacity>):<><TouchableOpacity onPress={()=>setSelected(null)}><Text style={s.link}>← All results</Text></TouchableOpacity><Text style={s.heading}>{selected.exam_name} · Class {selected.class_name}</Text><View style={s.row}><Text style={s.sl}>Sl</Text><Text style={s.reg}>Reg.</Text><Text style={s.name}>Name</Text><Text style={s.mark}>{selected.subject_name}{'\n'}F.M.-{selected.full_marks}{'\n'}{String(selected.exam_date).slice(0,10)}</Text></View>{students.map((x,i)=><View key={x.registration_no} style={s.row}><Text style={s.sl}>{i+1}</Text><Text style={s.reg}>{x.registration_no}</Text><Text style={s.name}>{x.student_name}</Text><Text style={s.mark}>{x.obtained_marks===null?'B':Number(x.obtained_marks)}</Text></View>)}</>}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f3f6fa'},body:{maxWidth:900,width:'100%',alignSelf:'center',padding:15},title:{fontSize:26,fontWeight:'900',color:'#174a78',marginVertical:15},card:{backgroundColor:'#fff',padding:16,borderRadius:12,marginBottom:10,borderWidth:1,borderColor:'#dce5ee'},bold:{fontWeight:'900',fontSize:16,marginBottom:6},link:{color:'#1460a6',fontWeight:'800',marginVertical:12},heading:{textAlign:'center',fontWeight:'900',fontSize:20,marginBottom:10},row:{flexDirection:'row',backgroundColor:'#fff'},sl:{width:45,padding:8,borderWidth:0.5,textAlign:'center'},reg:{width:95,padding:8,borderWidth:0.5,textAlign:'center'},name:{flex:1,padding:8,borderWidth:0.5},mark:{width:120,padding:8,borderWidth:0.5,textAlign:'center'}});
