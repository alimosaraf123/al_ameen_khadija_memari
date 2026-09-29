import React,{useEffect,useState} from 'react';
import {ScrollView,Text,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {api} from '../lib/api';
import {Field,Button,Card,H1} from '../components/ui';
import {Select} from '../components/StudentDirectory';
export default function Problems(){
 const [list,setList]=useState<any[]>([]),[rooms,setRooms]=useState<any[]>([]),[roomNumber,setRoomNumber]=useState(''),[type,setType]=useState(''),[details,setDetails]=useState('');
 const load=()=>api('/api/problems').then(d=>setList(d.problems||[])).catch(e=>Alert.alert('Error',e.message));
 useEffect(()=>{load();api('/api/rooms').then(d=>setRooms(d.rooms||[])).catch(e=>Alert.alert('Error',e.message));},[]);
 const add=async()=>{try{await api('/api/problems',{method:'POST',body:JSON.stringify({room_number:roomNumber||null,problem_type:type,details})});setType('');setDetails('');load();}catch(e:any){Alert.alert('Error',e.message)}};
 return <SafeAreaView style={{flex:1,backgroundColor:'#f3f6f9'}}><ScrollView contentContainerStyle={{padding:16}}><H1>Room Problems</H1><Select label="Room number" value={roomNumber} onChange={setRoomNumber} options={[{value:'',label:'No room'},...rooms.map(r=>({value:String(r.room_name),label:String(r.room_name)}))]}/><Field placeholder="Problem type (Light/Fan/Other)" value={type} onChangeText={setType}/><Field placeholder="Details" value={details} onChangeText={setDetails}/><Button title="Report Problem" onPress={add}/>{list.map(x=><Card key={x.id}><Text style={{fontWeight:'800'}}>{x.problem_type} | {x.status}</Text><Text>{x.room_name||'No room'} ? {x.details||''}</Text></Card>)}</ScrollView></SafeAreaView>
}
