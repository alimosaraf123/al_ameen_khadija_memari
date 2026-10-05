import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Linking,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AcademyHeader from './AcademyHeader';
import {API_BASE,api} from '../lib/api';

function date(value:any){return String(value||'').slice(0,10);}
function routineDate(item:any){return date(item.routine_date||item.published_at||item.created_at);}
export function newestRoutineFirst(a:any,b:any){return routineDate(b).localeCompare(routineDate(a))||String(b.published_at||b.created_at||'').localeCompare(String(a.published_at||a.created_at||''));}
function RoutineImage({url}:{url:string}){
 const [aspectRatio,setAspectRatio]=useState(2);
 useEffect(()=>{
  let active=true;
  Image.getSize(url,(width,height)=>{if(active&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0)setAspectRatio(width/height);},()=>{});
  return ()=>{active=false;};
 },[url]);
 return <Image source={{uri:url}} resizeMode="contain" style={[s.routineImage,{aspectRatio}]}/>;
}
export function RoutineCard({item}:{item:any}){
 const url=/^https?:/.test(item.file_url)?item.file_url:`${API_BASE}${item.file_url}`;
 return <TouchableOpacity style={s.routineItem} onPress={()=>Linking.openURL(url)}><Text style={s.routineTitle}>{item.title||'Published Routine'}</Text><Text style={s.routineMeta}>{routineDate(item)}</Text><RoutineImage url={url}/><Text style={s.routineOpen}>Open JPG</Text></TouchableOpacity>;
}

export default function TeacherRoutineHistory(){
 const [routines,setRoutines]=useState<any[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  void api('/api/routines').then(data=>{
   if(active)setRoutines((data.routines||[]).filter((item:any)=>item.file_url).sort(newestRoutineFirst));
  }).catch(e=>{if(active)setError(e.message||'Unable to load routines.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[]);
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
  <AcademyHeader/>
  <Text style={s.heading}>Published Routines</Text>
  <Text style={s.help}>Newest routines appear first. Scroll down to view older routines.</Text>
  {loading?<ActivityIndicator color="#174f75"/>:error?<Text accessibilityRole="alert">{error}</Text>:routines.length?<View style={s.routine}>{routines.map(item=><RoutineCard key={item.id} item={item}/>)}</View>:<Text>No routine published.</Text>}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#f2f7f4'},
 content:{width:'100%',maxWidth:900,alignSelf:'center',padding:16,paddingBottom:40},
 heading:{fontSize:25,fontWeight:'900',color:'#173d2b'},
 help:{color:'#557266',marginTop:6,marginBottom:16},
 routine:{backgroundColor:'#174f75',padding:17,borderRadius:15},
 routineItem:{backgroundColor:'#fff',borderRadius:10,padding:10,marginTop:10},
 routineTitle:{color:'#173d2b',fontSize:17,fontWeight:'900'},
 routineMeta:{color:'#728077',marginTop:3},
 routineImage:{width:'100%',backgroundColor:'#fff',borderRadius:7,marginTop:8},
 routineOpen:{color:'#1768c5',marginTop:8,fontWeight:'900',textAlign:'center'}
});
