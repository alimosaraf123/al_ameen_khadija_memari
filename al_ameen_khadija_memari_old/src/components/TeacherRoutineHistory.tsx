import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
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
 const [expanded,setExpanded]=useState(false);
 const [aspectRatio,setAspectRatio]=useState(2);
 useEffect(()=>{Image.getSize(url,(width,height)=>{if(width>0&&height>0)setAspectRatio(width/height);},()=>{});},[url]);
 return <View style={s.routineItem}><Text style={s.routineTitle}>{item.title||'Published Routine'}</Text><Text style={s.routineMeta}>{routineDate(item)}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Open routine image" onPress={()=>setExpanded(true)}><RoutineImage url={url}/></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={s.openButton} onPress={()=>setExpanded(true)}><Text style={s.routineOpen}>Open JPG</Text></TouchableOpacity><Modal visible={expanded} transparent animationType="fade" onRequestClose={()=>setExpanded(false)}><Pressable style={s.imageBackdrop} onPress={()=>setExpanded(false)}><View style={s.imageModal} onStartShouldSetResponder={()=>true}><View style={s.imageModalHeader}><Text style={s.imageModalTitle}>{item.title||'Published Routine'}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close routine image" onPress={()=>setExpanded(false)} style={s.closeButton}><Text style={s.closeText}>X</Text></TouchableOpacity></View><Image source={{uri:url}} resizeMode="contain" style={[s.expandedImage,{aspectRatio}]}/></View></Pressable></Modal></View>;
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
 openButton:{marginTop:2},
 routineOpen:{color:'#1768c5',marginTop:8,fontWeight:'900',textAlign:'center'},
 imageBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'center',alignItems:'center',padding:12},
 imageModal:{width:'96%',height:'92%',maxWidth:1200,backgroundColor:'#fff',borderRadius:12,padding:10},
 imageModalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6},
 imageModalTitle:{flex:1,fontSize:17,fontWeight:'900',color:'#173d2b'},
 closeButton:{backgroundColor:'#b52d3a',borderRadius:7,paddingHorizontal:13,paddingVertical:7},
 closeText:{color:'#fff',fontWeight:'900',fontSize:16},
 expandedImage:{width:'100%',height:'100%',flex:1,backgroundColor:'#f3f4f6',borderRadius:7}
});
