import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Linking,Modal,ScrollView,Text,TouchableOpacity,Pressable,StyleSheet,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import {API_BASE,api} from '../lib/api';
import {clearSession,getUser} from '../lib/auth';

const items:any[]=[];
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';}
function date(value:any){return String(value||'').slice(0,10);}
export default function Teacher(){
 const [roomMenu,setRoomMenu]=useState(false),[examMenu,setExamMenu]=useState(false),[teacher,setTeacher]=useState<any>(null),[routines,setRoutines]=useState<any[]>([]),[notices,setNotices]=useState<any[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{void(async()=>{try{const [profile,routineData,noticeData]=await Promise.all([api('/api/teachers/me'),api('/api/routines'),api('/api/notices')]);setTeacher(profile.teacher);setRoutines((routineData.routines||[]).filter((item:any)=>item.file_url));setNotices(noticeData.notices||[]);}finally{setLoading(false);}})();},[]);
 const name=teacher?.name||teacher?.full_name||(getUser as any)?.full_name||'Teacher';const first=String(name).trim().split(/\s+/)[0];
 const photo=teacher?.photo_url?(/^https?:/.test(teacher.photo_url)?teacher.photo_url:`${API_BASE}${teacher.photo_url}`):null;
 const recentNotice=notices.find((n:any)=>Date.now()-new Date(n.published_at||n.created_at||0).getTime()<48*60*60*1000);
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}><AcademyHeader extraActions={<><TouchableOpacity style={[s.headerItem,{backgroundColor:'#174f75'}]} onPress={()=>router.push('/routines')}><Text style={s.headerText}>Routine</Text></TouchableOpacity><TouchableOpacity style={[s.headerItem,{backgroundColor:'#783453'}]} onPress={()=>router.push('/notices')}><Text style={s.headerText}>Notice</Text></TouchableOpacity><TouchableOpacity style={[s.headerItem,{backgroundColor:'#2369b3'}]} onPress={()=>setExamMenu(true)}><Text style={s.headerText}>Exam</Text></TouchableOpacity><TouchableOpacity style={[s.headerItem,{backgroundColor:'#c56a14'}]} onPress={()=>setRoomMenu(true)}><Text style={s.headerText}>Room</Text></TouchableOpacity>{items.map(([title,path,color])=><TouchableOpacity key={title} style={[s.headerItem,{backgroundColor:color}]} onPress={()=>router.push(path as any)}><Text style={s.headerText}>{title}</Text></TouchableOpacity>)}</>}/>
 <View style={s.profile}>{photo?<Image source={{uri:photo}} style={s.photo}/>:<View style={[s.photo,s.avatar]}><Text style={s.initial}>{first.charAt(0)}</Text></View>}<View style={{flex:1}}><Text style={s.greeting}>{greeting()}, {first}</Text><Text style={s.title}>{first}'s Dashboard</Text></View></View>{recentNotice&&<TouchableOpacity style={s.noticeBanner} onPress={()=>router.push('/notices')}><Text style={s.noticeBannerTitle}>New Notice</Text><Text style={s.noticeBannerText}>{recentNotice.title}</Text><Text style={s.newBlink}>NEW</Text></TouchableOpacity>}
 {loading?<ActivityIndicator color="#17643f"/>:<><View style={s.noticeWrap}><Text style={s.noticeHeading}>Latest Notices</Text>{notices.slice(0,3).map(n=><TouchableOpacity key={n.id} style={s.notice} onPress={()=>router.push('/notices')}><Text style={s.noticeTitle}>{n.title}</Text><Text style={s.meta}>{n.notice_type||'Notice'} ? {date(n.published_at)}</Text></TouchableOpacity>)}{notices.length===0&&<Text style={s.meta}>No current notice.</Text>}</View>
