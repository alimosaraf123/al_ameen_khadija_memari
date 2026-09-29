import React,{useEffect,useState} from 'react';
import {ScrollView,Text,TouchableOpacity,Alert,StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {api} from '../lib/api';
import {Field,Button,Card,H1} from '../components/ui';
import {Select} from '../components/StudentDirectory';
export default function Attendance(){
 const [rooms,setRooms]=useState<any[]>([]),[roomNumber,setRoomNumber]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[students,setStudents]=useState<any[]>([]);
 useEffect(()=>{api('/api/rooms').then(d=>setRooms(d.rooms||[])).catch(e=>Alert.alert('Error',e.message));},[]);
 const load=async()=>{if(!roomNumber)return Alert.alert('Required','Select a room number first');try{const d=await api('/api/attendance/room/'+encodeURIComponent(roomNumber)+'?date='+encodeURIComponent(date));setStudents(d.students||[]);}catch(e:any){Alert.alert('Error',e.message)}};
 const toggle=(id:number)=>setStudents(students.map(s=>s.id===id?{...s,status:s.status==='present'?'absent':'present'}:s));
 const save=async()=>{try{await api('/api/attendance/batch',{method:'POST',body:JSON.stringify({room_number:roomNumber,attendance_date:date,entries:students.map(s=>({student_id:s.id,status:s.status,remarks:s.remarks||null}))})});Alert.alert('Saved','Attendance saved');}catch(e:any){Alert.alert('Error',e.message)}};
 return <SafeAreaView style={{flex:1,backgroundColor:'#f3f6f9'}}><ScrollView contentContainerStyle={{padding:16}}><H1>Attendance</H1><Select label="Room number" value={roomNumber} onChange={setRoomNumber} options={[{value:'',label:'Select room number'},...rooms.map(r=>({value:String(r.room_name),label:String(r.room_name)}))]}/><Field placeholder="YYYY-MM-DD" value={date} onChangeText={setDate}/><Button title="Load Students" onPress={load}/>{students.map(s=><Card key={s.id}><Text style={{fontWeight:'800'}}>{s.student_name}</Text><Text>{s.class_name||''} | Roll {s.roll_no||'-'}</Text><TouchableOpacity style={[st.badge,s.status==='absent'&&st.absent]} onPress={()=>toggle(s.id)}><Text style={{color:'#fff',fontWeight:'700'}}>{String(s.status).toUpperCase()}</Text></TouchableOpacity></Card>)}{students.length>0&&<Button title="Save Attendance" onPress={save}/>}</ScrollView></SafeAreaView>
}
const st=StyleSheet.create({badge:{backgroundColor:'#2e7d32',alignSelf:'flex-start',paddingVertical:8,paddingHorizontal:14,borderRadius:20,marginTop:8},absent:{backgroundColor:'#c62828'}});
