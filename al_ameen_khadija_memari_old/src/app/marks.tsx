import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import DateTimePicker from '@react-native-community/datetimepicker';

import AcademyHeader from '../components/AcademyHeader';
import ScrollNavigationButtons from '../components/ScrollNavigationButtons';
import { Select } from '../components/StudentDirectory';
import { Field } from '../components/ui';
import { API_BASE, api } from '../lib/api';
import { getToken, getUser } from '../lib/auth';
import { confirmAction, successMessage } from '../lib/confirm';
import { STUDENT_CLASSES } from '../lib/studentClasses';

function localDate() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const blankForm={className:'',subjectName:'',fullMarks:'',examDate:localDate(),examName:'Weekly Test',sessionName:`${new Date().getFullYear()}-${new Date().getFullYear()}`};
const SESSION_OPTIONS=Array.from({length:10},(_,i)=>{const y=new Date().getFullYear()-2+i;return [`${y}-${y}`,`${y}-${y+1}`]}).flat();

export default function Marks() {
  const [form,setForm]=useState(blankForm);
  const [students,setStudents]=useState<any[]>([]);
  const [tests,setTests]=useState<any[]>([]);
  const [editingId,setEditingId]=useState<number|null>(null);
  const [editingTest,setEditingTest]=useState<any>(null);
  const [canManage,setCanManage]=useState(false);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false),[savingMode,setSavingMode]=useState<'draft'|'final'|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [subjects,setSubjects]=useState<any[]>([]);
  const [showDatePicker,setShowDatePicker]=useState(false);
  const [publishClass,setPublishClass]=useState('');
  const [resultSession,setResultSession]=useState('all');
  const [publishTestId,setPublishTestId]=useState('');
  const [studentSearch,setStudentSearch]=useState('');
  const [studentFilter,setStudentFilter]=useState<'all'|'completed'|'pending'|'absent'>('all');
  const [sortColumn,setSortColumn]=useState<'sl'|'reg'|'name'|'marks'|null>('sl');
  const [sortDirection,setSortDirection]=useState<'asc'|'desc'>('asc');
  const [activeHeaderMenu,setActiveHeaderMenu]=useState<'sl'|'reg'|'name'|'marks'|'absent'|null>(null);
  const [weeklyTestClassFilter,setWeeklyTestClassFilter]=useState('all');
  const [weeklyTestSearch,setWeeklyTestSearch]=useState('');
  const rosterRequest=useRef(0);
  const scrollRef=useRef<any>(null);

  const loadTests=async()=>{try{const data=await api('/api/marks/weekly-tests');setTests(data.tests||[]);}catch(error:any){Alert.alert('Error',error.message);}};
  useEffect(()=>{void getUser<any>().then(user=>setCanManage(user?.role==='admin'||user?.role==='super_admin'));void api('/api/marks/subjects').then(data=>setSubjects(data.subjects||[])).catch(error=>Alert.alert('Subjects',error.message));void api('/api/marks/weekly-tests').then(data=>setTests(data.tests||[])).catch(error=>Alert.alert('Drafts',error.message));},[]);
  const set=(key:string,value:string)=>{
    if(key==='sessionName'&&editingId&&canManage){setForm(current=>({...current,sessionName:value}));return;}
    if(key==='sessionName'||key==='className'){
      if(editingId)return;
      rosterRequest.current++;setStudents([]);setLoaded(false);setLoading(false);
    }
    if(key==='className'&&!editingId){
      const isSenior = value.startsWith('XI') || value.startsWith('XII') || value === 'X';
      const year = new Date().getFullYear();
      const currentYearSession = `${year}-${year}`;
      const nextYearSession = `${year}-${year+1}`;
      setForm(current => {
        let updatedSession = current.sessionName;
        if(isSenior && current.sessionName === currentYearSession) {
          updatedSession = nextYearSession;
        } else if(!isSenior && current.sessionName === nextYearSession) {
          updatedSession = currentYearSession;
        }
        return { ...current, className: value, sessionName: updatedSession };
      });
      return;
    }
    setForm(current=>({...current,[key]:value}));
  };

  const loadClass=async()=>{
    if(!form.className) return Alert.alert('Required','Select a class.');
    if(!form.sessionName) return Alert.alert('Required','Select a session.');
    const request=++rosterRequest.current;
    setLoading(true);
    try{
      const data=await api(`/api/students?class_name=${encodeURIComponent(form.className)}&session=${encodeURIComponent(form.sessionName)}`);
      if(request!==rosterRequest.current)return;
      setStudents((data.students||[]).map((student:any)=>({...student,obtained_marks:'',absent:false})));
      setLoaded(true);
      setEditingId(null);
      setEditingTest(null);
      if(!data.students?.length){
        const isSenior = form.className.startsWith('XI') || form.className.startsWith('XII') || form.className === 'X';
        const year = new Date().getFullYear();
        const hint = isSenior && form.sessionName === `${year}-${year}`
          ? ` Class ${form.className}-এর সেশন সাধারণত ${year}-${year+1} হয়। ড্রপডাউন থেকে ${year}-${year+1} সিলেক্ট করুন।`
          : '';
        Alert.alert('No Students',`No active students found for Class ${form.className} in session ${form.sessionName}.${hint}`);
      }
    }
    catch(error:any){if(request===rosterRequest.current)Alert.alert('Error',error.message);}finally{if(request===rosterRequest.current)setLoading(false);}
  };
  const setMark=(id:number,value:string)=>{const clean=value.replace(/[^0-9.]/g,'');const student=students.find(x=>x.id===id);if(clean!==''&&Number(clean)>Number(form.fullMarks))Alert.alert('Invalid marks',`${student?.student_name||'Student'}: Marks cannot exceed Full Marks (${form.fullMarks}).`);else setStudents(current=>current.map(student=>student.id===id?{...student,obtained_marks:clean,absent:false}:student));};
  const toggleAbsent=(id:number)=>setStudents(current=>current.map(student=>student.id===id?{...student,absent:!student.absent,obtained_marks:''}:student));

  const save=async(submit_mode:'draft'|'final')=>{if(!await confirmAction(submit_mode==='draft'?'Save draft':'Final submit',submit_mode==='draft'?'Save this mark sheet as a draft?':'Submit this mark sheet?'))return;setSavingMode(submit_mode);
    if(!loaded||!students.length) return Alert.alert('Required','Load a class first.');
    if(!form.subjectName.trim()||!form.fullMarks||!form.examDate) return Alert.alert('Required','Subject, full marks and exam date are required.');
    const full=Number(form.fullMarks);
    if(!Number.isFinite(full)||full<=0) return Alert.alert('Invalid','Enter valid full marks.');
    const unfinished=students.some(student=>!student.absent&&student.obtained_marks==='');
    if(submit_mode==='final'&&unfinished) return Alert.alert('Marks Missing','Enter marks or select Absent for every student.');
    const invalid=students.some(student=>!student.absent&&(Number(student.obtained_marks)<0||Number(student.obtained_marks)>full));
    if(invalid) return Alert.alert('Invalid Marks',`Marks must be between 0 and ${full}.`);
    const body={exam_name:form.examName.trim()||'Weekly Test',class_name:form.className,subject_name:form.subjectName.trim(),full_marks:full,exam_date:form.examDate,session_name:form.sessionName,submit_mode,entries:students.map(student=>({student_id:student.id,obtained_marks:student.absent||student.obtained_marks===''?null:Number(student.obtained_marks),remarks:student.absent?'Absent':null}))};
    setSaving(true);
    try{
      const result=editingId?await api(`/api/marks/weekly-tests/${editingId}`,{method:'PATCH',body:JSON.stringify(body)}):await api('/api/marks/weekly-tests',{method:'POST',body:JSON.stringify(body)});
      successMessage(submit_mode==='draft'?'Saved':'Submitted',submit_mode==='draft'?(editingTest?.locked?'Marks updated.':'Draft saved. You can continue editing later.'):'Marks submitted and locked.');
      await loadTests();
      if(submit_mode==='draft'&&!result.test?.locked){await openTest(Number(result.test.id));}else{newEntry();}
    }catch(error:any){Alert.alert('Error',error.message);}finally{setSaving(false);setSavingMode(null);}
  };

  const openTest=async(id:number)=>{
    setLoading(true);
    try{
      const data=await api(`/api/marks/weekly-tests/${id}`);
      setEditingId(id);
      setEditingTest(data.test);
      setForm({
        className:data.test.class_name,
        subjectName:data.test.subject_name,
        fullMarks:String(data.test.full_marks),
        examDate:String(data.test.exam_date).slice(0,10),
        examName:data.test.exam_name||'Weekly Test',
        sessionName:data.test.session_name||String(new Date().getFullYear())
      });
      setStudents((data.students||[]).map((student:any)=>({
        ...student,
        id:student.student_id,
        absent:student.obtained_marks===null&&student.remarks==='Absent',
        obtained_marks:student.obtained_marks===null?'':String(student.obtained_marks)
      })));
      setStudentSearch('');
      setStudentFilter('all');
      setLoaded(true);
    }
    catch(error:any){Alert.alert('Error',error.message);}finally{setLoading(false);}
  };
  const newEntry=()=>{
    setEditingId(null);
    setEditingTest(null);
    setForm({...blankForm,examDate:localDate()});
    setStudents([]);
    setStudentSearch('');
    setStudentFilter('all');
    setSortColumn('sl');
    setSortDirection('asc');
    setActiveHeaderMenu(null);
    setLoaded(false);
  };

  const toggleSort=(col:'sl'|'reg'|'name'|'marks')=>{
    if(sortColumn===col){
      setSortDirection(current=>current==='asc'?'desc':'asc');
    }else{
      setSortColumn(col);
      setSortDirection(col==='marks'?'desc':'asc');
    }
  };

  const resetAllFilters=()=>{
    setSortColumn('sl');
    setSortDirection('asc');
    setStudentFilter('all');
    setStudentSearch('');
    setActiveHeaderMenu(null);
  };

  const absentCount=useMemo(()=>students.filter(student=>student.absent).length,[students]);
  const enteredCount=useMemo(()=>students.filter(student=>student.absent||student.obtained_marks!=='').length,[students]);
  const pendingCount=useMemo(()=>students.filter(student=>!student.absent&&student.obtained_marks==='').length,[students]);

  const filteredStudents=useMemo(()=>{
    const list = students.map((s,idx)=>({...s,originalIndex:idx})).filter(s=>{
      if(studentFilter==='completed'&&!(s.absent||s.obtained_marks!==''))return false;
      if(studentFilter==='pending'&&(s.absent||s.obtained_marks!==''))return false;
      if(studentFilter==='absent'&&!s.absent)return false;
      if(studentSearch.trim()){
        const q=studentSearch.trim().toLowerCase();
        const mName=String(s.student_name||'').toLowerCase().includes(q);
        const mReg=String(s.registration_no||'').toLowerCase().includes(q);
        if(!mName&&!mReg)return false;
      }
      return true;
    });

    if(!sortColumn) return list;

    return list.slice().sort((a,b)=>{
      if(sortColumn==='sl'){
        return sortDirection==='asc'?a.originalIndex-b.originalIndex:b.originalIndex-a.originalIndex;
      }
      if(sortColumn==='reg'){
        const numA=Number(a.registration_no)||0;
        const numB=Number(b.registration_no)||0;
        if(numA!==numB){
          return sortDirection==='asc'?numA-numB:numB-numA;
        }
        return sortDirection==='asc'
          ?String(a.registration_no).localeCompare(String(b.registration_no))
          :String(b.registration_no).localeCompare(String(a.registration_no));
      }
      if(sortColumn==='name'){
        const comp=String(a.student_name||'').localeCompare(String(b.student_name||''));
        return sortDirection==='asc'?comp:-comp;
      }
      if(sortColumn==='marks'){
        if(a.absent&&!b.absent) return 1;
        if(!a.absent&&b.absent) return -1;
        if(a.absent&&b.absent) return 0;
        const valA=a.obtained_marks===''? -1 : Number(a.obtained_marks);
        const valB=b.obtained_marks===''? -1 : Number(b.obtained_marks);
        return sortDirection==='asc'?valA-valB:valB-valA;
      }
      return 0;
    });
  },[students,studentFilter,studentSearch,sortColumn,sortDirection]);

  const displayedWeeklyTests=useMemo(()=>{
    return tests.filter(test=>{
      if(canManage&&resultSession!=='all'&&test.session_name!==resultSession)return false;
      if(weeklyTestClassFilter!=='all'&&String(test.class_name)!==weeklyTestClassFilter)return false;
      if(weeklyTestSearch.trim()){
        const q=weeklyTestSearch.trim().toLowerCase();
        const mExam=String(test.exam_name||'').toLowerCase().includes(q);
        const mSub=String(test.subject_name||'').toLowerCase().includes(q);
        const mClass=String(test.class_name||'').toLowerCase().includes(q);
        if(!mExam&&!mSub&&!mClass)return false;
      }
      return true;
    });
  },[tests,canManage,resultSession,weeklyTestClassFilter,weeklyTestSearch]);

  const print=async()=>{const pages:string[]=[];for(let i=0;i<students.length;i+=25){const rows=students.slice(i,i+25).map((student,index)=>`<tr><td>${i+index+1}</td><td>${student.registration_no}</td><td class="name">${student.student_name}</td><td>${student.absent?'B':student.obtained_marks}</td></tr>`).join('');pages.push(`<section><h2>Al-Ameen Mission Academy Memari</h2><h3>${form.examName}  -  Class ${form.className}</h3><table><thead><tr><th>Sl</th><th>Reg.</th><th>Name</th><th>${form.subjectName}<br>F.M.-${form.fullMarks}<br>${form.examDate.split('-').reverse().join('-')}</th></tr></thead><tbody>${rows}</tbody></table></section>`);}const html=`<style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial;color:#111}section{page-break-after:always}section:last-child{page-break-after:auto}h2,h3{text-align:center;margin:3px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #222;padding:5px;text-align:center;height:22px}th{font-weight:700}.name{text-align:left}</style>${pages.join('')}`;await Print.printAsync({html});};
  const publish=async(test:any)=>{if(!await confirmAction(test.is_published?'Unpublish result':'Publish result',test.is_published?'Reopen this result for correction?':'Publish this result to guardians?'))return;try{await api(`/api/marks/exams/${test.exam_id}/publish`,{method:'PATCH',body:JSON.stringify({is_published:!test.is_published})});successMessage('Success',test.is_published?'Result unpublished.':'Result published and Guardian notification sent.');await loadTests();}catch(error:any){Alert.alert('Error',error.message);}};
  const deleteTest=async(test:any)=>{if(!await confirmAction('Delete Weekly Test',`Are you sure you want to delete ${test.exam_name} (${test.class_name} - ${test.subject_name})? This will permanently remove the test and all student marks.`))return;try{await api(`/api/marks/weekly-tests/${test.id}`,{method:'DELETE'});successMessage('Deleted','Weekly test deleted successfully.');if(editingId===Number(test.id)){newEntry();}await loadTests();}catch(error:any){Alert.alert('Error',error.message);}};
  const downloadExcel=async()=>{if(!editingId)return;try{const token=await getToken();const response=await fetch(`${API_BASE}/api/marks/published-results/${editingId}/excel`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('Publish the result before downloading Excel.');if(Platform.OS==='web'){const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`class-result-${editingId}.xlsx`;a.click();URL.revokeObjectURL(url);}else Alert.alert('Excel ready','Mobile sharing will be enabled in the app package.');}catch(error:any){Alert.alert('Excel',error.message);}};
  const lockedForTeacher=editingId!==null&&!canManage&&!!editingTest?.locked;

  return <SafeAreaView style={s.page}><ScrollView ref={scrollRef} contentContainerStyle={s.content}>
    <AcademyHeader />
    <View style={s.titleRow}><View><Text style={s.title}>Weekly Test Marks Entry</Text><Text style={s.help}>Selecting a class will load all students. Teachers cannot edit marks after submission.</Text></View>{(loaded||editingId)&&<TouchableOpacity onPress={newEntry} style={s.newButton}><Text style={s.newText}>{editingId?'Back / New Entry':'New Entry'}</Text></TouchableOpacity>}</View>
    {!canManage&&<View style={s.formCard}><View style={s.titleRow}><Text style={s.sectionTitle}>My Drafts ({tests.filter(test=>!test.locked).length})</Text><TouchableOpacity onPress={loadTests} style={s.viewButton}><Text style={s.viewText}>Refresh</Text></TouchableOpacity></View>{tests.filter(test=>!test.locked).map(test=><View key={test.id} style={s.testCard}><TouchableOpacity onPress={()=>openTest(test.id)} style={{flex:1}}><Text style={s.testTitle}>{test.exam_name}  -  Class {test.class_name}</Text><Text style={s.meta}>{test.subject_name} | Session {test.session_name} | {String(test.exam_date).slice(0,10)}</Text></TouchableOpacity><TouchableOpacity onPress={()=>openTest(test.id)} style={s.viewButton}><Text style={s.viewText}>Continue Draft</Text></TouchableOpacity><TouchableOpacity onPress={()=>deleteTest(test)} style={[s.viewButton,s.deleteButton]}><Text style={[s.viewText,s.deleteText]}>Delete</Text></TouchableOpacity></View>)}{!tests.some(test=>!test.locked)&&<Text style={s.meta}>No saved drafts.</Text>}</View>}
    <View style={s.formCard}>
      {editingId&&<View style={[s.lockBox,canManage&&s.adminBox]}><Text style={s.lockText}>{editingTest?.locked?(canManage?'Submitted  -  Admin editing enabled':'Submitted marks  -  View only'):'Draft  -  Continue editing'}</Text></View>}
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
      <View style={s.summary}>
        <Text style={s.summaryText}>Total: {students.length}</Text>
        <Text style={[s.summaryText,{color:'#15803d'}]}>Completed: {enteredCount}</Text>
        <Text style={[s.summaryText,{color:'#b45309'}]}>Pending: {pendingCount}</Text>
        <Text style={[s.summaryText,{color:'#b91c1c'}]}>Absent: {absentCount}</Text>
      </View>

      <View style={s.filterRow}>
        <View style={s.searchWrap}>
          <TextInput
            placeholder="🔍 Search student name or Reg No..."
            placeholderTextColor="#8492a6"
            value={studentSearch}
            onChangeText={setStudentSearch}
            style={s.searchInput}
          />
          {studentSearch ? (
            <TouchableOpacity onPress={()=>setStudentSearch('')} style={s.clearBtn}>
              <Text style={s.clearBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={s.filterTabs}>
          {[
            { id: 'all', label: `All (${students.length})` },
            { id: 'pending', label: `Pending (${pendingCount})` },
            { id: 'completed', label: `Completed (${enteredCount})` },
            { id: 'absent', label: `Absent (${absentCount})` }
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              onPress={()=>setStudentFilter(tab.id as any)}
              style={[s.filterChip, studentFilter === tab.id && s.filterChipActive]}
            >
              <Text style={[s.filterChipText, studentFilter === tab.id && s.filterChipTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
          {(sortColumn!=='sl'||sortDirection!=='asc'||studentFilter!=='all'||studentSearch!=='')&&(
            <TouchableOpacity onPress={resetAllFilters} style={s.resetAllBtn}>
              <Text style={s.resetAllText}>🔄 Reset Filter & Sort</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={s.tableCard}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{minWidth:'100%'}}>
          <View style={{flex:1,minWidth:620,position:'relative'}}>
            <View style={s.tableHeader}>
              <View style={[s.thCellWrap, s.colSl]}>
                <TouchableOpacity onPress={() => toggleSort('sl')} style={s.thTitleBtn}>
                  <Text style={s.thCell}>sl no</Text>
                  {sortColumn==='sl'&&<Text style={s.sortBadge}>{sortDirection==='asc'?' ▲':' ▼'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setActiveHeaderMenu(activeHeaderMenu==='sl'?null:'sl')} style={s.filterTrigger}>
                  <Text style={[s.filterTriggerText,activeHeaderMenu==='sl'&&s.filterTriggerActive]}>▾</Text>
                </TouchableOpacity>
              </View>

              <View style={[s.thCellWrap, s.colReg]}>
                <TouchableOpacity onPress={() => toggleSort('reg')} style={s.thTitleBtn}>
                  <Text style={s.thCell}>reg no</Text>
                  {sortColumn==='reg'&&<Text style={s.sortBadge}>{sortDirection==='asc'?' ▲':' ▼'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setActiveHeaderMenu(activeHeaderMenu==='reg'?null:'reg')} style={s.filterTrigger}>
                  <Text style={[s.filterTriggerText,activeHeaderMenu==='reg'&&s.filterTriggerActive]}>▾</Text>
                </TouchableOpacity>
              </View>

              <View style={[s.thCellWrap, s.colName]}>
                <TouchableOpacity onPress={() => toggleSort('name')} style={s.thTitleBtn}>
                  <Text style={s.thCell}>name</Text>
                  {sortColumn==='name'&&<Text style={s.sortBadge}>{sortDirection==='asc'?' ▲':' ▼'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setActiveHeaderMenu(activeHeaderMenu==='name'?null:'name')} style={s.filterTrigger}>
                  <Text style={[s.filterTriggerText,activeHeaderMenu==='name'&&s.filterTriggerActive]}>▾</Text>
                </TouchableOpacity>
              </View>

              <View style={[s.thCellWrap, s.colMarks]}>
                <TouchableOpacity onPress={() => toggleSort('marks')} style={s.thTitleBtn}>
                  <Text style={s.thCell}>marks</Text>
                  {sortColumn==='marks'&&<Text style={s.sortBadge}>{sortDirection==='asc'?' ▲':' ▼'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setActiveHeaderMenu(activeHeaderMenu==='marks'?null:'marks')} style={s.filterTrigger}>
                  <Text style={[s.filterTriggerText,activeHeaderMenu==='marks'&&s.filterTriggerActive]}>▾</Text>
                </TouchableOpacity>
              </View>

              <View style={[s.thCellWrap, s.colAbsent]}>
                <TouchableOpacity onPress={()=>setActiveHeaderMenu(activeHeaderMenu==='absent'?null:'absent')} style={s.thTitleBtn}>
                  <Text style={s.thCell}>absent</Text>
                  <Text style={s.filterTriggerText}>▾</Text>
                </TouchableOpacity>
              </View>
            </View>

            {activeHeaderMenu && (
              <View style={[
                s.columnMenuDropdown,
                activeHeaderMenu==='sl'&&{left:6},
                activeHeaderMenu==='reg'&&{left:55},
                activeHeaderMenu==='name'&&{left:140},
                activeHeaderMenu==='marks'&&{right:120},
                activeHeaderMenu==='absent'&&{right:6}
              ]}>
                {activeHeaderMenu==='sl'&&(
                  <>
                    <Text style={s.menuHeader}>Sl No Filter & Sort</Text>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('sl');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬆️ Sort: 1 → 93 (Ascending)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('sl');setSortDirection('desc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬇️ Sort: 93 → 1 (Descending)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('sl');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={[s.menuItemText,{color:'#1d5fa7'}]}>🔄 Reset to Default (1 → 93)</Text>
                    </TouchableOpacity>
                  </>
                )}
                {activeHeaderMenu==='reg'&&(
                  <>
                    <Text style={s.menuHeader}>Reg No Filter & Sort</Text>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('reg');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬆️ Sort: Lowest Reg No first</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('reg');setSortDirection('desc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬇️ Sort: Highest Reg No first</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('sl');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={[s.menuItemText,{color:'#1d5fa7'}]}>🔄 Reset to Original Order</Text>
                    </TouchableOpacity>
                  </>
                )}
                {activeHeaderMenu==='name'&&(
                  <>
                    <Text style={s.menuHeader}>Name Filter & Sort</Text>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('name');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬆️ Sort: A → Z (Alphabetical)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('name');setSortDirection('desc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬇️ Sort: Z → A (Reverse)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('sl');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={[s.menuItemText,{color:'#1d5fa7'}]}>🔄 Reset to Original Order</Text>
                    </TouchableOpacity>
                  </>
                )}
                {activeHeaderMenu==='marks'&&(
                  <>
                    <Text style={s.menuHeader}>Marks Filter & Sort</Text>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('marks');setSortDirection('desc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬇️ Sort: Highest Marks First</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setSortColumn('marks');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⬆️ Sort: Lowest Marks First</Text>
                    </TouchableOpacity>
                    <View style={s.menuDivider} />
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setStudentFilter('completed');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>✓ Filter: Entered Marks Only ({enteredCount})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setStudentFilter('pending');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>⏳ Filter: Missing / Pending Only ({pendingCount})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setStudentFilter('absent');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>❌ Filter: Absent Only ({absentCount})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setStudentFilter('all');setSortColumn('sl');setSortDirection('asc');setActiveHeaderMenu(null);}}>
                      <Text style={[s.menuItemText,{color:'#1d5fa7'}]}>🔄 Show All & Reset Sort</Text>
                    </TouchableOpacity>
                  </>
                )}
                {activeHeaderMenu==='absent'&&(
                  <>
                    <Text style={s.menuHeader}>Absent Filter</Text>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setStudentFilter('absent');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>❌ Filter: Absent Only ({absentCount})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setStudentFilter('completed');setActiveHeaderMenu(null);}}>
                      <Text style={s.menuItemText}>✓ Filter: Present / With Marks</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.menuItem} onPress={()=>{setStudentFilter('all');setActiveHeaderMenu(null);}}>
                      <Text style={[s.menuItemText,{color:'#1d5fa7'}]}>📋 Show All Students ({students.length})</Text>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={s.menuCloseBtn} onPress={()=>setActiveHeaderMenu(null)}>
                  <Text style={s.menuCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            )}

            {filteredStudents.length === 0 ? (
              <View style={s.emptyRow}>
                <Text style={s.emptyRowText}>No students match the search/filter criteria.</Text>
              </View>
            ) : (
              filteredStudents.map((student, idx) => (
                <View
                  key={student.id}
                  style={[
                    s.tableRow,
                    student.absent && s.rowAbsent,
                    idx % 2 === 1 && s.rowAlt
                  ]}
                >
                  <Text style={[s.tdCell, s.colSl, { fontWeight: '700', color: '#64748b' }]}>
                    {student.originalIndex + 1}
                  </Text>
                  <Text style={[s.tdCell, s.colReg, s.regText]}>
                    {student.registration_no}
                  </Text>
                  <View style={[s.colName, { paddingHorizontal: 6 }]}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={s.nameText}>
                      {student.student_name}
                    </Text>
                  </View>
                  <View style={s.colMarks}>
                    {student.absent ? (
                      <View style={s.hiddenMark}>
                        <Text style={s.hiddenMarkText}>Absent</Text>
                      </View>
                    ) : (
                      <TextInput
                        editable={!lockedForTeacher}
                        placeholder="Marks"
                        placeholderTextColor="#cbd5e1"
                        value={student.obtained_marks}
                        onChangeText={value => setMark(student.id, value)}
                        keyboardType="numeric"
                        style={s.markInput}
                      />
                    )}
                  </View>
                  <View style={s.colAbsent}>
                    <TouchableOpacity
                      disabled={lockedForTeacher}
                      onPress={() => toggleAbsent(student.id)}
                      style={[s.absentButton, student.absent && s.absentActive]}
                    >
                      <Text style={[s.absentText, student.absent && s.absentActiveText]}>
                        {student.absent ? 'ABSENT' : 'Mark Absent'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <View style={s.actionRow}>{editingId&&<TouchableOpacity onPress={newEntry} style={s.saveButton}><Text style={s.buttonText}>Back / New Entry</Text></TouchableOpacity>}{!lockedForTeacher&&<TouchableOpacity disabled={saving} onPress={()=>save('draft')} style={s.saveButton}><Text style={s.buttonText}>{savingMode==='draft'?'Saving...':editingTest?.locked?'Update Marks as Admin':'Save as Draft'}</Text></TouchableOpacity>}{!lockedForTeacher&&!editingTest?.locked&&<TouchableOpacity disabled={saving} onPress={()=>save('final')} style={[s.saveButton,{backgroundColor:'#167447'}]}><Text style={s.buttonText}>{savingMode==='final'?'Submitting...':'Final Submit'}</Text></TouchableOpacity>}{editingId&&(canManage||!editingTest?.locked)&&<TouchableOpacity onPress={()=>{const test=tests.find(item=>Number(item.id)===editingId)||{id:editingId,exam_name:form.examName,class_name:form.className,subject_name:form.subjectName};deleteTest(test);}} style={[s.saveButton,s.deleteFormButton]}><Text style={s.buttonText}>Delete Exam</Text></TouchableOpacity>}{canManage&&<><TouchableOpacity onPress={print} style={s.printButton}><Text style={s.printText}>Print</Text></TouchableOpacity>{editingId&&<TouchableOpacity onPress={downloadExcel} style={s.printButton}><Text style={s.printText}>Excel</Text></TouchableOpacity>}</>}</View>
    </>}

    {canManage&&<View style={s.publishPanel}>
      <Text style={s.publishTitle}>Publish Weekly Result by Class</Text>
      <View style={s.publishControls}>
        <View style={s.publishSelect}><Select label="Result session" value={resultSession} onChange={value=>{setResultSession(value);setPublishTestId('');}} options={[{value:'all',label:'All Sessions'},...Array.from(new Set([...SESSION_OPTIONS,...tests.map(item=>String(item.session_name||'')).filter(Boolean)])).sort().reverse().map(value=>({value,label:value}))]}/></View>
        <View style={s.publishSelect}><Select label="Publish class" value={publishClass} onChange={value=>{setPublishClass(value);setPublishTestId('');}} options={[{value:'',label:'Select class'},...Array.from(new Set(tests.map(item=>String(item.class_name)))).map(value=>({value,label:value}))]}/></View>
        <View style={s.publishSelect}><Select label="Result" value={publishTestId} onChange={setPublishTestId} options={[{value:'',label:'Select result to publish'},...tests.filter(item=>item.locked&&(resultSession==='all'||item.session_name===resultSession)&&(!publishClass||String(item.class_name)===publishClass)).map(item=>({value:String(item.id),label:String(item.exam_name)+' - '+String(item.subject_name)+(item.is_published?' (Published)':'' )}))]}/></View>
        <TouchableOpacity disabled={!publishTestId} onPress={()=>{const test=tests.find(item=>String(item.id)===publishTestId);if(test)publish(test);}} style={[s.publishButton,!publishTestId&&{opacity:.5}]}><Text style={s.buttonText}>{tests.find(item=>String(item.id)===publishTestId)?.is_published?'Unpublish Selected':'Publish Selected'}</Text></TouchableOpacity>
      </View>
    </View>}

    <View style={{marginTop:8,marginBottom:8}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
        <Text style={[s.sectionTitle,{marginTop:0,marginBottom:0}]}>Weekly Tests ({displayedWeeklyTests.length})</Text>
        <View style={{flexDirection:'row',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <TextInput
            placeholder="🔍 Search tests..."
            placeholderTextColor="#8492a6"
            value={weeklyTestSearch}
            onChangeText={setWeeklyTestSearch}
            style={[s.searchInput,{paddingVertical:6,paddingHorizontal:10,fontSize:12,minWidth:140}]}
          />
        </View>
      </View>
      <View style={{flexDirection:'row',gap:6,marginTop:8,flexWrap:'wrap'}}>
        {['all',...STUDENT_CLASSES].map(c=>(
          <TouchableOpacity
            key={c}
            onPress={()=>setWeeklyTestClassFilter(c)}
            style={[s.filterChip,{paddingVertical:4,paddingHorizontal:9},weeklyTestClassFilter===c&&s.filterChipActive]}
          >
            <Text style={[s.filterChipText,{fontSize:11},weeklyTestClassFilter===c&&s.filterChipTextActive]}>
              {c==='all'?'All Classes':`Class ${c}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>

    {displayedWeeklyTests.map(test=><View key={test.id} style={s.testCard}><View style={{flex:1}}><Text style={s.testTitle}>{test.exam_name}  -  {test.class_name}</Text><Text style={s.meta}>Session {test.session_name||'Not set'}  -  {test.subject_name}  -  Full {test.full_marks}  -  {String(test.exam_date).slice(0,10)}</Text><Text style={s.meta}>{test.student_count} students</Text><Text style={{marginTop:6,fontWeight:'900',color:test.locked?'#167447':'#a56700'}}>{test.locked?'Submitted':'Draft'}</Text><Text style={s.meta}>{test.locked?'Submitted by: ':'Draft saved by: '}{test.entered_by_name||'User'}</Text></View>{canManage&&test.locked&&<TouchableOpacity onPress={()=>publish(test)} style={[s.viewButton,test.is_published&&{backgroundColor:'#dff3e5'}]}><Text style={s.viewText}>{test.is_published?'Published':'Publish'}</Text></TouchableOpacity>}<TouchableOpacity onPress={()=>openTest(test.id)} style={s.viewButton}><Text style={s.viewText}>{canManage||!test.locked?'Edit':'View'}</Text></TouchableOpacity>{(canManage||!test.locked)&&<TouchableOpacity onPress={()=>deleteTest(test)} style={[s.viewButton,s.deleteButton]}><Text style={[s.viewText,s.deleteText]}>Delete</Text></TouchableOpacity>}</View>)}
    {displayedWeeklyTests.length===0&&<View style={s.emptyRow}><Text style={s.emptyRowText}>No weekly tests found.</Text></View>}
    {loading&&<ActivityIndicator color="#1d5fa7" style={{margin:15}}/>}
  </ScrollView>
  <ScrollNavigationButtons scrollRef={scrollRef} />
  </SafeAreaView>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:'#f2f6fb'},
  content:{width:'100%',maxWidth:980,alignSelf:'center',padding:16,paddingBottom:50},
  titleRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},
  title:{fontSize:27,fontWeight:'900',color:'#173d68',marginTop:6},
  help:{color:'#66798e',marginTop:4,marginBottom:16},
  newButton:{borderWidth:1,borderColor:'#1d5fa7',borderRadius:8,padding:9},
  newText:{color:'#1d5fa7',fontWeight:'800'},
  formCard:{backgroundColor:'#fff',borderRadius:16,padding:15,borderWidth:1,borderColor:'#d8e2ed'},
  formGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  fieldWrap:{flexGrow:1,width:'30%',minWidth:210},
  dateField:{minHeight:42,borderWidth:1,borderColor:'#ccd3da',borderRadius:10,padding:12,backgroundColor:'#fff'},
  label:{fontWeight:'700',color:'#486079',marginBottom:5},
  input:{marginBottom:0},
  loadButton:{backgroundColor:'#1d5fa7',borderRadius:9,padding:11,marginTop:8},
  buttonText:{color:'#fff',fontWeight:'900',textAlign:'center'},
  lockBox:{backgroundColor:'#fff0d2',borderRadius:8,padding:10,marginBottom:12},
  adminBox:{backgroundColor:'#e0f1ff'},
  lockText:{fontWeight:'800',color:'#61491d'},
  summary:{flexDirection:'row',justifyContent:'space-between',backgroundColor:'#dfeefe',borderRadius:10,padding:12,marginVertical:14,flexWrap:'wrap',gap:8},
  summaryText:{fontWeight:'900',color:'#214e7d',fontSize:13.5},
  filterRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:10},
  searchWrap:{flex:1,minWidth:220,position:'relative',justifyContent:'center'},
  searchInput:{backgroundColor:'#fff',borderWidth:1,borderColor:'#cbd5e1',borderRadius:8,paddingHorizontal:12,paddingVertical:9,fontSize:13,color:'#1e293b'},
  clearBtn:{position:'absolute',right:10,padding:4},
  clearBtnText:{color:'#94a3b8',fontSize:14,fontWeight:'800'},
  filterTabs:{flexDirection:'row',gap:6,flexWrap:'wrap'},
  filterChip:{backgroundColor:'#f1f5f9',borderWidth:1,borderColor:'#cbd5e1',paddingHorizontal:10,paddingVertical:7,borderRadius:7},
  filterChipActive:{backgroundColor:'#1d5fa7',borderColor:'#1d5fa7'},
  filterChipText:{fontSize:12,fontWeight:'700',color:'#475569'},
  filterChipTextActive:{color:'#ffffff'},
  tableCard:{backgroundColor:'#fff',borderRadius:12,borderWidth:1,borderColor:'#d8e2ed',overflow:'hidden',marginBottom:12},
  tableHeader:{flexDirection:'row',alignItems:'center',backgroundColor:'#173d68',paddingVertical:11,paddingHorizontal:8},
  thCell:{color:'#ffffff',fontWeight:'800',fontSize:12.5,textTransform:'uppercase',letterSpacing:0.5},
  thCellWrap:{flexDirection:'row',alignItems:'center',justifyContent:'center'},
  thTitleBtn:{flexDirection:'row',alignItems:'center',gap:3},
  sortBadge:{color:'#fbbf24',fontSize:10,fontWeight:'900'},
  filterTrigger:{paddingHorizontal:4,paddingVertical:2,borderRadius:4,marginLeft:2},
  filterTriggerText:{color:'#93c5fd',fontSize:12,fontWeight:'900'},
  filterTriggerActive:{color:'#ffffff',backgroundColor:'#1e40af'},
  resetAllBtn:{backgroundColor:'#fee2e2',borderWidth:1,borderColor:'#fca5a5',paddingVertical:6,paddingHorizontal:10,borderRadius:7},
  resetAllText:{color:'#b91c1c',fontSize:12,fontWeight:'800'},
  columnMenuDropdown:{
    position:'absolute',
    top:44,
    backgroundColor:'#ffffff',
    borderWidth:1,
    borderColor:'#cbd5e1',
    borderRadius:10,
    padding:8,
    minWidth:210,
    shadowColor:'#000',
    shadowOffset:{width:0,height:4},
    shadowOpacity:0.15,
    shadowRadius:8,
    elevation:8,
    zIndex:1000
  },
  menuHeader:{fontSize:11.5,fontWeight:'800',color:'#475569',marginBottom:6,paddingHorizontal:6,textTransform:'uppercase'},
  menuItem:{paddingVertical:7,paddingHorizontal:8,borderRadius:6,marginVertical:1},
  menuItemText:{fontSize:12.5,color:'#1e293b',fontWeight:'700'},
  menuDivider:{height:1,backgroundColor:'#e2e8f0',marginVertical:5},
  menuCloseBtn:{marginTop:6,paddingVertical:5,backgroundColor:'#f1f5f9',borderRadius:6,alignItems:'center'},
  menuCloseText:{color:'#64748b',fontSize:11.5,fontWeight:'700'},
  tableRow:{flexDirection:'row',alignItems:'center',paddingVertical:7,paddingHorizontal:8,borderBottomWidth:1,borderBottomColor:'#f1f5f9',backgroundColor:'#ffffff'},
  rowAlt:{backgroundColor:'#f8fafc'},
  rowAbsent:{backgroundColor:'#fef2f2'},
  tdCell:{fontSize:13,color:'#334155'},
  regText:{fontWeight:'800',color:'#1d5fa7'},
  nameText:{fontWeight:'800',color:'#1e293b',fontSize:13.5},
  colSl:{width:55,textAlign:'center'},
  colReg:{width:85,textAlign:'center'},
  colName:{flex:1,minWidth:170},
  colMarks:{width:110,alignItems:'center',justifyContent:'center'},
  colAbsent:{width:120,alignItems:'center',justifyContent:'center'},
  emptyRow:{padding:25,alignItems:'center',justifyContent:'center'},
  emptyRowText:{color:'#64748b',fontSize:13,fontWeight:'600'},
  meta:{color:'#718091',fontSize:12,marginTop:3},
  markInput:{width:82,borderWidth:1,borderColor:'#aebdcb',borderRadius:8,padding:8,textAlign:'center',backgroundColor:'#fff',fontWeight:'800',color:'#1e293b'},
  disabledInput:{backgroundColor:'#eee'},
  hiddenMark:{width:82,paddingVertical:8,alignItems:'center'},
  hiddenMarkText:{color:'#b91c1c',fontSize:11.5,fontWeight:'800'},
  absentButton:{borderWidth:1,borderColor:'#cf4854',borderRadius:8,paddingHorizontal:10,paddingVertical:8},
  absentActive:{backgroundColor:'#c93643'},
  absentText:{color:'#b42e3a',fontSize:11,fontWeight:'900'},
  absentActiveText:{color:'#fff'},
  actionRow:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:10},
  saveButton:{flex:1,backgroundColor:'#145b9f',borderRadius:10,padding:14},
  printButton:{borderWidth:1,borderColor:'#145b9f',borderRadius:10,paddingHorizontal:24,justifyContent:'center'},
  printText:{color:'#145b9f',fontWeight:'900'},
  publishPanel:{backgroundColor:'#eaf3ff',borderWidth:1,borderColor:'#bfd7f0',borderRadius:10,padding:10,marginTop:8},
  publishTitle:{fontSize:15,fontWeight:'900',color:'#173d68',marginBottom:6},
  publishControls:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},
  publishSelect:{flex:1,minWidth:210},
  publishButton:{backgroundColor:'#167447',borderRadius:9,padding:11,minWidth:140},
  sectionTitle:{fontSize:18,fontWeight:'900',color:'#213e5d',marginTop:0,marginBottom:6},
  testCard:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:8,flexDirection:'row',alignItems:'center',gap:10},
  testTitle:{fontWeight:'900',color:'#243f5c'},
  viewButton:{backgroundColor:'#e1edfa',borderRadius:8,paddingHorizontal:15,paddingVertical:10},
  viewText:{color:'#15538e',fontWeight:'900'},
  deleteButton:{backgroundColor:'#fee2e2',borderWidth:1,borderColor:'#fca5a5'},
  deleteText:{color:'#b91c1c'},
  deleteFormButton:{backgroundColor:'#b91c1c',flex:0,minWidth:130}
});




