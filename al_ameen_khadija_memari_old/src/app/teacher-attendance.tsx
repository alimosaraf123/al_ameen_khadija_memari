import React, {useEffect, useState} from 'react';
import {Image, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import {Field} from '../components/ui';
import {api,API_BASE} from '../lib/api';

type Staff = {id:number; staff_id:string; name:string; photo_url?:string; designation?:string; status?:string; attendance?:Record<string,string>; present?:number; absent?:number; late?:number; leave?:number; recorded?:number};
const statuses = ['Present','Absent','Late','Leave'];
const today = () => {const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export default function TeacherAttendance() {
  const [date,setDate]=useState(today);
  const [month,setMonth]=useState(today().slice(0,7));
  const [staff,setStaff]=useState<Staff[]>([]);
  const [report,setReport]=useState<Staff[]>([]);
  const [days,setDays]=useState<any[]>([]);
  const [loadedDate,setLoadedDate]=useState('');
  const [reportMonth,setReportMonth]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const load = async (monthly=false) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const data=await api(monthly ? `/api/teachers/attendance/monthly-grid?month=${encodeURIComponent(month)}` : `/api/teachers/attendance?date=${encodeURIComponent(date)}`);
      if(monthly){setReport(data.staff);setDays(data.days||[]);setReportMonth(month);}else{setStaff(data.staff);setLoadedDate(date);}
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  useEffect(()=>{void load(true);},[]);
  const save=async()=>{
    if(staff.some(p=>!p.status)){setError('Select a status for every staff member.');return;}
    setBusy(true);setError('');setMessage('');
    try {await api('/api/teachers/attendance',{method:'POST',body:JSON.stringify({date:loadedDate,entries:staff.map(p=>({id:p.id,status:p.status}))})});setMessage(`Attendance saved for ${loadedDate}.`);setReportMonth('');}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <AcademyHeader/><TouchableOpacity onPress={()=>router.push('/teachers' as any)}><Text style={s.link}>Back to Teachers</Text></TouchableOpacity>
    <Text style={s.title}>Teacher & Staff Attendance</Text>
    <Text>Daily attendance for all staff registered in Teachers & Staff.</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!message && <Text style={s.success}>{message}</Text>}
    <View style={s.card}><Text style={s.heading}>Daily Entry</Text><Text>Date (YYYY-MM-DD)</Text>
      <Field value={date} editable={!busy} onChangeText={(v:string)=>{setDate(v);setLoadedDate('');setStaff([]);}} placeholder="YYYY-MM-DD"/>
      <TouchableOpacity disabled={busy} style={s.button} onPress={()=>load()}><Text style={s.white}>{busy?'Please wait...':'Load Attendance'}</Text></TouchableOpacity>
      {!!loadedDate && <><Text style={s.heading}>{loadedDate} | {staff.length} staff</Text>
        {staff.map(person=><View key={person.id} style={s.person}><Text style={s.heading}>{person.name}</Text><Text>Staff ID: {person.staff_id}</Text>
          <View style={s.options}>{statuses.map(status=><TouchableOpacity key={status} disabled={busy} accessibilityRole="radio" accessibilityState={{checked:person.status===status}} style={[s.option,person.status===status&&s.selected]} onPress={()=>setStaff(rows=>rows.map(row=>row.id===person.id?{...row,status}:row))}><Text style={person.status===status?s.white:undefined}>{status}</Text></TouchableOpacity>)}</View>
        </View>)}
        {staff.length>0 && <TouchableOpacity disabled={busy} style={s.button} onPress={save}><Text style={s.white}>Save Attendance</Text></TouchableOpacity>}
      </>}
    </View>
    <View style={s.card}><Text style={s.heading}>Monthly Report</Text><Text>Month (YYYY-MM)</Text>
      <Field value={month} editable={!busy} onChangeText={(v:string)=>{setMonth(v);setReportMonth('');}} placeholder="YYYY-MM"/>
      <TouchableOpacity disabled={busy} style={s.button} onPress={()=>load(true)}><Text style={s.white}>View Monthly Report</Text></TouchableOpacity>
      {!!reportMonth && <><Text style={s.heading}>Report: {reportMonth}</Text><ScrollView horizontal><View><View style={s.row}><Text style={[s.fixedCell,s.head]}>#</Text><Text style={[s.photoCell,s.head]}>Photo</Text><Text style={[s.idCell,s.head]}>ID</Text><Text style={[s.nameCell,s.head]}>Staff Name</Text>{days.map(day=><Text key={day.date} style={[s.dayCell,s.head]}>{day.day}{'\n'}{day.number}</Text>)}</View>
        {report.map((p,index)=><View key={p.id} style={s.row}><Text style={s.fixedCell}>{index+1}</Text><View style={s.photoCell}><Text style={s.photoPlaceholder}>{p.photo_url?'●':'○'}</Text></View><Text style={s.idCell}>{p.staff_id}</Text><View style={s.nameCell}><Text>{p.name}</Text><Text style={s.role}>{p.designation||'Staff'}</Text></View>{days.map(day=>{const value=p.attendance?.[String(day.date).slice(0,10)];return <Text key={day.date} style={[s.dayCell,value==='Present'&&s.present,value==='Absent'&&s.absent,value==='Late'&&s.late,value==='Leave'&&s.leave]}>{value==='Present'?'P':value==='Absent'?'A':value==='Late'?'L':value==='Leave'?'LV':''}</Text>})}</View>)}
      </View></ScrollView></>}
    </View>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f3f6fa'},content:{padding:16,width:'100%',maxWidth:1500,alignSelf:'center'},title:{fontSize:24,fontWeight:'800',marginVertical:14},heading:{fontWeight:'700',fontSize:16,marginVertical:10},link:{color:'#1764a5',paddingVertical:12},card:{backgroundColor:'#fff',padding:16,borderRadius:10,marginTop:16},button:{backgroundColor:'#1665bb',padding:14,borderRadius:7,alignItems:'center',marginVertical:8},white:{color:'#fff',fontWeight:'700'},error:{color:'#b42318',padding:12},success:{color:'#167044',padding:12},person:{borderBottomWidth:1,borderColor:'#dce2eb',paddingBottom:12},options:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},option:{padding:10,borderWidth:1,borderColor:'#1665bb',borderRadius:6},selected:{backgroundColor:'#1665bb'},row:{flexDirection:'row'},head:{fontWeight:'800',backgroundColor:'#d3b9a0'},fixedCell:{width:45,padding:10,borderWidth:.5,borderColor:'#8c98a5',textAlign:'center'},photoCell:{width:68,padding:8,borderWidth:.5,borderColor:'#8c98a5',textAlign:'center'},photoPlaceholder:{fontSize:24,color:'#64748b'},idCell:{width:90,padding:10,borderWidth:.5,borderColor:'#8c98a5',textAlign:'center'},nameCell:{width:210,padding:10,borderWidth:.5,borderColor:'#8c98a5'},dayCell:{width:68,minHeight:58,padding:9,borderWidth:.5,borderColor:'#8c98a5',textAlign:'center'},role:{fontSize:12,color:'#526273',marginTop:4},present:{color:'#111',fontWeight:'800'},absent:{color:'#b42318',fontWeight:'800'},late:{color:'#b46a00',fontWeight:'800'},leave:{color:'#1764a5',fontWeight:'800'}});
