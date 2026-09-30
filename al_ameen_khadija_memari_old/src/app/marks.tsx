import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import DateTimePicker from '@react-native-community/datetimepicker';

import AcademyHeader from '../components/AcademyHeader';
import { Select } from '../components/StudentDirectory';
import { Field } from '../components/ui';
import { API_BASE, api } from '../lib/api';
import { getToken, getUser } from '../lib/auth';
import { STUDENT_CLASSES } from '../lib/studentClasses';

function localDate() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const blankForm={className:'',subjectName:'',fullMarks:'',examDate:localDate(),examName:'Weekly Test',sessionName:String(new Date().getFullYear())};
const SESSION_OPTIONS=Array.from({length:8},(_,i)=>String(new Date().getFullYear()+1-i));

export default function Marks() {
  const [form,setForm]=useState(blankForm);
  const [students,setStudents]=useState<any[]>([]);
  const [tests,setTests]=useState<any[]>([]);
  const [editingId,setEditingId]=useState<number|null>(null);
  const [canManage,setCanManage]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [subjects,setSubjects]=useState<any[]>([]);
  const [showDatePicker,setShowDatePicker]=useState(false);
  const [publishClass,setPublishClass]=useState('');
  const [publishTestId,setPublishTestId]=useState('');

  const loadTests=async()=>{try{const data=await api('/api/marks/weekly-tests');setTests(data.tests||[]);}catch(error:any){Alert.alert('Error',error.message);}};
  useEffect(()=>{(async()=>{const user=await getUser<any>();setCanManage(user?.role==='admin'||user?.role==='super_admin');const subjectData=await api('/api/marks/subjects');setSubjects(subjectData.subjects||[]);await loadTests();})();},[]);
  const set=(key:string,value:string)=>setForm(current=>({...current,[key]:value}));

  const loadClass=async()=>{
    if(!form.className) return Alert.alert('Required','Select a class.');
    setLoading(true);
    try{const data=await api(`/api/students?class_name=${encodeURIComponent(form.className)}`);setStudents((data.students||[]).map((student:any)=>({...student,obtained_marks:'',absent:false})));setLoaded(true);setEditingId(null);}
    catch(error:any){Alert.alert('Error',error.message);}finally{setLoading(false);}
  };
  const setMark=(id:number,value:string)=>setStudents(current=>current.map(student=>student.id===id?{...student,obtained_marks:value.replace(/[^0-9.]/g,''),absent:false}:student));
  const toggleAbsent=(id:number)=>setStudents(current=>current.map(student=>student.id===id?{...student,absent:!student.absent,obtained_marks:''}:student));

  const save=async()=>{
    if(!loaded||!students.length) return Alert.alert('Required','Load a class first.');
    if(!form.subjectName.trim()||!form.fullMarks||!form.examDate) return Alert.alert('Required','Subject, full marks and exam date are required.');
    const full=Number(form.fullMarks);
    if(!Number.isFinite(full)||full<=0) return Alert.alert('Invalid','Enter valid full marks.');
    const unfinished=students.some(student=>!student.absent&&student.obtained_marks==='');
    if(unfinished) return Alert.alert('Marks Missing','Enter marks or select Absent for every student.');
    const invalid=students.some(student=>!student.absent&&(Number(student.obtained_marks)<0||Number(student.obtained_marks)>full));
    if(invalid) return Alert.alert('Invalid Marks',`Marks must be between 0 and ${full}.`);
    const body={exam_name:form.examName.trim()||'Weekly Test',class_name:form.className,subject_name:form.subjectName.trim(),full_marks:full,exam_date:form.examDate,session_name:form.sessionName,entries:students.map(student=>({student_id:student.id,obtained_marks:student.absent?null:Number(student.obtained_marks),remarks:student.absent?'Absent':null}))};
    setSaving(true);
    try{
      if(editingId){await api(`/api/marks/weekly-tests/${editingId}`,{method:'PATCH',body:JSON.stringify(body)});Alert.alert('Updated','Marks updated by Admin.');}
      else{await api('/api/marks/weekly-tests',{method:'POST',body:JSON.stringify(body)});Alert.alert('Submitted','Marks saved and locked. Teacher cannot edit this submission.');}
      await loadTests();newEntry();
    }catch(error:any){Alert.alert('Error',error.message);}finally{setSaving(false);}
  };

  const openTest=async(id:number)=>{
    setLoading(true);
    try{const data=await api(`/api/marks/weekly-tests/${id}`);setEditingId(id);setForm({className:data.test.class_name,subjectName:data.test.subject_name,fullMarks:String(data.test.full_marks),examDate:String(data.test.exam_date).slice(0,10),examName:data.test.exam_name||'Weekly Test',sessionName:data.test.session_name||String(new Date().getFullYear())});setStudents((data.students||[]).map((student:any)=>({...student,id:student.student_id,absent:student.obtained_marks===null,obtained_marks:student.obtained_marks===null?'':String(student.obtained_marks)})));setLoaded(true);}
    catch(error:any){Alert.alert('Error',error.message);}finally{setLoading(false);}
  };
  const newEntry=()=>{setEditingId(null);setForm({...blankForm,examDate:localDate()});setStudents([]);setLoaded(false);};
  const enteredCount=useMemo(()=>students.filter(student=>student.absent||student.obtained_marks!=='').length,[students]);
  const print=async()=>{const pages=[];for(let i=0;i<students.length;i+=25){const rows=students.slice(i,i+25).map((student,index)=>`<tr><td>${i+index+1}</td><td>${student.registration_no}</td><td class="name">${student.student_name}</td><td>${student.absent?'B':student.obtained_marks}</td></tr>`).join('');pages.push(`<section><h2>Al-Ameen Mission Academy Memari</h2><h3>${form.examName} · Class ${form.className}</h3><table><thead><tr><th>Sl</th><th>Reg.</th><th>Name</th><th>${form.subjectName}<br>F.M.-${form.fullMarks}<br>${form.examDate.split('-').reverse().join('-')}</th></tr></thead><tbody>${rows}</tbody></table></section>`);}const html=`<style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial;color:#111}section{page-break-after:always}section:last-child{page-break-after:auto}h2,h3{text-align:center;margin:3px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #222;padding:5px;text-align:center;height:22px}th{font-weight:700}.name{text-align:left}</style>${pages.join('')}`;await Print.printAsync({html});};
  const publish=async(test:any)=>{try{await api(`/api/marks/exams/${test.exam_id}/publish`,{method:'PATCH',body:JSON.stringify({is_published:!test.is_published})});Alert.alert('Success',test.is_published?'Result unpublished.':'Result published and Guardian notification sent.');await loadTests();}catch(error:any){Alert.alert('Error',error.message);}};
  const downloadExcel=async()=>{if(!editingId)return;try{const token=await getToken();const response=await fetch(`${API_BASE}/api/marks/published-results/${editingId}/excel`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Publish the result before downloading Excel.');if(Platform.OS==='web'){const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`class-result-${editingId}.xlsx`;a.click();URL.revokeObjectURL(url);}else Alert.alert('Excel ready','Mobile sharing will be enabled in the app package.');}catch(error:any){Alert.alert('Excel',error.message);}};
  const lockedForTeacher=editingId!==null&&!canManage;

  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <AcademyHeader />
    <View style={s.titleRow}><View><Text style={s.title}>Weekly Test Marks Entry</Text><Text style={s.help}>Class নির্বাচন করলে সব student আসবে। একবার submit করলে Teacher আর edit করতে পারবেন না।</Text></View>{loaded&&<TouchableOpacity onPress={newEntry} style={s.newButton}><Text style={s.newText}>New Entry</Text></TouchableOpacity>}</View>
    <View style={s.formCard}>
      {editingId&&<View style={[s.lockBox,canManage&&s.adminBox]}><Text style={s.lockText}>{canManage?'Admin editing enabled':'Submitted marks — View only'}</Text></View>}
      <View style={s.formGrid}>
        <View style={s.fieldWrap}><Text style={s.label}>Session</Text><Select label="Session" value={form.sessionName} onChange={value=>set('sessionName',value)} options={SESSION_OPTIONS.map(value=>({value,label:value}))}/></View><View style={s.fieldWrap}><Text style={s.label}>Class</Text><Select label="Class" value={form.className} onChange={value=>set('className',value)} options={[{value:'',label:'Select class'},...STUDENT_CLASSES.map(value=>({value,label:value}))]}/></View>
        <View style={s.fieldWrap}><Text style={s.label}>Subject</Text><Select label="Subject" value={form.subjectName} onChange={value=>set('subjectName',value)} options={[{value:'',label:'Select subject'},...subjects.map(item=>({value:String(item.subject_name),label:String(item.subject_name)}))]}/></View>
        <View style={s.fieldWrap}><Text style={s.label}>Full Marks</Text><Field editable={!lockedForTeacher} placeholder="Full marks" value={form.fullMarks} onChangeText={(value:string)=>set('fullMarks',value.replace(/[^0-9.]/g,''))} keyboardType="numeric" style={s.input}/></View>
        <View style={s.fieldWrap}><Text style={s.label}>Date / Month / Year</Text>{Platform.OS==='web'?React.createElement('input',{type:'date',value:form.examDate,disabled:lockedForTeacher,onChange:(event:any)=>set('examDate',event.target.value),style:{minHeight:42,border:'1px solid #ccd3da',borderRadius:10,padding:'0 12px',background:'#fff',fontSize:14}}):<><TouchableOpacity disabled={lockedForTeacher} onPress={()=>setShowDatePicker(true)} style={s.dateField}><Text>{form.examDate.split('-').reverse().join('/')}</Text></TouchableOpacity>{showDatePicker&&<DateTimePicker value={new Date(form.examDate+'T00:00:00')} mode="date" onChange={(_,selected)=>{setShowDatePicker(false);if(selected){const y=selected.getFullYear(),m=String(selected.getMonth()+1).padStart(2,'0'),d=String(selected.getDate()).padStart(2,'0');set('examDate',y+'-'+m+'-'+d);}}}/>}</>}</View>
        <View style={s.fieldWrap}><Text style={s.label}>Test Name</Text><Field editable={!lockedForTeacher} placeholder="Weekly Test" value={form.examName} onChangeText={(value:string)=>set('examName',value)} style={s.input}/></View>
      </View>
      {!editingId&&<TouchableOpacity onPress={loadClass} style={s.loadButton}><Text style={s.buttonText}>{loading?'Loading...':'Load Class Students'}</Text></TouchableOpacity>}
    </View>

    {loaded&&<>
      <View style={s.summary}><Text style={s.summaryText}>Students: {students.length}</Text><Text style={s.summaryText}>Completed: {enteredCount}</Text></View>
      {students.map(student=><View key={student.id} style={[s.studentCard,student.absent&&s.absentCard]}><View style={s.studentInfo}><Text style={s.studentName}>{student.student_name}</Text><Text style={s.meta}>Reg. {student.registration_no}</Text></View>{student.absent?<View style={s.hiddenMark}><Text style={s.hiddenMarkText}>Marks hidden</Text></View>:<TextInput editable={!lockedForTeacher} placeholder="Enter marks" placeholderTextColor="#c2c8cf" value={student.obtained_marks} onChangeText={value=>setMark(student.id,value)} keyboardType="numeric" style={s.markInput}/>}<TouchableOpacity disabled={lockedForTeacher} onPress={()=>toggleAbsent(student.id)} style={[s.absentButton,student.absent&&s.absentActive]}><Text style={[s.absentText,student.absent&&s.absentActiveText]}>{student.absent?'ABSENT':'Mark Absent'}</Text></TouchableOpacity></View>)}
      <View style={s.actionRow}>{(!editingId||canManage)&&<TouchableOpacity disabled={saving} onPress={save} style={s.saveButton}><Text style={s.buttonText}>{saving?'Saving...':editingId?'Update Marks as Admin':'Submit & Lock Marks'}</Text></TouchableOpacity>}<TouchableOpacity onPress={print} style={s.printButton}><Text style={s.printText}>Print</Text></TouchableOpacity>{editingId&&<TouchableOpacity onPress={downloadExcel} style={s.printButton}><Text style={s.printText}>Excel</Text></TouchableOpacity>}</View>
    </>}

    {canManage&&<View style={s.publishPanel}>
      <Text style={s.publishTitle}>Publish Weekly Result by Class</Text>
      <View style={s.publishControls}>
        <View style={s.publishSelect}><Select label="Publish class" value={publishClass} onChange={value=>{setPublishClass(value);setPublishTestId('');}} options={[{value:'',label:'Select class'},...Array.from(new Set(tests.map(item=>String(item.class_name)))).map(value=>({value,label:value}))]}/></View>
        <View style={s.publishSelect}><Select label="Result" value={publishTestId} onChange={setPublishTestId} options={[{value:'',label:'Select result to publish'},...tests.filter(item=>!publishClass||String(item.class_name)===publishClass).map(item=>({value:String(item.id),label:String(item.exam_name)+' - '+String(item.subject_name)+(item.is_published?' (Published)':'' )}))]}/></View>
        <TouchableOpacity disabled={!publishTestId} onPress={()=>{const test=tests.find(item=>String(item.id)===publishTestId);if(test)publish(test);}} style={[s.publishButton,!publishTestId&&{opacity:.5}]}><Text style={s.buttonText}>{tests.find(item=>String(item.id)===publishTestId)?.is_published?'Unpublish Selected':'Publish Selected'}</Text></TouchableOpacity>
      </View>
    </View>}

    <Text style={s.sectionTitle}>Submitted Weekly Tests ({tests.length})</Text>
    {tests.map(test=><View key={test.id} style={s.testCard}><View style={{flex:1}}><Text style={s.testTitle}>{test.exam_name} · {test.class_name}</Text><Text style={s.meta}>{test.subject_name} · Full {test.full_marks} · {String(test.exam_date).slice(0,10)}</Text><Text style={s.meta}>{test.student_count} students · By {test.entered_by_name||'User'}</Text></View>{canManage&&<TouchableOpacity onPress={()=>publish(test)} style={[s.viewButton,test.is_published&&{backgroundColor:'#dff3e5'}]}><Text style={s.viewText}>{test.is_published?'Published ✓':'Publish'}</Text></TouchableOpacity>}<TouchableOpacity onPress={()=>openTest(test.id)} style={s.viewButton}><Text style={s.viewText}>{canManage?'Edit':'View'}</Text></TouchableOpacity></View>)}
    {loading&&<ActivityIndicator color="#1d5fa7" style={{margin:15}}/>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#f2f6fb'},content:{width:'100%',maxWidth:980,alignSelf:'center',padding:16,paddingBottom:50},titleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},title:{fontSize:27,fontWeight:'900',color:'#173d68',marginTop:6},help:{color:'#66798e',marginTop:4,marginBottom:16},newButton:{borderWidth:1,borderColor:'#1d5fa7',borderRadius:8,padding:9},newText:{color:'#1d5fa7',fontWeight:'800'},formCard:{backgroundColor:'#fff',borderRadius:16,padding:15,borderWidth:1,borderColor:'#d8e2ed'},formGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},fieldWrap:{flexGrow:1,width:'30%',minWidth:210},dateField:{minHeight:42,borderWidth:1,borderColor:'#ccd3da',borderRadius:10,padding:12,backgroundColor:'#fff'},label:{fontWeight:'700',color:'#486079',marginBottom:5},input:{marginBottom:0},loadButton:{backgroundColor:'#1d5fa7',borderRadius:9,padding:13,marginTop:14},buttonText:{color:'#fff',fontWeight:'900',textAlign:'center'},lockBox:{backgroundColor:'#fff0d2',borderRadius:8,padding:10,marginBottom:12},adminBox:{backgroundColor:'#e0f1ff'},lockText:{fontWeight:'800',color:'#61491d'},summary:{flexDirection:'row',justifyContent:'space-between',backgroundColor:'#dfeefe',borderRadius:10,padding:12,marginVertical:14},summaryText:{fontWeight:'900',color:'#214e7d'},studentCard:{backgroundColor:'#fff',borderRadius:12,padding:11,marginBottom:8,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10,borderWidth:1,borderColor:'#dce5ee'},absentCard:{backgroundColor:'#fff2f2',borderColor:'#edb4b8'},studentInfo:{flex:1,minWidth:150},studentName:{fontWeight:'900',color:'#263d54'},meta:{color:'#718091',fontSize:12,marginTop:3},markInput:{width:82,borderWidth:1,borderColor:'#aebdcb',borderRadius:8,padding:10,textAlign:'center',backgroundColor:'#fff'},disabledInput:{backgroundColor:'#eee'},hiddenMark:{width:82,paddingVertical:10,alignItems:'center'},hiddenMarkText:{color:'#a0a8b0',fontSize:11},absentButton:{borderWidth:1,borderColor:'#cf4854',borderRadius:8,paddingHorizontal:10,paddingVertical:10},absentActive:{backgroundColor:'#c93643'},absentText:{color:'#b42e3a',fontSize:11,fontWeight:'900'},absentActiveText:{color:'#fff'},actionRow:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:10},saveButton:{flex:1,backgroundColor:'#145b9f',borderRadius:10,padding:14},printButton:{borderWidth:1,borderColor:'#145b9f',borderRadius:10,paddingHorizontal:24,justifyContent:'center'},printText:{color:'#145b9f',fontWeight:'900'},publishPanel:{backgroundColor:'#eaf3ff',borderWidth:1,borderColor:'#bfd7f0',borderRadius:12,padding:13,marginTop:24},publishTitle:{fontSize:17,fontWeight:'900',color:'#173d68',marginBottom:10},publishControls:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center'},publishSelect:{flex:1,minWidth:210},publishButton:{backgroundColor:'#167447',borderRadius:9,padding:13,minWidth:150},sectionTitle:{fontSize:19,fontWeight:'900',color:'#213e5d',marginTop:26,marginBottom:10},testCard:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:8,flexDirection:'row',alignItems:'center',gap:10},testTitle:{fontWeight:'900',color:'#243f5c'},viewButton:{backgroundColor:'#e1edfa',borderRadius:8,paddingHorizontal:15,paddingVertical:10},viewText:{color:'#15538e',fontWeight:'900'}});
