import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Animated,Image,Modal,Platform,ScrollView,Text,TouchableOpacity,Pressable,StyleSheet,View} from 'react-native';
import * as Location from 'expo-location';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useLocalSearchParams} from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import {RoutineCard,newestRoutineFirst} from '../components/TeacherRoutineHistory';
import {API_BASE,api} from '../lib/api';
import {clearSession,getUser} from '../lib/auth';

const items:any[]=[];
const MISSION_LOCATION = {
  latitude: 23.186813165763375,
  longitude: 88.11163491185468,
  maxDistanceMeters: 200,
};
const LOCATION_ERROR_MSG = 'please contact- 7479020091 for submit attednance';

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function showAttendanceAlert(message: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message);
  } else {
    Alert.alert('Attendance Alert', message);
  }
}

async function getDeviceCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync().catch(() => null);
    if (!perm || perm.status !== 'granted') {
      perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
    }
    if (perm?.status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (loc?.coords && Number.isFinite(loc.coords.latitude) && Number.isFinite(loc.coords.longitude)) {
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
      }
    }
  } catch {}

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const coords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
      return coords;
    } catch {}
  }

  return null;
}
function greeting(){const h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening';}
function routineGroup(item:any){return String(item.title||'Published Routine').replace(/\s+Routine\s*$/i,'').trim()||'Other';}
function routineVersion(item:any){return String(item.published_at||item.updated_at||item.created_at||'');}
export default function Teacher(){
 const params=useLocalSearchParams<{openMore?:string}>();
 const [roomMenu,setRoomMenu]=useState(false),[examMenu,setExamMenu]=useState(false),[moreMenu,setMoreMenu]=useState(false),[teacher,setTeacher]=useState<any>(null),[routines,setRoutines]=useState<any[]>([]),[notices,setNotices]=useState<any[]>([]),[loading,setLoading]=useState(true),[routineError,setRoutineError]=useState(''),[openRoutineGroups,setOpenRoutineGroups]=useState<Record<string,boolean>>({});
 const [roomStatus,setRoomStatus]=useState<any>(null);
 const [viewedRoutineIds,setViewedRoutineIds]=useState<Record<string,string>>({}); const [availability,setAvailability]=useState('Present');const [submittingAvailability,setSubmittingAvailability]=useState(false);const blinkOpacity=useRef(new Animated.Value(1)).current;

  async function handleSetAvailability(nextStatus: 'Present' | 'Absent') {
    if (submittingAvailability) return;
    setSubmittingAvailability(true);
    try {
      const coords = await getDeviceCoordinates();
      if (!coords) {
        showAttendanceAlert(LOCATION_ERROR_MSG);
        return;
      }

      const dist = calculateDistanceMeters(
        coords.latitude,
        coords.longitude,
        MISSION_LOCATION.latitude,
        MISSION_LOCATION.longitude
      );

      if (!Number.isFinite(dist) || dist > MISSION_LOCATION.maxDistanceMeters) {
        showAttendanceAlert(LOCATION_ERROR_MSG);
        return;
      }

      const res = await api('/api/teachers/me/availability', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          status: nextStatus,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });

      setAvailability(res.status || nextStatus);
      showAttendanceAlert(
        nextStatus === 'Present'
          ? `Marked IN / PRESENT successfully (${Math.round(dist)}m from mission).`
          : `Marked OUT / ABSENT successfully (${Math.round(dist)}m from mission).`
      );
    } catch (e: any) {
      showAttendanceAlert(e?.message || LOCATION_ERROR_MSG);
    } finally {
      setSubmittingAvailability(false);
    }
  }
 const routineViewedKey=teacher?'teacher_viewed_routines_'+String(teacher.login_id||teacher.id||'unknown'):null;
 useEffect(()=>{if(params.openMore==='1')setMoreMenu(true)},[params.openMore]);
 useEffect(()=>{if(Platform.OS==='web'&&routineViewedKey){try{const raw=localStorage.getItem(routineViewedKey);setViewedRoutineIds(raw?JSON.parse(raw)||{}:{})}catch{setViewedRoutineIds({})}}},[routineViewedKey]);
 useEffect(()=>{const loop=Animated.loop(Animated.sequence([Animated.timing(blinkOpacity,{toValue:.2,duration:550,useNativeDriver:true}),Animated.timing(blinkOpacity,{toValue:1,duration:550,useNativeDriver:true})]));loop.start();return()=>loop.stop()},[blinkOpacity]);
 const markRoutineGroupViewed=(items:any[])=>{void import('../lib/pushNotifications').then(m=>m.clearNotificationBadge()).catch(()=>{});const next={...viewedRoutineIds};items.forEach(item=>{next[String(item.id)]=routineVersion(item)});setViewedRoutineIds(next);if(Platform.OS==='web'&&routineViewedKey){try{localStorage.setItem(routineViewedKey,JSON.stringify(next))}catch{}}};
 useEffect(()=>{
  let active=true;
  void Promise.allSettled([api('/api/teachers/me'),api('/api/routines'),api('/api/notices'),api('/api/attendance/my-room-status')]).then(([profile,routineData,noticeData,roomStatusData])=>{
   if(!active)return;
   if(profile.status==='fulfilled'){setTeacher(profile.value.teacher);void api('/api/teachers/me/availability?date='+new Date().toISOString().slice(0,10)).then(x=>setAvailability(x.status||'Present')).catch(()=>{})}
   if(routineData.status==='fulfilled')setRoutines((routineData.value.routines||[]).filter((item:any)=>item.file_url).sort(newestRoutineFirst));
   else setRoutineError(routineData.reason?.message||'Unable to load routines.');
   if(noticeData.status==='fulfilled')setNotices((noticeData.value.notices||[]).filter((notice:any)=>String(notice.notice_type||'').toLowerCase()!=='routine'));
   if(roomStatusData.status==='fulfilled'&&roomStatusData.value?.success)setRoomStatus(roomStatusData.value);
   setLoading(false);
  });
  return()=>{active=false;};
 },[]);
 useEffect(()=>{let active=true;const refresh=()=>{void api('/api/routines').then(data=>{if(active)setRoutines((data.routines||[]).filter((item:any)=>item.file_url).sort(newestRoutineFirst))}).catch(()=>{});void api('/api/attendance/my-room-status').then(res=>{if(active&&res?.success)setRoomStatus(res);}).catch(()=>{});};const timer=setInterval(refresh,30000);return()=>{active=false;clearInterval(timer)}},[]);
 const groupedRoutines=useMemo(()=>{const groups:Record<string,any[]>={};routines.forEach(item=>{const key=routineGroup(item);(groups[key]||(groups[key]=[])).push(item)});return Object.entries(groups)},[routines]);
 const name=teacher?.name||teacher?.full_name||(getUser as any)?.full_name||'Teacher';const first=String(name).trim().split(/\s+/)[0];
 const photo=teacher?.photo_url?(/^https?:/.test(teacher.photo_url)?teacher.photo_url:`${API_BASE}${teacher.photo_url}`):null;
 const recentNotice=notices.find((n:any)=>Date.now()-new Date(n.published_at||n.created_at||0).getTime()<48*60*60*1000);
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}><AcademyHeader profilePhoto={photo||undefined} hideDefaultActions extraActions={<><TouchableOpacity style={[s.headerItem,{backgroundColor:'#157347'}]} onPress={()=>router.push(roomStatus?.room_name ? { pathname: '/attendance', params: { room: roomStatus.room_name } } : '/attendance')}><Text style={s.headerText}>Atte.</Text></TouchableOpacity><TouchableOpacity style={[s.headerItem,{backgroundColor:'#2369b3'}]} onPress={()=>setExamMenu(true)}><Text style={s.headerText}>Exam</Text></TouchableOpacity><TouchableOpacity style={[s.headerItem,{backgroundColor:'#c56a14'}]} onPress={()=>setRoomMenu(true)}><Text style={s.headerText}>Room</Text></TouchableOpacity><TouchableOpacity style={[s.headerItem,{backgroundColor:'#475569'}]} onPress={()=>setMoreMenu(true)}><Text style={s.headerText}>More...</Text></TouchableOpacity>{items.map(([title,path,color])=><TouchableOpacity key={title} style={[s.headerItem,{backgroundColor:color}]} onPress={()=>router.push(path as any)}><Text style={s.headerText}>{title}</Text></TouchableOpacity>)}</>}/>
 <View style={s.profile}><View style={{flex:1}}><Text style={s.greeting}>{greeting()}, {first}</Text><Text style={s.title}>{first}'s Dashboard</Text></View></View><View style={s.availability}><Text style={s.availabilityLabel}>Mission Status</Text><TouchableOpacity disabled={submittingAvailability} style={[s.availabilityButton,availability==='Present'&&s.availabilityIn,submittingAvailability&&{opacity:0.6}]} onPress={()=>handleSetAvailability('Present')}><Text style={s.availabilityText}>{submittingAvailability?'CHECKING...':'IN / PRESENT'}</Text></TouchableOpacity><TouchableOpacity disabled={submittingAvailability} style={[s.availabilityButton,availability==='Absent'&&s.availabilityOut,submittingAvailability&&{opacity:0.6}]} onPress={()=>handleSetAvailability('Absent')}><Text style={s.availabilityText}>{submittingAvailability?'CHECKING...':'OUT / ABSENT'}</Text></TouchableOpacity></View>{recentNotice&&<TouchableOpacity style={s.noticeBanner} onPress={()=>router.push('/notices')}><Text style={s.noticeBannerTitle}>New Notice</Text><Text style={s.noticeBannerText}>{recentNotice.title}</Text><Text style={s.newBlink}>NEW</Text></TouchableOpacity>}
 {roomStatus?.has_room && (
   roomStatus.submitted ? (
     <View style={s.roomStatusCardSubmitted}>
       <View style={s.roomStatusHeader}>
         <View style={s.badgeSuccess}><Text style={s.badgeSuccessText}>✓ ALREADY SUBMITTED</Text></View>
         <Text style={s.roomCardTitle}>Room {roomStatus.room_name} Attendance</Text>
       </View>
       <Text style={s.roomCardSubtitle}>আজকের ইভনিং রুম অ্যাটেনডেন্স ইতিমধ্যে জমা দেওয়া হয়েছে।</Text>
       <Text style={s.roomCardTime}>
         🕒 Submission Time: <Text style={{fontWeight: '800', color: '#166534'}}>{roomStatus.submission?.submitted_at_ist || 'Today'}</Text>
         {roomStatus.submission?.submitted_by_name ? ` · by ${roomStatus.submission.submitted_by_name}` : ''}
         {roomStatus.submission?.last_updated_by_name && roomStatus.submission.updated_at_ist !== roomStatus.submission.submitted_at_ist ? `\n✏️ Last modified: ${roomStatus.submission.updated_at_ist}` : ''}
       </Text>
       <View style={s.roomCountRow}>
         <View style={s.roomCountPill}><Text style={s.roomCountLabel}>Total: <Text style={s.roomCountVal}>{roomStatus.submission?.total_students ?? 0}</Text></Text></View>
         <View style={[s.roomCountPill, {backgroundColor: '#dcfce7'}]}><Text style={[s.roomCountLabel, {color: '#15803d'}]}>Present: <Text style={s.roomCountVal}>{roomStatus.submission?.present_count ?? 0}</Text></Text></View>
         <View style={[s.roomCountPill, {backgroundColor: '#fee2e2'}]}><Text style={[s.roomCountLabel, {color: '#b91c1c'}]}>Absent: <Text style={s.roomCountVal}>{roomStatus.submission?.absent_count ?? 0}</Text></Text></View>
       </View>
       <TouchableOpacity
         style={s.editAttendanceBtn}
         onPress={() => router.push({ pathname: '/attendance', params: { room: roomStatus.room_name } })}
       >
         <Text style={s.editAttendanceBtnText}>✏️ View / Edit Attendance (প্রয়োজনে পরিবর্তন করুন)</Text>
       </TouchableOpacity>
     </View>
   ) : (
     <View style={s.roomStatusCardPending}>
       <View style={s.roomStatusHeader}>
         <View style={s.badgePending}><Text style={s.badgePendingText}>⚠️ PENDING FOR TODAY</Text></View>
         <Text style={s.roomCardTitle}>Room {roomStatus.room_name} Attendance</Text>
       </View>
       <Text style={s.roomCardSubtitlePending}>আজকের ইভনিং রুম অ্যাটেনডেন্স এখনো জমা দেওয়া হয়নি। অনুগ্রহ করে এখনই অ্যাটেনডেন্স নিন।</Text>
       <TouchableOpacity
         style={s.submitAttendanceBtn}
         onPress={() => router.push({ pathname: '/attendance', params: { room: roomStatus.room_name } })}
       >
         <Text style={s.submitAttendanceBtnText}>📝 Submit Room Attendance Now</Text>
       </TouchableOpacity>
     </View>
   )
 )}
  {loading?<ActivityIndicator color="#17643f"/>:<>
 <View style={s.routine}><Text style={s.sectionLabel}>CLASS-WISE ROUTINES</Text>{routineError?<Text style={s.noRoutine}>{routineError}</Text>:routines.length?<ScrollView nestedScrollEnabled style={{maxHeight:600}} contentContainerStyle={{paddingBottom:4}}>{groupedRoutines.map(([group,items])=>{const open=!!openRoutineGroups[group],isNew=items.some(item=>viewedRoutineIds[String(item.id)]!==routineVersion(item));return <View key={group} style={s.routineGroup}><TouchableOpacity style={s.routineAccordionHeader} onPress={()=>{setOpenRoutineGroups(current=>({...current,[group]:!current[group]}));markRoutineGroupViewed(items)}}><Text style={s.routineGroupTitle}>{group}</Text><View style={s.routineGroupRight}>{isNew&&<Animated.Text style={[s.routineNew,{opacity:blinkOpacity}]}>NEW</Animated.Text>}<Text style={s.routineChevron}>{open?'−':'+'}</Text></View></TouchableOpacity>{open&&items.map(item=><RoutineCard key={item.id} item={item}/>)}</View>})}</ScrollView>:<Text style={s.noRoutine}>No routine published.</Text>}</View>

 </>}
 <View style={s.grid}>{items.map(([title,path,color])=><TouchableOpacity key={title} style={[s.card,{borderLeftColor:color}]} onPress={()=>router.push(path as any)}><Text style={[s.cardText,{color}]}>{title}</Text><Text style={s.open}>Open →</Text></TouchableOpacity>)}</View>

 </ScrollView><Modal visible={examMenu} transparent animationType="fade" onRequestClose={()=>setExamMenu(false)}><Pressable style={s.modalBackdrop} onPress={()=>setExamMenu(false)}><View style={s.modal} onStartShouldSetResponder={()=>true}><View style={s.modalHead}><Text style={s.modalTitle}>Exam</Text><TouchableOpacity onPress={()=>setExamMenu(false)}><Text style={s.close}>X</Text></TouchableOpacity></View>{[['Marks Entry','/marks','#2369b3'],['OMR Exam & Evaluation','/omr-evaluation','#0F52BA'],['Terminal Exam','/terminal-exams','#7b4ba5'],['Class Results','/class-results','#16856b']].map(([label,path,color])=><Pressable key={path} style={({pressed})=>[s.modalItem,{borderLeftColor:color,backgroundColor:color+'18'},pressed&&s.modalItemActive]} onPress={()=>{setExamMenu(false);router.push(path as any)}}><Text style={s.modalText}>{label}</Text></Pressable>)}</View></Pressable></Modal><Modal visible={moreMenu} transparent animationType='fade' onRequestClose={()=>setMoreMenu(false)}><Pressable style={s.modalBackdrop} onPress={()=>setMoreMenu(false)}><View style={s.modal} onStartShouldSetResponder={()=>true}><View style={s.modalHead}><Text style={s.modalTitle}>More Menu</Text><TouchableOpacity onPress={()=>setMoreMenu(false)}><Text style={s.close}>X</Text></TouchableOpacity></View><Pressable style={[s.modalItem,{borderLeftColor:'#783453',backgroundColor:'#78345318'}]} onPress={()=>{setMoreMenu(false);router.push('/notices')}}><Text style={s.modalText}>Notice</Text></Pressable><Pressable style={[s.modalItem,{borderLeftColor:'#17643f',backgroundColor:'#17643f18'}]} onPress={()=>{setMoreMenu(false);router.push('/teacher-settings')}}><Text style={s.modalText}>Profile</Text></Pressable><Pressable style={[s.modalItem,{borderLeftColor:'#6840a5',backgroundColor:'#6840a518'}]} onPress={()=>{setMoreMenu(false);router.push('/settings')}}><Text style={s.modalText}>Settings</Text></Pressable><Pressable style={[s.modalItem,{borderLeftColor:'#b52d3a',backgroundColor:'#b52d3a18'}]} onPress={async()=>{setMoreMenu(false);await clearSession();router.replace('/')}}><Text style={s.modalText}>Logout</Text></Pressable></View></Pressable></Modal><Modal visible={roomMenu} transparent animationType="fade" onRequestClose={()=>setRoomMenu(false)}><Pressable style={s.modalBackdrop} onPress={()=>setRoomMenu(false)}><View style={s.modal} onStartShouldSetResponder={()=>true}><View style={s.modalHead}><Text style={s.modalTitle}>Room</Text><TouchableOpacity onPress={()=>setRoomMenu(false)}><Text style={s.close}>X</Text></TouchableOpacity></View>{[['Room Problems','/problems','#c56a14'],['Student Behaviour','/behavior','#754bbd'],['Student Illness / Problem','/illness','#c05a18']].map(([label,path,color])=><Pressable key={path} style={({pressed})=>[s.modalItem,{borderLeftColor:color,backgroundColor:color+'18'},pressed&&s.modalItemActive]} onPress={()=>{setRoomMenu(false);router.push(path as any)}}><Text style={s.modalText}>{label}</Text></Pressable>)}</View></Pressable></Modal></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f2f7f4'},content:{width:'100%',maxWidth:900,alignSelf:'center',padding:16,paddingBottom:40},profile:{flexDirection:'row',alignItems:'center',gap:13,marginVertical:10},photo:{width:62,height:62,borderRadius:31,borderWidth:2,borderColor:'#91b6a1'},avatar:{backgroundColor:'#17643f',alignItems:'center',justifyContent:'center'},initial:{color:'#fff',fontSize:26,fontWeight:'900'},greeting:{color:'#557266',fontWeight:'700'},title:{fontSize:25,fontWeight:'900',color:'#173d2b',marginTop:2},routine:{backgroundColor:'#174f75',padding:17,borderRadius:15,marginBottom:12},routineGroup:{marginTop:10},routineAccordionHeader:{backgroundColor:'#fff',borderRadius:10,padding:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},routineGroupTitle:{color:'#173d2b',fontSize:17,fontWeight:'900'},routineGroupRight:{flexDirection:'row',alignItems:'center',gap:10},routineNew:{color:'#c62828',fontWeight:'900',fontSize:12},routineChevron:{color:'#1768c5',fontSize:25,fontWeight:'900',lineHeight:25},sectionLabel:{color:'#bfe1f4',fontSize:11,fontWeight:'900'},routineItem:{backgroundColor:'#fff',borderRadius:10,padding:10,marginTop:10},routineTitle:{color:'#173d2b',fontSize:17,fontWeight:'900'},routineMeta:{color:'#728077',marginTop:3},routineImage:{width:'100%',backgroundColor:'#fff',borderRadius:7,marginTop:8},routineOpen:{color:'#1768c5',marginTop:8,fontWeight:'900',textAlign:'center'},noRoutine:{color:'#fff',marginTop:10},meta:{color:'#728077',marginTop:4},open:{color:'#2870a8',marginTop:9,fontWeight:'800'},availability:{flexDirection:'row',alignItems:'center',gap:5,marginVertical:8,flexWrap:'nowrap'},availabilityLabel:{fontWeight:'900',color:'#365b4b',marginRight:1,flexShrink:1,fontSize:11},availabilityButton:{flex:1,paddingHorizontal:2,paddingVertical:8,borderRadius:8,backgroundColor:'#dbe7df',alignItems:'center',minWidth:0},availabilityIn:{backgroundColor:'#198754'},availabilityOut:{backgroundColor:'#dc3545'},availabilityText:{fontWeight:'900',color:'#fff',fontSize:10,letterSpacing:-0.3},noticeBanner:{flex:1,backgroundColor:"#fff6d8",borderWidth:1,borderColor:"#e0ad24",borderRadius:10,padding:10,marginVertical:8,position:"relative"},noticeBannerTitle:{fontWeight:"900",color:"#9a6500"},noticeBannerText:{fontWeight:"800",color:"#263d54",marginTop:3},newBlink:{position:"absolute",right:12,top:10,color:"#c62828",fontWeight:"900"},noticeWrap:{backgroundColor:'#fff',padding:15,borderRadius:15,marginBottom:15,borderWidth:1,borderColor:'#dbe6df'},sectionRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},noticeHeading:{fontSize:18,fontWeight:'900',color:'#783453'},notice:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:'#edf0ee'},noticeTitle:{fontWeight:'800',color:'#273b32'},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},card:{width:'48%',minWidth:240,flexGrow:1,backgroundColor:'#fff',borderRadius:14,borderLeftWidth:6,padding:18,elevation:2},cardText:{fontSize:17,fontWeight:'900'},modalBackdrop:{flex:1,backgroundColor:"rgba(0,0,0,.5)",justifyContent:"center",alignItems:"center"},modal:{width:"90%",maxWidth:520,backgroundColor:"#fff",borderRadius:14,padding:16},modalHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:10},modalTitle:{fontSize:20,fontWeight:"900",color:"#173d2b"},close:{fontSize:20,fontWeight:"900"},modalItem:{padding:15,borderWidth:1,borderLeftWidth:6,borderColor:"#dbe6df",borderRadius:9,marginVertical:5},modalItemActive:{backgroundColor:"#dbeafe",borderColor:"#1768c5"},modalText:{fontSize:16,fontWeight:"900",color:"#263d54"},headerItem:{paddingHorizontal:9,paddingVertical:9,borderRadius:7},headerText:{color:"#fff",fontSize:11,fontWeight:"800"},logout:{backgroundColor:'#b52d3a',padding:14,borderRadius:10,marginTop:18},logoutText:{color:'#fff',textAlign:'center',fontWeight:'800'},
roomStatusCardSubmitted:{backgroundColor:'#f0fdf4',borderWidth:1.5,borderColor:'#22c55e',borderRadius:14,padding:14,marginVertical:10,elevation:2},
roomStatusCardPending:{backgroundColor:'#fffbeb',borderWidth:1.5,borderColor:'#f59e0b',borderRadius:14,padding:14,marginVertical:10,elevation:2},
roomStatusHeader:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,marginBottom:6},
badgeSuccess:{backgroundColor:'#16a34a',paddingHorizontal:8,paddingVertical:4,borderRadius:6},
badgeSuccessText:{color:'#fff',fontWeight:'900',fontSize:11,letterSpacing:0.3},
badgePending:{backgroundColor:'#d97706',paddingHorizontal:8,paddingVertical:4,borderRadius:6},
badgePendingText:{color:'#fff',fontWeight:'900',fontSize:11,letterSpacing:0.3},
roomCardTitle:{fontSize:16,fontWeight:'900',color:'#1e293b'},
roomCardSubtitle:{color:'#15803d',fontWeight:'700',fontSize:13,marginBottom:4},
roomCardSubtitlePending:{color:'#b45309',fontWeight:'700',fontSize:13,marginBottom:10},
roomCardTime:{color:'#475569',fontSize:12,lineHeight:18,marginBottom:10},
roomCountRow:{flexDirection:'row',gap:8,marginBottom:12,flexWrap:'wrap'},
roomCountPill:{backgroundColor:'#e2e8f0',paddingHorizontal:12,paddingVertical:5,borderRadius:8},
roomCountLabel:{fontSize:12,fontWeight:'700',color:'#334155'},
roomCountVal:{fontWeight:'900'},
editAttendanceBtn:{backgroundColor:'#1d4ed8',paddingVertical:10,paddingHorizontal:14,borderRadius:8,alignItems:'center'},
editAttendanceBtnText:{color:'#fff',fontWeight:'900',fontSize:13},
submitAttendanceBtn:{backgroundColor:'#047857',paddingVertical:11,paddingHorizontal:14,borderRadius:8,alignItems:'center'},
submitAttendanceBtnText:{color:'#fff',fontWeight:'900',fontSize:14}
});




