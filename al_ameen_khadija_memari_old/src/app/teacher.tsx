import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,ScrollView,Text,TouchableOpacity,StyleSheet,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import {API_BASE,api} from '../lib/api';
import {clearSession,getUser} from '../lib/auth';

const items:any[]=[
 ['Evening Room Attendance','/attendance','#157347'],['Room Problems','/problems','#c56a14'],
 ['Student Behaviour','/behavior','#754bbd'],['Student Illness / Problem','/illness','#c05a18'],
 ['Marks Entry','/marks','#2369b3'],['Terminal Exam','/terminal-exams','#7b4ba5'],['Class Results','/class-results','#16856b'],
 ['Teacher Login Security','/teacher-security','#4d596b'],
];
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';}
function date(value:any){return String(value||'').slice(0,10);}
export default function Teacher(){
 const [teacher,setTeacher]=useState<any>(null),[routine,setRoutine]=useState<any>(null),[notices,setNotices]=useState<any[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{void(async()=>{try{const [profile,routineData,noticeData]=await Promise.all([api('/api/teachers/me'),api('/api/routines'),api('/api/notices')]);setTeacher(profile.teacher);setRoutine(routineData.routines?.[0]||null);setNotices((noticeData.notices||[]).slice(0,4));}finally{setLoading(false);}})();},[]);
 const name=teacher?.name||teacher?.full_name||(getUser as any)?.full_name||'Teacher';const first=String(name).trim().split(/\s+/)[0];
 const photo=teacher?.photo_url?(/^https?:/.test(teacher.photo_url)?teacher.photo_url:`${API_BASE}${teacher.photo_url}`):null;
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}><AcademyHeader/>
 <View style={s.profile}>{photo?<Image source={{uri:photo}} style={s.photo}/>:<View style={[s.photo,s.avatar]}><Text style={s.initial}>{first.charAt(0)}</Text></View>}<View style={{flex:1}}><Text style={s.greeting}>{greeting()}, {first}</Text><Text style={s.title}>{first}'s Dashboard</Text></View></View>
 {loading?<ActivityIndicator color="#17643f"/>:<>
 <TouchableOpacity style={s.routine} onPress={()=>router.push('/routines')}><Text style={s.sectionLabel}>LATEST ROUTINE</Text><Text style={s.routineTitle}>{routine?.title||'No routine published'}</Text>{routine&&<Text style={s.meta}>{date(routine.routine_date||routine.published_at)}</Text>}<Text style={s.open}>View all routines →</Text></TouchableOpacity>
 <TouchableOpacity style={s.noticeWrap} onPress={()=>router.push('/notices')}><View style={s.sectionRow}><Text style={s.noticeHeading}>Current Notices</Text><Text style={s.open}>View all →</Text></View>{notices.length?notices.map(n=><View key={n.id} style={s.notice}><Text style={s.noticeTitle}>{n.title}</Text><Text style={s.meta}>{n.notice_type||'Notice'} · {date(n.published_at)}</Text></View>):<Text style={s.meta}>No current notice.</Text>}</TouchableOpacity>
 </>}
 <View style={s.grid}>{items.map(([title,path,color])=><TouchableOpacity key={title} style={[s.card,{borderLeftColor:color}]} onPress={()=>router.push(path as any)}><Text style={[s.cardText,{color}]}>{title}</Text><Text style={s.open}>Open →</Text></TouchableOpacity>)}</View>
 <TouchableOpacity style={s.logout} onPress={async()=>{await clearSession();router.replace('/');}}><Text style={s.logoutText}>Logout</Text></TouchableOpacity>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f2f7f4'},content:{width:'100%',maxWidth:900,alignSelf:'center',padding:16,paddingBottom:40},profile:{flexDirection:'row',alignItems:'center',gap:13,marginVertical:10},photo:{width:62,height:62,borderRadius:31,borderWidth:2,borderColor:'#91b6a1'},avatar:{backgroundColor:'#17643f',alignItems:'center',justifyContent:'center'},initial:{color:'#fff',fontSize:26,fontWeight:'900'},greeting:{color:'#557266',fontWeight:'700'},title:{fontSize:25,fontWeight:'900',color:'#173d2b',marginTop:2},routine:{backgroundColor:'#174f75',padding:17,borderRadius:15,marginBottom:12},sectionLabel:{color:'#bfe1f4',fontSize:11,fontWeight:'900'},routineTitle:{color:'#fff',fontSize:19,fontWeight:'900',marginTop:5},meta:{color:'#728077',marginTop:4},open:{color:'#2870a8',marginTop:9,fontWeight:'800'},noticeWrap:{backgroundColor:'#fff',padding:15,borderRadius:15,marginBottom:15,borderWidth:1,borderColor:'#dbe6df'},sectionRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},noticeHeading:{fontSize:18,fontWeight:'900',color:'#783453'},notice:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#edf0ee'},noticeTitle:{fontWeight:'800',color:'#273b32'},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},card:{width:'48%',minWidth:240,flexGrow:1,backgroundColor:'#fff',borderRadius:14,borderLeftWidth:6,padding:18,elevation:2},cardText:{fontSize:17,fontWeight:'900'},logout:{backgroundColor:'#b52d3a',padding:14,borderRadius:10,marginTop:18},logoutText:{color:'#fff',textAlign:'center',fontWeight:'800'}});
