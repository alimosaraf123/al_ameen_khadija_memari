import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import {Field} from '../components/ui';
import {api} from '../lib/api';

type Staff = {id:number; staff_id:string; name:string; status?:string; present?:number; absent?:number; late?:number; leave?:number; recorded?:number};
const statuses = ['Present','Absent','Late','Leave'];
const today = () => {const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export default function TeacherAttendance() {
  const [date,setDate]=useState(today);
  const [month,setMonth]=useState(today().slice(0,7));
  const [staff,setStaff]=useState<Staff[]>([]);
  const [report,setReport]=useState<Staff[]>([]);
  const [loadedDate,setLoadedDate]=useState('');
  const [reportMonth,setReportMonth]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const load = async (monthly=false) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const data=await api(monthly ? `/api/teachers/attendance/monthly?month=${encodeURIComponent(month)}` : `/api/teachers/attendance?date=${encodeURIComponent(date)}`);
      if(monthly){setReport(data.staff);setReportMonth(month);}else{setStaff(data.staff);setLoadedDate(date);}
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  };
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
      {!!reportMonth && <><Text style={s.heading}>Report: {reportMonth}</Text><Text>Recorded counts only; unmarked days are not counted as absent.</Text><ScrollView horizontal><View>
        <View style={s.row}>{['Staff ID','Name','Present','Absent','Late','Leave','Recorded'].map(label=><Text key={label} style={[s.cell,s.bold]}>{label}</Text>)}</View>
        {report.map(p=><View key={p.id} style={s.row}>{[p.staff_id,p.name,p.present,p.absent,p.late,p.leave,p.recorded].map((value,i)=><Text key={i} style={s.cell}>{value}</Text>)}</View>)}
      </View></ScrollView></>}
    </View>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f3f6fa'},content:{padding:16,width:'100%',maxWidth:1100,alignSelf:'center'},title:{fontSize:24,fontWeight:'800',marginVertical:14},heading:{fontWeight:'700',fontSize:16,marginVertical:10},link:{color:'#1764a5',paddingVertical:12},card:{backgroundColor:'#fff',padding:16,borderRadius:10,marginTop:16},button:{backgroundColor:'#1665bb',padding:14,borderRadius:7,alignItems:'center',marginVertical:8},white:{color:'#fff',fontWeight:'700'},error:{color:'#b42318',padding:12},success:{color:'#167044',padding:12},person:{borderBottomWidth:1,borderColor:'#dce2eb',paddingBottom:12},options:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},option:{padding:10,borderWidth:1,borderColor:'#1665bb',borderRadius:6},selected:{backgroundColor:'#1665bb'},row:{flexDirection:'row'},cell:{width:130,padding:10,borderWidth:0.5,borderColor:'#ccd5df'},bold:{fontWeight:'800'}});
