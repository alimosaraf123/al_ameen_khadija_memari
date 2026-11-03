import React,{useEffect,useMemo,useRef,useState}from'react';
import{ActivityIndicator,Alert,Modal,PanResponder,Platform,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View}from'react-native';
import{SafeAreaView}from'react-native-safe-area-context';
import{useRouter}from'expo-router';
import*as DocumentPicker from'expo-document-picker';
import*as FileSystem from'expo-file-system';
import*as Print from'expo-print';
import AcademyHeader from'../components/AcademyHeader';
import TeacherRoutineHistory from'../components/TeacherRoutineHistory';
import DatePickerField from'../components/DatePickerField';
import ExamRoutinePanel from'../components/ExamRoutinePanel';
import{Select}from'../components/StudentDirectory';
import{API_BASE,api}from'../lib/api';
import{getUser,getToken}from'../lib/auth';import{confirmAction}from'../lib/confirm';
import*as Sharing from'expo-sharing';

type Group='v_x'|'xi_xii'|'coaching';
type Cell={subject?:string;teacher_id?:string;teacher_name?:string};
const GROUPS:[Group,string][]=[['v_x','Class V-X'],['xi_xii','Class XI-XII'],['coaching','Coaching']];
const CFG={
 v_x:{rows:['V','VI','VII','VIII','IX','X'],subjects:['Arabic','Art','Beng','Bio','Chem','Comp','Eng','Eng-I','Eng-II','Geo','Hind','Hist','L.Sc','Math','P.Sc','Phy','Sci'],periods:[['1st','10:00-10:40'],['2nd','10:40-11:20'],['3rd','11:20-12:00'],['4th','12:00-12:40'],['Tiffin','12:40-1:40'],['5th','1:40-2:20'],['6th','2:20-3:00'],['7th','3:00-3:40']]},
 xi_xii:{rows:['XI-A','XI-B','XII-A','XII-B'],subjects:['Phy','Chem','Math','Bio','Beng','Eng'],periods:[['1st','6:30-7:30'],['2nd','7:30-8:30'],['3rd','8:30-9:30'],['4th','10:00-11:00'],['5th','11:00-12:00'],['6th','12:00-1:00']]}
}as const;
const ALL_SUBJECTS=['Arabic','Art','Beng','Bio','Chem','Comp','Eng','Eng-I','Eng-II','Geo','Hind','Hist','L.Sc','Math','P.Sc','Phy','Sci'];
const TIMES=['6:30-7:30','7:30-8:30','8:30-9:30','3:30-4:30','4:30-5:30','6:45-8:00','8:00-9:15'];
const BASE_ROOMS=['Library-I','Library-II','Corridor','XII-A','XII-B','XI-A','XI-B','Visitor','X','401','402','403','404'];
// A teacher may be shown only for the exact subject assigned in Staff Management.
// This normalizes alternate spellings, but deliberately does not group related subjects
// (for example, Physics is not Chemistry, P.Sc, or Science).
const canon=(v:any)=>{const k=String(v||'').toLowerCase().replace(/[^a-z]/g,'');return({english:'eng',eng:'eng',englishi:'engi',engi:'engi',englishii:'engii',engii:'engii',bengali:'beng',beng:'beng',biology:'bio',bio:'bio',physics:'phy',phy:'phy',chemistry:'chem',chem:'chem',mathematics:'math',math:'math',maths:'math',lifescience:'lsc',lsc:'lsc',physicalscience:'psc',psc:'psc',science:'sci',sci:'sci',geography:'geo',geo:'geo',history:'hist',hist:'hist',histroy:'hist',computer:'comp',comp:'comp',arabic:'arabic',arab:'arabic'}as any)[k]||k};
function getShortTeacherName(name: string, teacher?: any): string {
  if (!name) return '';
  const clean = name.trim();
  const first = clean.split(/\s+/)[0];
  if (/^ayesha/i.test(first)) {
    const isSiddiki = /siddiki/i.test(clean) || (teacher && /siddiki/i.test(String(teacher.name || '')));
    return isSiddiki ? 'Ayesha (Hist)' : 'Ayesha (Geo)';
  }
  if (/^firdousi/i.test(first) && teacher?.subject) {
    const sub = String(teacher.subject).trim();
    if (sub) return `Firdousi (${sub})`;
  }
  if (/^jayanta/i.test(first)) {
    if (/das/i.test(clean) || teacher?.subject === 'Math') return 'Jayanta (Math)';
    if (/nath/i.test(clean) || teacher?.subject === 'Chem') return 'Jayanta (Chem)';
  }
  if (/^kamrun/i.test(first)) return 'Kamrun';
  if (/^zinnat/i.test(first)) return 'Zinnat';
  if (/^monalisa/i.test(first)) return 'Monalisa';
  return first;
}
function subjectMatches(tSub:any,rSub:any):boolean{
 const teacherSubject=canon(tSub), routineSubject=canon(rSub);
 return !!teacherSubject&&teacherSubject===routineSubject;
}
const dayName=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)?new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'}):'-';
const dateLabel=(d:string)=>d.split('-').reverse().join('-');
const isTiffin=(period:any)=>String(period?.[0]||'').trim().toLowerCase()==='tiffin';
function shiftDate(dateStr: string, days: number): string {
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

export default function Routines(){
 const router=useRouter(),today=new Date().toISOString().slice(0,10);
 const[group,setGroup]=useState<Group>('v_x'),[date,setDate]=useState(today),[cells,setCells]=useState<Record<string,Cell>>({});
 const[rows,setRows]=useState<string[]>([...CFG.v_x.rows]),[periods,setPeriods]=useState<string[][]>(CFG.v_x.periods.map(x=>[...x])),[coachTimes,setCoachTimes]=useState<string[]>([...TIMES]);
 const[exams,setExams]=useState<any[]>([]),[exam,setExam]=useState<any>({class_name:'',subject:'',time:'',room:'',teacher_id:'',teacher_name:''});
 const[configOpen,setConfigOpen]=useState(false),[masterOpen,setMasterOpen]=useState(false),[examOpen,setExamOpen]=useState(false),[assignOpen,setAssignOpen]=useState(false),[masterDay,setMasterDay]=useState(String(new Date().getDay()));
 const[rowDraft,setRowDraft]=useState(''),[periodDraft,setPeriodDraft]=useState(''),[roomDraft,setRoomDraft]=useState(''),[timeDraft,setTimeDraft]=useState('');
 const[assignTeacher,setAssignTeacher]=useState(''),[assignSubjects,setAssignSubjects]=useState<string[]>([]),[subjectBusy,setSubjectBusy]=useState('');
 const[teachers,setTeachers]=useState<any[]>([]),[rooms,setRooms]=useState<string[]>(BASE_ROOMS),[availability,setAvailability]=useState<Record<string,string>>({}),[admin,setAdmin]=useState<boolean|null>(null);
 const[saving,setSaving]=useState(false),[source,setSource]=useState('none'),[noClass,setNoClass]=useState(false),[offClasses,setOffClasses]=useState<string[]>([]),[offTimes,setOffTimes]=useState<string[]>([]),[offMenuOpen,setOffMenuOpen]=useState(false),[offTarget,setOffTarget]=useState(''),[combinedClassCounting,setCombinedClassCounting]=useState(false);
 const[saveFeedback,setSaveFeedback]=useState<{kind:'pending'|'success'|'error';message:string}|null>(null);
 const[showCombinedHighlight,setShowCombinedHighlight]=useState(true);
 const[clearedDuplicates,setClearedDuplicates]=useState<string[]>([]);
 const[history,setHistory]=useState<any[]>([]),[historyOpen,setHistoryOpen]=useState(false);
 const[reportOpen,setReportOpen]=useState(false),[month,setMonth]=useState(today.slice(0,7)),[dailyReportDate,setDailyReportDate]=useState(today),[report,setReport]=useState<any>(null),[downloadingReport,setDownloadingReport]=useState(false),[expandReport,setExpandReport]=useState(false),[reportFilter,setReportFilter]=useState('');
 const[teacherSheetModal,setTeacherSheetModal]=useState<{teacher:any;kind:'coaching'|'xi_xii'|'v_x'|'all'}|null>(null),[downloadingTeacherExcel,setDownloadingTeacherExcel]=useState(false);
 const[countWidth,setCountWidth]=useState(190),countWidthRef=useRef(190);
 const pageScrollRef=useRef<ScrollView>(null),pageScrollYRef=useRef(0),pendingPageScrollYRef=useRef<number|null>(null);
 const countResizeResponder=useRef(PanResponder.create({onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderMove:(_,gesture)=>{const next=Math.max(100,Math.min(420,countWidthRef.current-gesture.dx));setCountWidth(next)},onPanResponderRelease:(_,gesture)=>{const next=Math.max(100,Math.min(420,countWidthRef.current-gesture.dx));countWidthRef.current=next;setCountWidth(next)}})).current;
 const academic=group!=='coaching',section=academic?{...CFG[group],rows,periods}:null;

 useEffect(()=>{void(async()=>{try{const u=await getUser<any>(),ok=['admin','super_admin'].includes(u?.role);if(!ok){if(u?.role==='teacher'){setAdmin(false);return}router.replace('/');return}setAdmin(true);const[t,a]=await Promise.all([api('/api/teachers'),api('/api/teachers/availability?date='+date)]);setTeachers((t.teachers||[]).filter((x:any)=>x.is_active!==false));setAvailability(Object.fromEntries((a.staff||[]).map((x:any)=>[String(x.id),x.status])))}catch(e:any){Alert.alert('Error',e.message)}})()},[]);
 useEffect(()=>{if(admin)void load()},[group,date,admin]);
 useEffect(()=>{if(saveFeedback&&saveFeedback.kind==='success'){const timer=setTimeout(()=>{setSaveFeedback(null)},2500);return ()=>clearTimeout(timer)}},[saveFeedback]);
 function applyRoutine(r:any){const data=r?.grid_data||{},base=group==='v_x'?CFG.v_x:CFG.xi_xii;setNoClass(!!data.no_class);setOffClasses(Array.isArray(data.off_classes)?data.off_classes.map(String):[]);setOffTimes(Array.isArray(data.off_times)?data.off_times.map(String):[]);setOffTarget('');setSource(r?.source||'none');setExams(data.exams||[]);setCombinedClassCounting(Boolean(data.combined_class_counting || (Array.isArray(data.cleared_duplicates) && data.cleared_duplicates.length > 0)));setClearedDuplicates(Array.isArray(data.cleared_duplicates)?data.cleared_duplicates:[]);if(academic){const rr=data.classes?.length?data.classes:[...base.rows],pp=data.periods?.length?data.periods:base.periods.map(x=>[...x]),tiffin=new Set(pp.map((p:any,i:number)=>isTiffin(p)?i:-1).filter((i:number)=>i>=0)),clean=Object.fromEntries(Object.entries(data.cells||{}).filter(([key])=>!tiffin.has(Number(key.split('|')[1])))) as Record<string,Cell>;setCells(clean);setRows(rr);setPeriods(pp);setRowDraft(rr.join(', '));setPeriodDraft(pp.map((x:any)=>x.join('|')).join('\n'))}else{setCells(data.cells||{});const rm=data.rooms?.length?data.rooms:[...BASE_ROOMS],tt=data.times?.length?data.times:[...TIMES];setRooms(rm);setCoachTimes(tt);setRoomDraft(rm.join(', '));setTimeDraft(tt.join('\n'))}}
 function restorePageScroll(offset:number){setTimeout(()=>pageScrollRef.current?.scrollTo({y:offset,animated:false}),0)}
 function switchGroup(next:Group){if(next===group)return;const offset=pageScrollYRef.current;pendingPageScrollYRef.current=offset;setSaveFeedback(null);setOffTarget('');setOffMenuOpen(false);setGroup(next);restorePageScroll(offset)}
 function toggleOffTarget(){if(!offTarget)return;if(academic)setOffClasses(current=>current.includes(offTarget)?current.filter(value=>value!==offTarget):[...current,offTarget]);else setOffTimes(current=>current.includes(offTarget)?current.filter(value=>value!==offTarget):[...current,offTarget]);setOffTarget('')}
 async function load(){try{const d=await api(`/api/routines/manager?group=${group}&date=${date}`);applyRoutine(d.routine)}catch(e:any){Alert.alert('Error',e.message)}finally{const offset=pendingPageScrollYRef.current;if(offset!==null){pendingPageScrollYRef.current=null;restorePageScroll(offset);setTimeout(()=>pageScrollRef.current?.scrollTo({y:offset,animated:false}),60)}}}
 async function loadSelectedMaster(){try{const d=await api(`/api/routines/manager/master?group=${group}&day=${masterDay}`);if(!d.routine)return Alert.alert('Weekly Master','No saved master found for the selected weekday.');applyRoutine(d.routine);Alert.alert('Weekly Master',dayName(String(d.routine.routine_date).slice(0,10))+' master loaded.')}catch(e:any){Alert.alert('Weekly Master',e.message)}}

  const mapped=(t:any):string[]=>{
    const routineSubjects=String(t?.subject||'')
      .split(/[,\n]+/)
      .map((v:string)=>v.trim())
      .filter((v:string)=>Boolean(v));
    const assignedSubjects:string[]=Array.isArray(t?.assigned_subjects)
      ? (t.assigned_subjects as unknown[]).map((v:any)=>String(v).trim()).filter((v:string)=>Boolean(v))
      : [];
    return [...new Set([...routineSubjects,...assignedSubjects]
      .map((v:string)=>String(v).trim())
      .filter((v:string)=>Boolean(v)))];
  };
 const isTeachingTeacher=(t:any)=>{if(!t)return false;const d=t.profile_details||{};const des=String(t.designation||'').toLowerCase();const cat=String(d.staff_category||'').toLowerCase();if(des.includes('nonteach')||cat.includes('nonteach'))return false;if(cat.includes('teach')||des.includes('teach'))return true;const staffTypes=[d.staff_type,d.type_of_staff,t.staff_type,t.type_of_staff].map((v:any)=>String(v||'').trim().toLowerCase()).filter(Boolean);if(staffTypes.some((v:string)=>v.includes('teach')))return true;const role=String(t.user_role||t.role||'').trim().toLowerCase();return role==='teacher';};
 const teacherNameForCell=(cell:Cell)=>{const teacher=teachers.find(t=>String(t.id)===String(cell.teacher_id));return teacher&&isTeachingTeacher(teacher)?String(teacher.name||cell.teacher_name||''):'';};
 const teacherOnlyCells=(source:Record<string,Cell>)=>Object.fromEntries(Object.entries(source).filter(([,cell])=>isTeachingTeacher(teachers.find(t=>String(t.id)===String(cell.teacher_id)))));
 const update=(key:string,value:Partial<Cell>)=>setCells(old=>({...old,[key]:{...old[key],...value}}));
 const chooseSubject=(key:string,subject:string)=>{const teacher=teachers.find(t=>String(t.id)===String(cells[key]?.teacher_id)),keepsTeacher=teacher&&isTeachingTeacher(teacher)&&mapped(teacher).some((value:string)=>subjectMatches(value,subject));update(key,keepsTeacher?{subject}:{subject,teacher_id:'',teacher_name:''})};
 const chooseTeacher=(key:string,id:string)=>{const t=teachers.find(x=>String(x.id)===id),allowed=(section?.subjects||[]).filter(s=>mapped(t).some((v:string)=>subjectMatches(v,s))),current=String(cells[key]?.subject||''),subject=allowed.length===1?allowed[0]:(allowed.some(s=>subjectMatches(s,current))?current:'');update(key,{teacher_id:id,teacher_name:t?.name||'',...(academic?{subject}:{})})};
 const duplicateGroups=useMemo(()=>{
  const slots:Record<string,string[]>={};
  Object.entries(cells).forEach(([key,v])=>{
    const teacher=teachers.find(t=>String(t.id)===String(v.teacher_id));
    if(!v.teacher_id||v.teacher_id==='0'||(academic&&!String(v.subject||'').trim())||!teacher||!isTeachingTeacher(teacher))return;
    const p=key.split('|'),slot=(group==='coaching'?p[0]:p[1])+'|'+v.teacher_id;
    (slots[slot]||=[]).push(key);
  });
  return Object.entries(slots).filter(([,keys])=>keys.length>1).map(([slot,keys])=>({signature:JSON.stringify([group,slot,[...keys].sort()]),keys}));
 },[cells,group,teachers,academic]);
 const conflicts=useMemo(()=>new Set(duplicateGroups.filter(entry=>!clearedDuplicates.includes(entry.signature)).flatMap(entry=>entry.keys)),[duplicateGroups,clearedDuplicates]);
 const combinedKeys=useMemo(()=>new Set(duplicateGroups.flatMap(entry=>entry.keys)),[duplicateGroups]);
 const allCombinedDetails=useMemo(()=>{
  return duplicateGroups.map(entry=>{
    const firstKey=entry.keys[0],cell=cells[firstKey]||{};
    const teacherName=teacherNameForCell(cell)||'Teacher';
    const p=firstKey.split('|'),periodIndex=Number(p[1]),periodLabel=academic?(periods[periodIndex]?.[0]||`${periodIndex+1}th`):p[0];
    const classList=entry.keys.map(k=>k.split('|')[0]).join(', ');
    const subj=cell.subject?` [${cell.subject}]`:'';
    return `${teacherName}${subj} (${classList} at ${periodLabel})`;
  });
 },[duplicateGroups,cells,teachers,academic,periods]);
 const conflictDetails=useMemo(()=>{
  return duplicateGroups.filter(entry=>!clearedDuplicates.includes(entry.signature)).map(entry=>{
    const firstKey=entry.keys[0],cell=cells[firstKey]||{};
    const teacherName=teacherNameForCell(cell)||'Teacher';
    const p=firstKey.split('|'),periodIndex=Number(p[1]),periodLabel=academic?(periods[periodIndex]?.[0]||`${periodIndex+1}th`):p[0];
    const classList=entry.keys.map(k=>k.split('|')[0]).join(', ');
    return `${teacherName} (${classList} at ${periodLabel})`;
  });
 },[duplicateGroups,clearedDuplicates,cells,teachers,academic,periods]);
 const allDuplicatesCleared=duplicateGroups.length>0&&duplicateGroups.every(entry=>clearedDuplicates.includes(entry.signature));
 function toggleDuplicateHighlights(){setClearedDuplicates(allDuplicatesCleared?[]:duplicateGroups.map(entry=>entry.signature));}

 const countedEntries=useMemo(()=>Object.entries(cells).filter(([key,value])=>{if(!value.teacher_id||!isTeachingTeacher(teachers.find(t=>String(t.id)===String(value.teacher_id))))return false;if(!academic){const r=key.split('|')[1];return rooms.includes(r);}const index=Number(key.split('|')[1]);return !isTiffin(periods[index])}),[cells,academic,periods,teachers,rooms]);
 const counts=useMemo(()=>{
  const all:Record<string,{name:string,count:number}>={},seen=new Set<string>();
  countedEntries.forEach(([key,v])=>{
    const parts=key.split('|');
    const slot=group==='coaching'?parts[0]:parts[1];
    const countKey=combinedClassCounting?String(v.teacher_id)+'|'+slot:key;
    if(seen.has(countKey))return;
    seen.add(countKey);
    (all[String(v.teacher_id)]||={name:teacherNameForCell(v)||'Teacher',count:0}).count++;
  });
  return Object.values(all).sort((a,b)=>a.name.localeCompare(b.name));
 },[countedEntries,combinedClassCounting,group]);
 const totalClasses=useMemo(()=>{
  const seen=new Set<string>();
  countedEntries.forEach(([key,v])=>{
    const parts=key.split('|');
    const slot=group==='coaching'?parts[0]:parts[1];
    const sessionKey=combinedClassCounting&&v.teacher_id?String(v.teacher_id)+'|'+slot:key;
    seen.add(sessionKey);
  });
  return seen.size;
 },[countedEntries,combinedClassCounting,group]);

async function save(mode:'master'|'draft'|'final'){
 if(saving)return;
 const action=mode==='master'?{title:'Save master routine',prompt:'Save this routine as the weekly master?',pending:'Saving master routine...'}:mode==='draft'?{title:'Save draft',prompt:'Save this date as a draft? It will not be published or sent to teachers.',pending:'Saving draft...'}:{title:'Publish routine',prompt:'Publish this routine to users?',pending:'Publishing routine...'};
 if(!await confirmAction(action.title,action.prompt))return;
 setSaving(true);setSaveFeedback({kind:'pending',message:action.pending});
 try{
  const tiffin=new Set(periods.map((p:any,i:number)=>isTiffin(p)?i:-1).filter((i:number)=>i>=0)),rawCells=academic?Object.fromEntries(Object.entries(cells).filter(([key])=>!tiffin.has(Number(key.split('|')[1])))):cells,safeCells=teacherOnlyCells(rawCells);
  const grid_data=academic?{classes:rows,periods,cells:safeCells,exams,no_class:noClass,off_classes:offClasses,off_times:[],combined_class_counting:combinedClassCounting,cleared_duplicates:clearedDuplicates}:{rooms,times:coachTimes,cells:safeCells,exams,no_class:noClass,off_classes:[],off_times:offTimes,combined_class_counting:combinedClassCounting,cleared_duplicates:clearedDuplicates};
  await api('/api/routines/manager',{method:'POST',body:JSON.stringify({group_name:group,routine_date:date,save_mode:mode,grid_data})});setSource(mode);await openHistory();
  const message=mode==='master'?`${dayName(date)} Master routine saved successfully.`:mode==='draft'?`Draft saved for ${GROUPS.find(x=>x[0]===group)?.[1]}, ${dateLabel(date)}.`: `Routine published successfully: ${GROUPS.find(x=>x[0]===group)?.[1]}, ${dateLabel(date)}.`;
  setSaveFeedback({kind:'success',message});if(Platform.OS!=='web')Alert.alert(mode==='final'?'Published':'Saved',message);
 }catch(e:any){setSaveFeedback({kind:'error',message:'Routine could not be saved: '+e.message});if(Platform.OS!=='web')Alert.alert('Error',e.message)}finally{setSaving(false)}
}
 const weekDates=useMemo(()=>{const base=new Date(date+'T12:00:00'),day=(base.getDay()+6)%7,monday=new Date(base);monday.setDate(base.getDate()-day);return Array.from({length:7},(_,i)=>{const x=new Date(monday);x.setDate(monday.getDate()+i);return x.toISOString().slice(0,10)})},[date]);
 function chooseMasterDay(value:string){setMasterDay(value);const current=new Date(date+'T12:00:00'),target=new Date(current);target.setDate(current.getDate()+(Number(value)-current.getDay()));setDate(target.toISOString().slice(0,10))}
 function applyConfig(){if(academic){const rr=rowDraft.split(',').map(x=>x.trim()).filter(Boolean),pp=periodDraft.split(/\n+/).map(x=>x.split('|').map(y=>y.trim())).filter(x=>x[0]&&x[1]);if(!rr.length||!pp.length)return Alert.alert('Required','Enter classes and periods. Use Period|Time on each line.');setRows(rr);setPeriods(pp)}else{const rr=roomDraft.split(',').map(x=>x.trim()).filter(Boolean),tt=timeDraft.split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!rr.length||!tt.length)return Alert.alert('Required','Enter rooms and times.');setRooms(rr);setCoachTimes(tt)}Alert.alert('Applied','Configuration applied. Save as Master or Final to keep it.')}
 async function applyCoachingRoomsToAllMasters(){const rooms=roomDraft.split(',').map(x=>x.trim()).filter(Boolean);if(!rooms.length)return Alert.alert('Required','Enter coaching rooms first.');try{setSaving(true);const result=await api('/api/routines/manager/coaching-rooms',{method:'POST',body:JSON.stringify({rooms})});setRooms(rooms);Alert.alert('Updated',result.message||'Coaching rooms updated in all weekly masters.');await load()}catch(e:any){Alert.alert('Error',e.message)}finally{setSaving(false)}}
 async function applyCoachingTimesToAllMasters(){const times=timeDraft.split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!times.length)return Alert.alert('Required','Enter coaching times first.');try{setSaving(true);const result=await api('/api/routines/manager/coaching-times',{method:'POST',body:JSON.stringify({times})});setCoachTimes(times);Alert.alert('Updated',result.message||'Coaching times updated in all weekly masters.');await load()}catch(e:any){Alert.alert('Error',e.message)}finally{setSaving(false)}}
 async function applyAcademicPeriodsToAllMasters(){const next=periodDraft.split(/\n+/).map(x=>x.split('|').map(y=>y.trim())).filter(x=>x[0]&&x[1]);if(!next.length)return Alert.alert('Required','Enter periods and times first.');try{setSaving(true);const result=await api('/api/routines/manager/academic-periods',{method:'POST',body:JSON.stringify({group_name:group,periods:next})});setPeriods(next);Alert.alert('Updated',result.message||'Academic periods updated in all weekly masters.');await load()}catch(e:any){Alert.alert('Error',e.message)}finally{setSaving(false)}}
 function addExam(){if(!exam.class_name||!exam.subject||!exam.time||!exam.teacher_id)return Alert.alert('Required','Select class, subject, time and duty teacher.');setExams(x=>[...x,{...exam,id:Date.now()}]);setExam({class_name:'',subject:'',time:'',room:'',teacher_id:'',teacher_name:''})}
 async function saveSubjects(){if(!assignTeacher)return Alert.alert('Required','Select a teacher.');try{await api('/api/teachers/'+assignTeacher+'/subjects',{method:'PATCH',body:JSON.stringify({subjects:assignSubjects})});setTeachers(list=>list.map(t=>String(t.id)===assignTeacher?{...t,subject:assignSubjects.join(', '),assigned_subjects:assignSubjects}:t));Alert.alert('Saved','Teacher subjects assigned.')}catch(e:any){Alert.alert('Error',e.message)}}
 async function toggleTeacherSubject(t:any,subject:string){const id=String(t.id),current=mapped(t),on=current.some((x:string)=>canon(x)===canon(subject)),next=on?current.filter((x:string)=>canon(x)!==canon(subject)):[...current,subject];setSubjectBusy(id+'|'+subject);setTeachers(list=>list.map(x=>String(x.id)===id?{...x,subject:next.join(', '),assigned_subjects:next}:x));try{await api('/api/teachers/'+id+'/subjects',{method:'PATCH',body:JSON.stringify({subjects:next})})}catch(e:any){setTeachers(list=>list.map(x=>String(x.id)===id?{...x,subject:current.join(', '),assigned_subjects:current}:x));Alert.alert('Error',e.message)}finally{setSubjectBusy('')}}
 const historyLabel=(item:any)=>item?.routine_kind==='draft'?'Draft (not published)':item?.is_master?'Master':'Final Published';
 async function openHistory(){try{const d=await api(`/api/routines/manager/history?group=${group}`);setHistory(d.routines||[]);setHistoryOpen(true)}catch(e:any){Alert.alert('Error',e.message)}}
 async function remove(id:any){
  const item=history.find(x=>String(x.id)===String(id)),label=item?`${String(item.routine_date).slice(0,10)} - ${historyLabel(item)}`:'this routine';
  const perform=async()=>{try{await api('/api/routines/manager/'+id,{method:'DELETE'});setHistory(x=>x.filter(y=>String(y.id)!==String(id)));setSaveFeedback({kind:'success',message:`Routine deleted successfully: ${label}.`});if(Platform.OS!=='web')Alert.alert('Deleted',`Routine deleted successfully: ${label}.`);await load()}catch(e:any){Alert.alert('Error',e.message)}};
  if(Platform.OS==='web'&&typeof window!=='undefined'){if(window.confirm(`Delete ${label}? This action cannot be undone.`))await perform();return;}
  Alert.alert('Confirm delete',`Delete ${label}? This action cannot be undone.`,[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>{void perform();}}]);
 }
 const displayedTeachers=useMemo(()=>{
  const list=report?.teachers||[];
  if(!reportFilter.trim())return list;
  const q=reportFilter.trim().toLowerCase();
  return list.filter((t:any)=>String(t.name||'').toLowerCase().includes(q)||String(t.subject||'').toLowerCase().includes(q));
 },[report,reportFilter]);
 function formatDateDDMM(dStr:string){if(!dStr)return'';const parts=String(dStr).split('-');return parts.length===3?`${parts[2]}-${parts[1]}-${parts[0]}`:dStr}
 const selectedTeacherClasses:any[]=useMemo(()=>{
  if(!teacherSheetModal?.teacher)return[];
  const t=teacherSheetModal.teacher,k=teacherSheetModal.kind;
  if(k==='xi_xii')return t.xi_xii_classes||[];
  if(k==='v_x')return t.v_x_classes||[];
  if(k==='all'){
   return [...(t.coaching_classes||[]),...(t.xi_xii_classes||[]),...(t.v_x_classes||[])].sort((a:any,b:any)=>String(a.date).localeCompare(String(b.date)));
  }
  return t.coaching_classes||[];
 },[teacherSheetModal]);

 const selectedTeacherTotalDuration=useMemo(()=>{
  let mins=0;
  for(const c of selectedTeacherClasses){mins+=c.duration_minutes||0}
  const h=Math.floor(mins/60),m=mins%60;
  if(h>0&&m>0)return `${h} Hours ${m} Mins`;
  if(h>0)return `${h} Hours`;
  if(m>0)return `${m} Mins`;
  return '-';
 },[selectedTeacherClasses]);

 const filledTeacherRows=useMemo(()=>{
  const count=Math.max(selectedTeacherClasses.length,18);
  return Array.from({length:count},(_,i)=>selectedTeacherClasses[i]||null);
 },[selectedTeacherClasses]);

 const modalSheetTitle=useMemo(()=>{
  const k=teacherSheetModal?.kind||'coaching';
  const sess=report?.sessionName||'2026-27';
  if(k==='xi_xii')return `Record Sheet for Teachers Class XI-XII Classes for the Session-${sess}`;
  if(k==='v_x')return `Record Sheet for Teachers Class V-X Classes for the Session-${sess}`;
  if(k==='all')return `Record Sheet for Teachers All Classes for the Session-${sess}`;
  return `Record Sheet for Teachers Coaching Classes for the Session-${sess}`;
 },[teacherSheetModal,report]);

 async function downloadTeacherRecordExcel(){
  if(!teacherSheetModal||downloadingTeacherExcel)return;
  setDownloadingTeacherExcel(true);
  try{
   const token=await getToken();
   const {teacher,kind}=teacherSheetModal;
   const periodParam=report?.kind==='daily'?`date=${report?.date||date}`:`month=${month}`;
   const url=`${API_BASE}/api/routines/manager/report/teacher-excel?${periodParam}&teacher_id=${teacher.id}&kind=${kind}`;
   if(Platform.OS==='web'&&typeof window!=='undefined'){
    const resp=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    if(!resp.ok){
     const err=await resp.json().catch(()=>({}));
     throw new Error(err.message||'Failed to download Excel');
    }
    const blob=await resp.blob();
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    const safeName=(teacher.name||'Teacher').replace(/[^a-zA-Z0-9_-]/g,'_');
    a.download=`${safeName}_${kind.toUpperCase()}_Record_${month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
   }else{
    Alert.alert('Notice','Excel download is supported on web browser.');
   }
  }catch(e:any){Alert.alert('Download Error',e.message)}
  finally{setDownloadingTeacherExcel(false)}
 }

 function printTeacherRecordSheet(){
  if(Platform.OS==='web'&&typeof window!=='undefined'){
   window.print();
  }else{
   Alert.alert('Print','Printing is supported on web browser.');
  }
 }
 async function loadReport(){try{const d=await api(`/api/routines/manager/report?month=${month}`);setReport({...d,kind:'monthly'});setReportOpen(true)}catch(e:any){Alert.alert('Monthly Report Error',e.message)}}
 async function loadDailyReport(targetDate?:string){try{const target=targetDate||dailyReportDate||date;const d=await api(`/api/routines/manager/daily-report?date=${target}`);setReport({...d,kind:'daily',date:target});setDailyReportDate(target);setReportOpen(true)}catch(e:any){Alert.alert('Daily Report Error',e.message)}}
 async function downloadReportExcel(){
  if(downloadingReport)return;
  setDownloadingReport(true);
  try{
   const token=await getToken();
   const isDaily=report?.kind==='daily';
   const reportDate=report?.date||dailyReportDate||date;
   const endpoint=isDaily
     ? `/api/routines/manager/daily-report/excel?date=${reportDate}`
     : `/api/routines/manager/report/excel?month=${month}`;
   const fileName=isDaily
     ? `Daily-Report-${reportDate}.xlsx`
     : `Monthly-Report-${month}.xlsx`;
   const res=await fetch(`${API_BASE}${endpoint}`,{headers:{Authorization:`Bearer ${token}`}});
   if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.message||'Excel download failed');}
   const blob=await res.blob();
   if(Platform.OS==='web'&&typeof window!=='undefined'){
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=fileName;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
   }else{
    const reader=new FileReader();
    reader.onload=async()=>{
     const base64=(reader.result as string).split(',')[1];
     const fileUri=`${(FileSystem as any).documentDirectory||(FileSystem as any).cacheDirectory||''}${fileName}`;
     await FileSystem.writeAsStringAsync(fileUri,base64,{encoding:(FileSystem as any).EncodingType?.Base64||'base64'});
     if(await Sharing.isAvailableAsync()){await Sharing.shareAsync(fileUri,{mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',dialogTitle:'Download Routine Report Excel'});}
     else{Alert.alert('Excel Downloaded',`File saved to ${fileUri}`);}
    };
    reader.readAsDataURL(blob);
   }
  }catch(e:any){Alert.alert('Download Error',e.message||'Report download failed');}
  finally{setDownloadingReport(false);}
 }
 const downloadMonthlyRecord = downloadReportExcel;
 async function printMonthlyReport(){
  if(!report)return;
  const isDaily=report?.kind==='daily';
  const reportTitle=isDaily ? `Daily Class Report — ${report.dateLabel||report.date||dailyReportDate||date}` : (report.monthLabel||month);
  const teachers=report.teachers||[];
  const totals=report.totals||{xi_xii:0,ix_x:0,coaching:0,grand_total:0};
  const xmlHelper=(v:any)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const rowsHtml=teachers.map((t:any,i:number)=>`<tr class="${i%2===1?'alt':''}"><td>${t.sl}</td><td class="subj">${xmlHelper(t.subject)}</td><td class="name">${xmlHelper(t.name)}</td><td>${t.xi_xii||''}</td><td>${t.ix_x||''}</td><td>${t.coaching||''}</td><td class="bold">${t.total||''}</td></tr>`).join('');
  const html=`<style>@page{size:A4 portrait;margin:10mm}body{font-family:Calibri,Arial,sans-serif;text-align:center;color:#1e293b}h1{color:#1f4e78;font-size:20px;margin:0 0 4px;font-weight:800}h2{color:#1f4e78;font-size:16px;margin:0 0 14px;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}th,td{border:1px solid #000;padding:6px 8px;text-align:center}th{color:#cc0000;font-weight:bold;text-decoration:underline;background:#fff;font-size:13px}.name{text-align:left;font-weight:600}.subj{text-align:left}.bold{font-weight:bold}.alt td{background:#eaf2fa}.tot-row{background:#d9e1f2!important;font-weight:bold;color:#1f4e78}.tot-row td{border-top:2px solid #000;border-bottom:3px double #000}</style><h1>Al - Ameen Mission Academy Memari</h1><h2>${reportTitle}</h2><table><thead><tr><th style="width:7%">SL</th><th style="width:20%">Subject</th><th style="width:33%">Teacher's Name</th><th style="width:10%">XI-XII</th><th style="width:10%">IX-X</th><th style="width:10%">Coaching</th><th style="width:10%">Total</th></tr></thead><tbody>${rowsHtml}<tr class="tot-row"><td colspan="3" style="text-align:right;font-weight:bold;">Total Classes</td><td>${totals.xi_xii}</td><td>${totals.ix_x}</td><td>${totals.coaching}</td><td style="font-weight:900;">${totals.grand_total}</td></tr></tbody></table>`;
  await Print.printAsync({html});
 }
 async function downloadBackup(){if(Platform.OS!=='web')return Alert.alert('Web only','Routine backup download is available in the web version.');try{const data=await api(`/api/routines/manager/backup?group=${group}`),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`routine-backup-${group}-${today}.json`;a.click();URL.revokeObjectURL(url)}catch(e:any){Alert.alert('Routine Backup',e.message)}}
 async function uploadBackup(){try{const picked=await DocumentPicker.getDocumentAsync({type:['application/json','.json'],copyToCacheDirectory:true});if(picked.canceled||!picked.assets?.[0])return;const asset=picked.assets[0];const text=Platform.OS==='web'&&asset.file?await asset.file.text():await FileSystem.readAsStringAsync(asset.uri);let payload:any;try{payload=JSON.parse(text)}catch{throw new Error('Selected file is not valid JSON.')}if(!Array.isArray(payload?.routines)||!payload.routines.length)throw new Error('This file is not a routine backup.');const result=await api('/api/routines/manager/backup/restore',{method:'POST',body:JSON.stringify(payload)});Alert.alert('Backup uploaded',result.message||'Routine backup uploaded successfully.');await load();if(admin)await openHistory()}catch(e:any){Alert.alert('Upload Backup',e.message||'Routine backup upload failed.')}}
 async function print(){let rows='';if(academic&&section)rows='<tr><th>Class</th>'+section.periods.map(p=>'<th>'+p[0]+'<br>'+p[1]+'</th>').join('')+'</tr>'+section.rows.map((r,ri)=>'<tr class="'+(ri%2?'alt':'')+'"><th>'+r+'</th>'+section.periods.map((p,i)=>{const x=cells[r+'|'+i]||{};return isTiffin(p)?'<td class="tiffin">TIFFIN</td>':'<td><b>'+(x.subject||'-')+'</b><br>'+(x.teacher_name||'-')+'</td>'}).join('')+'</tr>').join('');else rows='<tr><th>Time / Room</th>'+rooms.map(r=>'<th>'+r+'</th>').join('')+'</tr>'+coachTimes.map((t,i)=>'<tr class="'+(i%2?'alt':'')+'"><th>'+t+'</th>'+rooms.map(r=>'<td><b>'+(cells[t+'|'+r]?.teacher_name||'-')+'</b></td>').join('')+'</tr>').join('');await Print.printAsync({html:`<style>@page{size:A4 landscape;margin:9mm}body{font-family:Arial}h1,p{text-align:center;margin:4px}.head{display:flex;align-items:center;justify-content:center;position:relative}.head img{position:absolute;left:10mm;width:22mm;height:22mm;object-fit:contain}.logo{font-size:25px;color:#1764ad}.by{font-family:"Palace Script MT",cursive;font-size:18px;text-align:right;margin-top:10px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #789;padding:7px;text-align:center}th{background:#cfe1f4}.alt td{background:#f1f7fd}.tiffin{background:#fff0be!important}b{font-size:12px}</style><div class="head"><img src="/al-ameen-logo.jpg"/><div><h1 class="logo">Al-Ameen Mission Academy Memari</h1><h2 class="logo">Khadija Campus</h2><p>Class Routine for ${GROUPS.find(x=>x[0]===group)?.[1]}</p><p>Date- ${dateLabel(date)}, ${dayName(date)}</p></div></div>${noClass?'<h2 style="text-align:center">No class / coaching</h2>':'<table>'+rows+'</table>'}<div class="by">By N. Khatun</div>`})}

 async function shareRoutine(){
  const text=String(GROUPS.find(x=>x[0]===group)?.[1]||'Academy')+' Routine - '+dateLabel(date)+', '+dayName(date),imageUrl=`${API_BASE}/uploads/routines/routine-${group}-${date}.jpg`;
  if(Platform.OS==='web'){
   const nav:any=typeof navigator!=='undefined'?navigator:null;
   if(nav?.share){
    try{
     const response=await fetch(imageUrl,{cache:'no-store'});
     if(response.ok&&typeof File!=='undefined'){
      const blob=await response.blob(),file=new File([blob],`routine-${group}-${date}.jpg`,{type:blob.type||'image/jpeg'});
      if(!nav.canShare||nav.canShare({files:[file]})){await nav.share({title:'Routine',text,files:[file]});return;}
     }
    }catch(error:any){if(error?.name==='AbortError')return;}
    try{await nav.share({title:'Routine',text});return}catch(error:any){if(error?.name==='AbortError')return;}
   }
   window.open('https://wa.me/?text='+encodeURIComponent(text+'\n'+imageUrl),'_blank');return;
  }
  Alert.alert('Share',text);
 }

 function field(key:string,subject:boolean){
  const x=cells[key]||{};
  const selected=teachers.find(t=>String(t.id)===String(x.teacher_id));
  const pool=teachers.filter(isTeachingTeacher);
  const baseSubjects=section?.subjects||ALL_SUBJECTS;
  const teacherSubjects=selected&&isTeachingTeacher(selected)?baseSubjects.filter(s=>mapped(selected).some((v:string)=>subjectMatches(v,s))):baseSubjects;
  const subjectOptions=[{value:'',label:'Subject'},...teacherSubjects.map(v=>({value:v,label:v}))];
  if(!selected&&x.subject&&!subjectOptions.some(o=>o.value===x.subject))subjectOptions.push({value:x.subject,label:x.subject});
  const matching=x.subject?pool.filter(t=>mapped(t).some((v:string)=>subjectMatches(v,x.subject))):pool;
  const teacherList=(subject&&matching.length>0)?matching:pool;
  const teacherOptions=[{value:'',label:'Teacher',shortLabel:'Teacher'},...teacherList.map(t=>{
    const isOut=availability[String(t.id)]==='Absent';
    const prefix=isOut?'OUT - ':'';
    return {value:String(t.id),label:prefix+t.name,shortLabel:prefix+getShortTeacherName(t.name, t)};
  })];
  if(selected&&isTeachingTeacher(selected)&&!teacherOptions.some(o=>o.value===String(selected.id))){
    const isOut=availability[String(selected.id)]==='Absent';
    const prefix=isOut?'OUT - ':'';
    teacherOptions.push({value:String(selected.id),label:prefix+selected.name,shortLabel:prefix+getShortTeacherName(selected.name, selected)});
  }
  const hasTeacher=Boolean(x.teacher_id&&x.teacher_id!=='0'&&selected&&isTeachingTeacher(selected));
  const hasAssignedSubject=Boolean(String(x.subject||'').trim());
  const hasSubject=!academic||hasAssignedSubject;
  const isConflict=!combinedClassCounting&&conflicts.has(key)&&hasTeacher&&hasSubject;
  const isCombined=combinedClassCounting&&showCombinedHighlight&&combinedKeys.has(key)&&hasTeacher&&hasSubject;
  const isAbsent=Boolean(selected&&availability[String(selected.id)]==='Absent');
  return <View key={key} style={[subject?s.cell:s.coach,isConflict&&s.conflict,isCombined&&s.combinedCell,isAbsent&&!isConflict&&s.outTeacher]}>{admin?(subject?<><Select searchable panelWidth={500} panelMaxHeight={560} label="Subject" value={hasAssignedSubject?(x.subject||''):''} options={subjectOptions} onChange={v=>chooseSubject(key,v)} style={s.cellSubjectSelect} textStyle={[s.cellSubjectSelectText,!hasAssignedSubject&&s.watermarkText,isCombined&&s.combinedSubjectText]} placeholderTextStyle={s.watermarkText} chevron="⌵"/><Select searchable panelWidth={500} panelMaxHeight={560} style={s.cellTeacherSelect} textStyle={[s.cellTeacherSelectText,!hasTeacher&&s.watermarkText,isConflict&&s.conflictSelectText,isCombined&&s.combinedTeacherText]} placeholderTextStyle={s.watermarkText} label="Teacher" value={hasTeacher?String(x.teacher_id):''} options={teacherOptions} onChange={v=>chooseTeacher(key,v)} chevron="⌵"/></>:<Select searchable panelWidth={500} panelMaxHeight={560} style={s.coachSelect} textStyle={[s.coachSelectText,!hasTeacher&&s.watermarkText,isConflict&&s.conflictSelectText,isCombined&&s.combinedTeacherText]} placeholderTextStyle={s.watermarkText} label="Teacher" value={hasTeacher?String(x.teacher_id):''} options={teacherOptions} onChange={v=>chooseTeacher(key,v)} chevron="⌵"/>):(subject?<View style={{flex:1,justifyContent:'space-evenly',alignItems:'center',width:'100%',height:'100%'}}><Text style={[s.subject,{fontSize:13,fontWeight:'600',color:'#17365d'},!hasAssignedSubject&&s.watermarkText]}>{x.subject||'-'}</Text><View style={{height:1,backgroundColor:'#d4e2f0',width:'100%'}}/><Text style={[s.center,isConflict&&s.conflictText,isCombined&&s.combinedTeacherText,{fontSize:13,fontWeight:'800',color:isCombined?'#581c87':'#091e36'},!hasTeacher&&s.watermarkText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{getShortTeacherName(teacherNameForCell(x), selected)||'-'}</Text></View>:<Text style={[s.coachText,isConflict&&s.conflictText,isCombined&&s.combinedTeacherText,!hasTeacher&&s.watermarkText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{getShortTeacherName(teacherNameForCell(x), selected)||'-'}</Text>)}</View>;
 }

 const routineHeader=academic&&section?<View style={[s.row,s.tableHeaderRow]}><View style={[s.head,s.stickyTop,s.stickyLeft,{width:100,minHeight:44,backgroundColor:'#dce9f6'}]}><Text style={[s.bold,{fontSize:13,color:'#102a45'}]}>Class / Period</Text></View>{section.periods.map((p,i)=><View key={i} style={[s.head,s.stickyTop,{width:isTiffin(p)?82:138,minHeight:44,backgroundColor:isTiffin(p)?'#fff0be':'#d6e6f5'},isTiffin(p)&&s.tiffin]}><Text style={[s.bold,{fontSize:13,color:'#102a45'}]}>{p[0]}</Text><Text style={{fontSize:11,color:'#475569',marginTop:1}}>{p[1]}</Text></View>)}</View>:<View style={[s.row,s.tableHeaderRow]}><View style={[s.rowHead,s.stickyTop,s.stickyLeft,s.coachRowHead]}><Text style={[s.bold,s.headerText]}>Time / Room</Text></View>{rooms.map(r=><View key={r} style={[s.head,s.stickyTop,s.coachHead]}><Text style={[s.bold,s.headerText]}>{r}</Text></View>)}</View>;
 const routineBody=academic&&section?<>{section.rows.map((r,ri)=>{const rowOff=offClasses.includes(r);const isEven=ri%2===0;return <View key={r} style={[s.row,isEven?s.classRowEven:s.classRowOdd]}><View style={[s.rowHead,s.stickyLeft,isEven?s.classHeadEven:s.classHeadOdd,{width:100}]}><Text style={[s.bold,{fontSize:13,color:'#102a45'}]}>{r}</Text></View>{section.periods.map((p,i)=>rowOff?<View key={i} style={[s.cell,{width:isTiffin(p)?82:138},s.offCell]}><Text style={s.offText}>{i===0?'NO CLASS':''}</Text></View>:isTiffin(p)?<View key={i} style={[s.cell,s.tiffin,{width:82}]}><Text style={s.bold}>TIFFIN</Text></View>:field(r+'|'+i,true))}</View>})}</>:<>{coachTimes.map((t,i)=>{const rowOff=offTimes.includes(t);return <View key={t} style={[s.row,i%2===0?s.rowEven:s.rowOdd]}><View style={[s.rowHead,s.stickyLeft,s.coachRowHead]}><Text style={[s.bold,s.timeText]}>{t}</Text></View>{rooms.map(r=>rowOff?<View key={r} style={[s.coach,s.offCell]}><Text style={s.offText}>{r===rooms[0]?'NO COACHING':''}</Text></View>:field(t+'|'+r,false))}</View>})}</>;
 const offOptions=academic?rows:coachTimes,selectedOff=academic?offClasses:offTimes;
 if(admin===false)return <TeacherRoutineHistory/>;
 if(admin!==true)return <SafeAreaView style={s.page}><ActivityIndicator size="large" style={{margin:40}}/></SafeAreaView>;
 return <SafeAreaView style={s.page}><ScrollView ref={pageScrollRef} onScroll={event=>{pageScrollYRef.current=event.nativeEvent.contentOffset.y}} scrollEventThrottle={16} contentContainerStyle={s.content} stickyHeaderIndices={[2]}><AcademyHeader compact/>
  <View style={s.nav}><TouchableOpacity onPress={()=>router.canGoBack()?router.back():router.replace(admin?'/superadmin':'/teacher')} style={s.navButton}><Text>Back</Text></TouchableOpacity><TouchableOpacity onPress={()=>router.push(admin?'/superadmin':'/teacher')} style={s.navButton}><Text>Home</Text></TouchableOpacity></View>
  <View style={s.sticky}><View style={s.banner}><Text style={s.title}>School Routine Manager</Text>{false&&<TouchableOpacity disabled={saving} onPress={()=>save('final')} style={s.save}><Text style={s.white}>{saving?'Publishing...':'Publish Routine (JPG)'}</Text></TouchableOpacity>}</View>
   <View style={s.controls}><View style={[s.tabs,{marginVertical:0,flexWrap:'nowrap',flexShrink:0}]}>{GROUPS.map(x=><TouchableOpacity key={x[0]} onPress={()=>switchGroup(x[0])} style={[s.tab,group===x[0]&&s.active]}><Text style={[s.bold,group===x[0]&&s.white]}>{x[1]}</Text></TouchableOpacity>)}</View><DatePickerField label="" value={date} onChange={value=>{setSaveFeedback(null);setDate(value);setOffTarget('')}} style={s.date}/><View style={s.dayBadge}><Text style={s.dayBadgeText}>{dayName(date)}</Text></View><Text style={[s.source,source==='master'&&s.master,{display:'none'}]}>{source==='master'?'Weekday Master loaded':source==='draft'?'Draft loaded':source==='final'?'Published final routine':'No Master saved for this weekday'}</Text>{admin&&<><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:combinedClassCounting}} onPress={()=>{const next=!combinedClassCounting;setCombinedClassCounting(next);setClearedDuplicates(next?duplicateGroups.map(entry=>entry.signature):[]);if(next)setShowCombinedHighlight(true);}} style={[s.check,s.compactControlButton,combinedClassCounting&&s.combinedChecked]}><Text style={[s.bold,combinedClassCounting&&{color:'#581c87'}]}>{combinedClassCounting?'🔗 [x] Combined':'[ ] Combined'}{duplicateGroups.length>0?` (${duplicateGroups.length})`:''}</Text></TouchableOpacity><TouchableOpacity onPress={()=>setOffMenuOpen(x=>!x)} style={[s.check,s.compactControlButton,(noClass||selectedOff.length>0)&&s.checked]}><Text style={s.bold}>{noClass?'[x] ':''}Off{selectedOff.length?` (${selectedOff.length} off)`:''}</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={()=>save('draft')} style={[s.button,s.compactControlButton,saving&&{opacity:.6}]}><Text style={s.bold}>Save Draft</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={()=>save('master')} style={[s.masterButton,s.compactControlButton,saving&&{opacity:.6}]}><Text style={s.white}>Save {dayName(date)} Master</Text></TouchableOpacity></>}<TouchableOpacity onPress={shareRoutine} style={[s.button,s.compactControlButton]}><Text style={s.bold}>Share</Text></TouchableOpacity><TouchableOpacity disabled={saving} onPress={()=>save('final')} style={[s.save,s.compactControlButton,{marginLeft:'auto'},saving&&{opacity:.6}]}><Text style={s.white}>{saving?'Saving...':'Publish Routine'}</Text></TouchableOpacity></View>
  {offMenuOpen&&<View style={s.offPanel}><Text style={s.offTitle}>{academic?'Select class with no class today':'Select coaching time with no coaching today'}</Text><View style={s.offRow}><View style={s.offSelect}><Select searchable panelWidth={430} panelMaxHeight={420} label={academic?'Class':'Coaching time'} value={offTarget} onChange={setOffTarget} options={[{value:'',label:academic?'Select class':'Select time'},...offOptions.map(value=>({value,label:value}))]}/></View><TouchableOpacity disabled={!offTarget} onPress={toggleOffTarget} style={[s.offButton,!offTarget&&{opacity:.5}]}><Text style={s.white}>{selectedOff.includes(offTarget)?'Remove Off':'Mark Off'}</Text></TouchableOpacity></View>{selectedOff.length>0&&<Text style={s.offSummary}>{academic?'No class: ':'No coaching: '}{selectedOff.join(', ')}</Text>}<TouchableOpacity onPress={()=>setNoClass(value=>!value)} style={[s.offFullButton,noClass&&s.checked]}><Text style={s.bold}>{noClass?'[x] ':'[ ] '}Entire day {academic?'no class':'no coaching'}</Text></TouchableOpacity></View>}
  {saveFeedback&&<View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:8,paddingHorizontal:12,marginTop:6,borderRadius:6,backgroundColor:saveFeedback.kind==='error'?'#fee2e2':saveFeedback.kind==='success'?'#dcfce7':'#dbeafe'}}><Text style={{flex:1,fontWeight:'800',fontSize:13,color:saveFeedback.kind==='error'?'#991b1b':saveFeedback.kind==='success'?'#166534':'#1e40af'}}>{saveFeedback.message}</Text><TouchableOpacity onPress={()=>setSaveFeedback(null)} style={{paddingLeft:10,paddingVertical:2}}><Text style={{fontWeight:'900',fontSize:15,color:saveFeedback.kind==='error'?'#991b1b':saveFeedback.kind==='success'?'#166534':'#1e40af'}}>✕</Text></TouchableOpacity></View>}
  </View>
  {false&&<View style={s.masterPanel}><View style={s.masterSelect}><Select label="Master day" value={masterDay} onChange={chooseMasterDay} options={[{value:'0',label:'Sunday Master'},{value:'1',label:'Monday Master'},{value:'2',label:'Tuesday Master'},{value:'3',label:'Wednesday Master'},{value:'4',label:'Thursday Master'},{value:'5',label:'Friday Master'},{value:'6',label:'Saturday Master'}]}/></View><Text style={s.masterDayText}>{dayName(date)} - {dateLabel(date)}</Text><TouchableOpacity onPress={()=>save('master')} style={s.masterAction}><Text style={s.white}>This Routine - Master</Text></TouchableOpacity><TouchableOpacity onPress={loadSelectedMaster} style={s.button}><Text style={s.bold}>Load Selected Weekly Master</Text></TouchableOpacity><TouchableOpacity onPress={openHistory} style={s.button}><Text style={s.bold}>Master List / History</Text></TouchableOpacity></View>}
  {!combinedClassCounting&&conflicts.size>0&&<View style={s.note}><Text style={s.noteTitle}>⚠️ Duplicate Clash Warning: {conflicts.size} red cell(s) contain a teacher clash at the same time:</Text><Text style={s.noteList}>{conflictDetails.join('  •  ')}</Text></View>}
   {combinedClassCounting&&duplicateGroups.length>0&&<View style={s.combinedNote}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:6}}><Text style={s.combinedNoteTitle}>🔗 Combined Classes ({duplicateGroups.length} combined slot{duplicateGroups.length>1?'s':''} active):</Text><TouchableOpacity onPress={()=>setShowCombinedHighlight(x=>!x)} style={s.combinedHighlightToggle}><Text style={s.combinedHighlightToggleText}>{showCombinedHighlight?'Hide Highlights':'Show Highlights'}</Text></TouchableOpacity></View><Text style={s.combinedNoteList}>{allCombinedDetails.join('  •  ')}</Text></View>}
  {noClass?<View style={s.noClass}><Text style={s.noClassText}>No class / coaching on this date</Text></View>:group==='coaching'?(
   <View style={[s.workspace,s.workspaceCoaching]}>
    <ScrollView nestedScrollEnabled stickyHeaderIndices={Platform.OS==='web'?[0]:undefined} style={[s.workspaceVertical,s.workspaceVerticalCoaching]}>
     <View style={s.table}>{routineHeader}</View>
     <View style={[s.table,s.bodyTable]}>{routineBody}</View>
    </ScrollView>
    <View style={s.bottomCountPanel}>
     <View style={s.bottomCountHeader}>
      <Text style={s.bottomCountTitle}>Teacher Counting ({counts.length} teachers)</Text>
      <View style={s.bottomTotalBadge}><Text style={s.bottomTotalText}>Total Class: {totalClasses}</Text></View>
     </View>
     <View style={s.bottomCountGrid}>
      {counts.map((x,i)=><View key={`${x.name}-${i}`} style={s.bottomCountChip}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={s.bottomCountName}>{x.name}</Text><View style={s.bottomCountNum}><Text style={s.bottomCountNumText}>{x.count}</Text></View></View>)}
      {!counts.length&&<Text style={s.bottomCountEmpty}>No classes assigned yet.</Text>}
     </View>
    </View>
   </View>
  ):(
   <View style={[s.workspace,Platform.OS==='web'&&{height:'auto' as any,minHeight:0 as any,maxHeight:'82vh' as any}]}>
    <ScrollView nestedScrollEnabled stickyHeaderIndices={Platform.OS==='web'?[0]:undefined} style={s.workspaceVertical}>
     <View style={s.table}>{routineHeader}</View>
     <View style={[s.table,s.bodyTable]}>{routineBody}</View>
    </ScrollView>
    <View {...countResizeResponder.panHandlers} style={s.countResizeHandle}><Text style={s.resizeMark}>⋮</Text></View>
    <View style={[s.count,{width:countWidth}]}>
     <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={s.countTitle}>Teacher Counting</Text>
     {counts.map((x,i)=><View key={`${x.name}-${i}`} style={s.countRow}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45} style={{flex:1,marginRight:4}}>{x.name}</Text><Text style={s.bold}>{x.count}</Text></View>)}
     <View style={s.total}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[s.bold,{flex:1}]}>Total Class</Text><Text style={s.bold}>{totalClasses}</Text></View>
    </View>
   </View>
  )}
  {exams.length>0&&<><TouchableOpacity onPress={()=>setExamOpen(x=>!x)} style={s.button}><Text style={s.bold}>{examOpen?'Hide Exam Routine':'Show Exam Routine'}</Text></TouchableOpacity>{examOpen&&<View style={s.examPublic}><Text style={s.panelTitle}>Exam Routine - {dateLabel(date)}</Text>{exams.map((x:any,i:number)=><View key={x.id||i} style={s.examRow}><Text style={{flex:1}}><Text style={s.bold}>{x.class_name} - {x.subject}</Text>{'\n'}{x.time} - {x.room||'Room not set'} - Duty: {x.teacher_name}</Text></View>)}</View>}</>}{admin&&examOpen&&<ExamRoutinePanel teachers={teachers} initialDate={date}/>}{admin&&<View style={s.tools}>
   <View style={s.toolTabs}><TouchableOpacity style={s.toolButton} onPress={()=>setConfigOpen(x=>!x)}><Text style={s.bold}>Class / Time / Tiffin</Text></TouchableOpacity><TouchableOpacity style={s.toolButton} onPress={()=>setAssignOpen(x=>!x)}><Text style={s.bold}>Teacher Subjects</Text></TouchableOpacity></View>
   {configOpen&&<View style={s.panel}><Text style={s.panelTitle}>Class, Room & Time Setup</Text>{academic?<><Text style={s.label}>Classes (comma separated)</Text><TextInput value={rowDraft} onChangeText={setRowDraft} style={s.configInput}/><Text style={s.label}>One per line: Period|Time. Add Tiffin|12:40-1:40 where needed.</Text><TextInput value={periodDraft} onChangeText={setPeriodDraft} multiline style={[s.configInput,s.multiline]}/><TouchableOpacity disabled={saving} onPress={applyAcademicPeriodsToAllMasters} style={[s.masterButton,s.compactControlButton,saving&&{opacity:.6}]}><Text style={s.white}>Apply periods to all 7 masters</Text></TouchableOpacity></>:<><Text style={s.label}>Rooms (comma separated)</Text><TextInput value={roomDraft} onChangeText={setRoomDraft} style={s.configInput}/><TouchableOpacity disabled={saving} onPress={applyCoachingRoomsToAllMasters} style={[s.masterButton,s.compactControlButton,saving&&{opacity:.6}]}><Text style={s.white}>Apply rooms to all 7 masters</Text></TouchableOpacity><Text style={s.label}>Coaching times (one per line)</Text><TextInput value={timeDraft} onChangeText={setTimeDraft} multiline style={[s.configInput,s.multiline]}/><TouchableOpacity disabled={saving} onPress={applyCoachingTimesToAllMasters} style={[s.masterButton,s.compactControlButton,saving&&{opacity:.6}]}><Text style={s.white}>Apply times to all 7 masters</Text></TouchableOpacity></>}<TouchableOpacity onPress={applyConfig} style={s.save}><Text style={s.white}>Apply Changes</Text></TouchableOpacity></View>}
   {assignOpen&&<View style={s.panel}><View style={s.assignHeader}><View style={s.formField}><Select searchable panelWidth={500} panelMaxHeight={560} label="Teacher filter" value={assignTeacher} onChange={setAssignTeacher} options={[{value:'',label:'All teaching teachers'},...teachers.filter(isTeachingTeacher).map(t=>({value:String(t.id),label:t.name}))]}/></View><TouchableOpacity onPress={()=>router.push('/teachers')} style={s.save}><Text style={s.white}>+ Manage Teachers</Text></TouchableOpacity></View><Text style={s.assignHelp}>Tick a subject beside a teacher. Every change saves immediately.</Text><ScrollView style={s.assignList} nestedScrollEnabled>{teachers.filter(isTeachingTeacher).filter(t=>!assignTeacher||String(t.id)===assignTeacher).map(t=><View key={t.id} style={s.teacherSubjectRow}><Text style={s.teacherSubjectName}>{t.name}</Text><View style={s.subjectChecks}>{ALL_SUBJECTS.map(v=>{const on=mapped(t).some((x:string)=>canon(x)===canon(v)),busy=subjectBusy===String(t.id)+'|'+v;return <TouchableOpacity disabled={!!subjectBusy} key={v} onPress={()=>toggleTeacherSubject(t,v)} style={[s.subjectCheck,on&&s.subjectChecked,busy&&s.subjectSaving]}><Text style={[s.subjectCheckText,on&&s.subjectCheckedText]}>{on?'[x] ':''}{v}</Text></TouchableOpacity>})}</View></View>)}</ScrollView></View>}
  </View>}{admin&&<View style={s.bottom}><View style={s.bottomButtons}><TouchableOpacity style={s.button} onPress={openHistory}><Text style={s.bold}>{historyOpen?'Refresh':'Draft & Final History'}</Text></TouchableOpacity><DatePickerField label="Report Month" kind="month" value={month} onChange={setMonth} style={s.month}/><TouchableOpacity style={s.button} onPress={loadReport}><Text style={s.bold}>Monthly Report</Text></TouchableOpacity><DatePickerField label="Report Date" kind="date" value={dailyReportDate} onChange={(v:string)=>{setDailyReportDate(v);if(reportOpen&&report?.kind==='daily')void loadDailyReport(v);}} style={s.month}/><TouchableOpacity style={[s.button,{backgroundColor:'#e0f2fe',borderColor:'#38bdf8',borderWidth:1}]} onPress={()=>loadDailyReport(dailyReportDate)}><Text style={[s.bold,{color:'#0369a1'}]}>Day Report</Text></TouchableOpacity><TouchableOpacity style={s.button} onPress={downloadBackup}><Text style={s.bold}>Download Routine Backup</Text></TouchableOpacity><TouchableOpacity style={s.button} onPress={uploadBackup}><Text style={s.bold}>Upload Routine Backup</Text></TouchableOpacity></View>
   {historyOpen&&history.filter(x=>!x.is_master&&x.routine_kind!=='master').map(x=><View key={x.id} style={s.historyRow}><TouchableOpacity style={{flex:1}} onPress={()=>setDate(String(x.routine_date).slice(0,10))}><Text style={s.bold}>{String(x.routine_date).slice(0,10)} - {historyLabel(x)}</Text><Text>{x.updated_by_name||''}</Text></TouchableOpacity><TouchableOpacity onPress={()=>remove(x.id)} style={s.delete}><Text style={s.white}>Delete</Text></TouchableOpacity></View>)}
   {reportOpen&&report&&(
    <View style={s.reportContainer}>
     <View style={s.reportHeaderBar}>
      <View style={{alignItems:'center',flex:1}}>
       <Text style={s.reportSchoolTitle}>Al - Ameen Mission Academy Memari</Text>
       {report.kind==='daily'?(
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:6,flexWrap:'wrap'}}>
         <TouchableOpacity
          style={{backgroundColor:'#f1f5f9',borderWidth:1,borderColor:'#cbd5e1',paddingVertical:6,paddingHorizontal:12,borderRadius:6}}
          onPress={()=>{
           const prev=shiftDate(report.date||dailyReportDate,-1);
           void loadDailyReport(prev);
          }}
         >
          <Text style={{fontSize:12,fontWeight:'700',color:'#1e293b'}}>◀ Prev Day</Text>
         </TouchableOpacity>
         <DatePickerField
          label=""
          kind="date"
          value={report.date||dailyReportDate}
          onChange={(v:string)=>{
           void loadDailyReport(v);
          }}
          style={{width:145,height:34,borderWidth:1,borderColor:'#cbd5e1',borderRadius:6,backgroundColor:'#ffffff',justifyContent:'center'}}
         />
         <TouchableOpacity
          style={{backgroundColor:'#f1f5f9',borderWidth:1,borderColor:'#cbd5e1',paddingVertical:6,paddingHorizontal:12,borderRadius:6}}
          onPress={()=>{
           const next=shiftDate(report.date||dailyReportDate,1);
           void loadDailyReport(next);
          }}
         >
          <Text style={{fontSize:12,fontWeight:'700',color:'#1e293b'}}>Next Day ▶</Text>
         </TouchableOpacity>
         <Text style={{fontSize:15,fontWeight:'800',color:'#1f4e78',marginLeft:6}}>
          Daily Class Report — {report.dateLabel||report.date||dailyReportDate}
         </Text>
        </View>
       ):(
        <Text style={s.reportMonthTitle}>{report.monthLabel||month}</Text>
       )}
      </View>
      <View style={s.reportActionButtons}>
       <TouchableOpacity disabled={downloadingReport} onPress={downloadMonthlyRecord} style={s.reportDownloadBtn}>
        <Text style={s.reportDownloadBtnText}>{downloadingReport?'Downloading...':'📥 Download Excel'}</Text>
       </TouchableOpacity>
       <TouchableOpacity onPress={printMonthlyReport} style={s.reportPrintBtn}>
        <Text style={s.reportPrintBtnText}>🖨️ Print / PDF</Text>
       </TouchableOpacity>
       <TouchableOpacity onPress={()=>setReportOpen(false)} style={s.reportCloseBtn}>
        <Text style={s.reportCloseBtnText}>✕ Close</Text>
       </TouchableOpacity>
      </View>
     </View>
     <View style={s.reportFilterRow}>
      <TextInput
       placeholder="🔍 Search teacher or subject..."
       value={reportFilter}
       onChangeText={setReportFilter}
       style={s.reportSearchInput}
      />
      <TouchableOpacity onPress={()=>setExpandReport(x=>!x)} style={s.reportExpandBtn}>
       <Text style={s.reportExpandBtnText}>{expandReport?'↕️ Compact Scroll Box':'↕️ Expand All (No Box)'}</Text>
      </TouchableOpacity>
      <Text style={s.reportCountBadge}>Showing {displayedTeachers.length} of {report.teachers?.length||0} teachers</Text>
     </View>
     <ScrollView
      nestedScrollEnabled
      style={[s.reportScrollBox,expandReport&&{maxHeight:'none' as any}]}
      contentContainerStyle={{minWidth:'100%',alignSelf:'flex-start'}}
     >
      <View style={s.reportTable}>
       <View style={[s.reportRow,s.reportHeaderRow,s.reportStickyHeader]}>
        <View style={[s.reportCell,{width:48}]}><Text style={s.reportHeaderText}>SL</Text></View>
        <View style={[s.reportCell,{width:130,alignItems:'flex-start'}]}><Text style={s.reportHeaderText}>Subject</Text></View>
        <View style={[s.reportCell,{width:220,alignItems:'flex-start'}]}><Text style={s.reportHeaderText}>Teacher's Name</Text></View>
        <View style={[s.reportCell,{width:90}]}><Text style={s.reportHeaderText}>XI-XII</Text></View>
        <View style={[s.reportCell,{width:90}]}><Text style={s.reportHeaderText}>IX-X</Text></View>
        <View style={[s.reportCell,{width:100}]}><Text style={s.reportHeaderText}>Coaching</Text></View>
        <View style={[s.reportCell,{width:90}]}><Text style={s.reportHeaderText}>Total</Text></View>
       </View>
       {displayedTeachers.map((t:any,idx:number)=>{
        const isEven=idx%2===1;
        return (
         <View key={t.id||idx} style={[s.reportRow,isEven?s.reportRowAlt:s.reportRowWhite]}>
          <View style={[s.reportCell,{width:48}]}><Text style={s.reportCellText}>{t.sl}</Text></View>
          <View style={[s.reportCell,{width:130,alignItems:'flex-start'}]}><Text style={s.reportCellText}>{t.subject}</Text></View>
          <TouchableOpacity onPress={()=>setTeacherSheetModal({teacher:t,kind:t.coaching>0?'coaching':'all'})} style={[s.reportCell,{width:220,alignItems:'flex-start'}]}>
           <Text style={[s.reportCellText,s.bold,{color:'#1e3a8a',textDecorationLine:'underline'}]}>{t.name}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>t.xi_xii>0&&setTeacherSheetModal({teacher:t,kind:'xi_xii'})} style={[s.reportCell,{width:90}]}>
           <View style={[t.xi_xii>0&&s.clickableBadge]}>
            <Text style={[s.reportCellText,t.xi_xii>0&&s.clickableBadgeText]}>{t.xi_xii||'-'}</Text>
           </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>t.ix_x>0&&setTeacherSheetModal({teacher:t,kind:'v_x'})} style={[s.reportCell,{width:90}]}>
           <View style={[t.ix_x>0&&s.clickableBadge]}>
            <Text style={[s.reportCellText,t.ix_x>0&&s.clickableBadgeText]}>{t.ix_x||'-'}</Text>
           </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>t.coaching>0&&setTeacherSheetModal({teacher:t,kind:'coaching'})} style={[s.reportCell,{width:100}]}>
           <View style={[t.coaching>0&&s.clickableBadgeCoaching]}>
            <Text style={[s.reportCellText,t.coaching>0&&s.clickableBadgeCoachingText]}>{t.coaching||'-'}</Text>
           </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={()=>t.total>0&&setTeacherSheetModal({teacher:t,kind:'all'})} style={[s.reportCell,{width:90}]}>
           <View style={[t.total>0&&s.clickableBadgeTotal]}>
            <Text style={[s.reportCellText,s.bold,t.total>0&&{color:'#1e40af'}]}>{t.total||'-'}</Text>
           </View>
          </TouchableOpacity>
         </View>
        );
       })}
       <View style={[s.reportRow,s.reportTotalRow]}>
        <View style={[s.reportCell,{width:398,alignItems:'flex-end',paddingRight:12}]}>
         <Text style={[s.bold,{color:'#1f4e78',fontSize:13}]}>Total Classes</Text>
        </View>
        <View style={[s.reportCell,{width:90}]}>
         <Text style={[s.bold,{color:'#1f4e78',fontSize:13}]}>{report.totals?.xi_xii||0}</Text>
        </View>
        <View style={[s.reportCell,{width:90}]}>
         <Text style={[s.bold,{color:'#1f4e78',fontSize:13}]}>{report.totals?.ix_x||0}</Text>
        </View>
        <View style={[s.reportCell,{width:100}]}>
         <Text style={[s.bold,{color:'#1f4e78',fontSize:13}]}>{report.totals?.coaching||0}</Text>
        </View>
        <View style={[s.reportCell,{width:90}]}>
         <Text style={[s.bold,{color:'#1f4e78',fontSize:14}]}>{report.totals?.grand_total||0}</Text>
        </View>
       </View>
      </View>
     </ScrollView>
    </View>
   )}
   {Platform.OS==='web'&&(
    <style>{`
     @media print {
      body * {
       visibility: hidden !important;
      }
      #printable-teacher-record-sheet, #printable-teacher-record-sheet * {
       visibility: visible !important;
      }
      #printable-teacher-record-sheet {
       position: absolute !important;
       left: 0 !important;
       top: 0 !important;
       width: 100% !important;
       max-width: 100% !important;
       margin: 0 !important;
       padding: 6mm 10mm !important;
       background: #ffffff !important;
       border: none !important;
       box-shadow: none !important;
      }
      @page {
       size: A4 portrait;
       margin: 8mm;
      }
     }
    `}</style>
   )}
   {teacherSheetModal&&(
    <Modal visible={true} transparent animationType="fade" onRequestClose={()=>setTeacherSheetModal(null)}>
     <View style={s.modalOverlay}>
      <View style={s.modalContainer}>
       <View style={s.modalHeaderBar}>
        <View style={s.modalTabGroup}>
         <TouchableOpacity onPress={()=>setTeacherSheetModal(prev=>prev?{...prev,kind:'coaching'}:null)} style={[s.modalTab,teacherSheetModal.kind==='coaching'&&s.modalTabActive]}>
          <Text style={[s.modalTabText,teacherSheetModal.kind==='coaching'&&s.modalTabTextActive]}>Coaching ({teacherSheetModal.teacher.coaching||0})</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={()=>setTeacherSheetModal(prev=>prev?{...prev,kind:'xi_xii'}:null)} style={[s.modalTab,teacherSheetModal.kind==='xi_xii'&&s.modalTabActive]}>
          <Text style={[s.modalTabText,teacherSheetModal.kind==='xi_xii'&&s.modalTabTextActive]}>XI-XII ({teacherSheetModal.teacher.xi_xii||0})</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={()=>setTeacherSheetModal(prev=>prev?{...prev,kind:'v_x'}:null)} style={[s.modalTab,teacherSheetModal.kind==='v_x'&&s.modalTabActive]}>
          <Text style={[s.modalTabText,teacherSheetModal.kind==='v_x'&&s.modalTabTextActive]}>Class V-X ({teacherSheetModal.teacher.ix_x||0})</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={()=>setTeacherSheetModal(prev=>prev?{...prev,kind:'all'}:null)} style={[s.modalTab,teacherSheetModal.kind==='all'&&s.modalTabActive]}>
          <Text style={[s.modalTabText,teacherSheetModal.kind==='all'&&s.modalTabTextActive]}>All ({teacherSheetModal.teacher.total||0})</Text>
         </TouchableOpacity>
        </View>
        <View style={s.modalActionsGroup}>
         <TouchableOpacity disabled={downloadingTeacherExcel} onPress={downloadTeacherRecordExcel} style={s.modalExcelBtn}>
          <Text style={s.modalBtnText}>{downloadingTeacherExcel?'Downloading...':'📥 Download Excel'}</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={printTeacherRecordSheet} style={s.modalPrintBtn}>
          <Text style={s.modalBtnText}>🖨️ Print / Save as PDF</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={()=>setTeacherSheetModal(null)} style={s.modalCloseBtn}>
          <Text style={s.modalBtnText}>✕ Close</Text>
         </TouchableOpacity>
        </View>
       </View>
       <ScrollView style={s.modalScrollBody} contentContainerStyle={s.modalScrollContent}>
        <View id="printable-teacher-record-sheet" style={s.paperSheet}>
         <Text style={s.paperSchoolTitle}>Al-Ameen Mission Academy, Memari</Text>
         <Text style={s.paperSchoolSub}>Memari :: Purba Bardhaman</Text>
         <Text style={s.paperUnitTitle}>Girls Unit</Text>
         <Text style={s.paperDocTitle}>{modalSheetTitle}</Text>
         <View style={s.paperTeacherInfoRow}>
          <Text style={s.paperTeacherInfoText}>
           <Text style={s.bold}>Name of the Teacher: </Text>
           <Text style={[s.bold,{textDecorationLine:'underline'}]}>{teacherSheetModal.teacher.name}</Text>
          </Text>
          <Text style={s.paperTeacherInfoText}>
           <Text style={s.bold}>Sub : </Text>
           <Text style={[s.bold,{textDecorationLine:'underline'}]}>{teacherSheetModal.teacher.subject||'General'}</Text>
           <Text style={{color:'#64748b'}}>  ({report?.monthLabel||month})</Text>
          </Text>
         </View>
         <View style={s.paperTable}>
          <View style={[s.paperTableRow,s.paperTableHeaderRow]}>
           <View style={[s.paperCell,{width:50}]}><Text style={s.paperHeaderCellText}>Sl. No.</Text></View>
           <View style={[s.paperCell,{width:105}]}><Text style={s.paperHeaderCellText}>Date</Text></View>
           <View style={[s.paperCell,{width:100}]}><Text style={s.paperHeaderCellText}>Day</Text></View>
           <View style={[s.paperCell,{width:115}]}><Text style={s.paperHeaderCellText}>Class</Text></View>
           <View style={[s.paperCell,{width:100}]}><Text style={s.paperHeaderCellText}>Class Start</Text></View>
           <View style={[s.paperCell,{width:100}]}><Text style={s.paperHeaderCellText}>Class End</Text></View>
           <View style={[s.paperCell,{width:130}]}><Text style={s.paperHeaderCellText}>Duration of Class</Text></View>
          </View>
          {filledTeacherRows.map((item:any,idx:number)=>(
           <View key={idx} style={s.paperTableRow}>
            <View style={[s.paperCell,{width:50}]}><Text style={s.paperCellText}>{idx+1}</Text></View>
            <View style={[s.paperCell,{width:105}]}><Text style={s.paperCellText}>{item?formatDateDDMM(item.date):''}</Text></View>
            <View style={[s.paperCell,{width:100}]}><Text style={s.paperCellText}>{item?item.day:''}</Text></View>
            <View style={[s.paperCell,{width:115}]}><Text style={[s.paperCellText,item&&s.bold]}>{item?item.class_name:''}</Text></View>
            <View style={[s.paperCell,{width:100}]}><Text style={s.paperCellText}>{item?item.start_time:''}</Text></View>
            <View style={[s.paperCell,{width:100}]}><Text style={s.paperCellText}>{item?item.end_time:''}</Text></View>
            <View style={[s.paperCell,{width:130}]}><Text style={s.paperCellText}>{item?item.duration:''}</Text></View>
           </View>
          ))}
          <View style={[s.paperTableRow,s.paperTableTotalRow]}>
           <View style={[s.paperCell,{width:370,alignItems:'flex-start',paddingLeft:12}]}>
            <Text style={[s.bold,{fontSize:12,color:'#1e293b'}]}>Total Classes: {selectedTeacherClasses.length}</Text>
           </View>
           <View style={[s.paperCell,{width:330,alignItems:'flex-end',paddingRight:12}]}>
            <Text style={[s.bold,{fontSize:12,color:'#1e293b'}]}>Total Duration: {selectedTeacherTotalDuration}</Text>
           </View>
          </View>
         </View>
         <View style={s.paperSignatureRow}>
          <View style={s.paperSignatureBox}>
           <View style={s.paperSignatureLine}/>
           <Text style={s.paperSignatureLabel}>Teacher's Signature</Text>
          </View>
          <View style={s.paperSignatureBox}>
           <View style={s.paperSignatureLine}/>
           <Text style={s.paperSignatureLabel}>In-Charge / Principal Signature</Text>
          </View>
         </View>
        </View>
       </ScrollView>
      </View>
     </View>
    </Modal>
   )}
  </View>}
 </ScrollView></SafeAreaView>
}

const s=StyleSheet.create({compactControlButton:{paddingVertical:6,paddingHorizontal:8,flexShrink:0},page:{flex:1,backgroundColor:'#eef4fb'},content:{padding:4,paddingBottom:20,width:'100%',maxWidth:2200,alignSelf:'center'},nav:{flexDirection:'row',gap:4,marginTop:2},navButton:{backgroundColor:'#e2ecf8',borderRadius:5,paddingVertical:6,paddingHorizontal:9},button:{backgroundColor:'#e2ecf8',borderRadius:6,padding:11},sticky:{backgroundColor:'#eef4fb',paddingBottom:2},banner:{backgroundColor:'#173f77',paddingVertical:2,paddingHorizontal:8,marginTop:1,marginBottom:2,borderRadius:4,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},title:{color:'#fff',fontSize:13,fontWeight:'800'},save:{backgroundColor:'#1473d4',padding:12,borderRadius:6},white:{color:'#fff',fontWeight:'800'},tabs:{flexDirection:'row',gap:4,marginVertical:2,flexWrap:'wrap'},tab:{backgroundColor:'#fff',borderWidth:1,borderColor:'#aac0da',borderRadius:5,paddingVertical:5,paddingHorizontal:8},active:{backgroundColor:'#1768c5'},bold:{fontWeight:'800'},controls:{backgroundColor:'#fff',padding:1,flexDirection:'row',alignItems:'center',gap:4,flexWrap:'wrap',width:'100%',alignSelf:'stretch'},date:{width:135,height:31,marginBottom:0,justifyContent:'center'},dayBadge:{backgroundColor:'#f1f5f9',borderWidth:1,borderColor:'#cbd5e1',borderRadius:5,height:31,paddingHorizontal:10,justifyContent:'center',alignItems:'center',flexShrink:0},dayBadgeText:{fontSize:13,fontWeight:'800',color:'#1e3a5f'},source:{backgroundColor:'#e5edf6',padding:10,borderRadius:6,fontWeight:'700'},master:{backgroundColor:'#ccebd8'},check:{backgroundColor:'#fff1c8',padding:10,borderRadius:6,borderWidth:1,borderColor:'#e5c979'},duplicateCheck:{backgroundColor:'#fff1c8',borderColor:'#e5c979'},checked:{backgroundColor:'#ffd1d1',borderColor:'#dc5961'},masterButton:{backgroundColor:'#8a5a11',padding:11,borderRadius:6},offPanel:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e5c979',borderRadius:8,padding:10,marginTop:4,gap:8},offTitle:{fontWeight:'900',color:'#7c5200'},offRow:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},offSelect:{minWidth:260,flexGrow:1},offButton:{backgroundColor:'#1768c5',padding:10,borderRadius:6},offFullButton:{backgroundColor:'#fff1c8',padding:9,borderRadius:6,borderWidth:1,borderColor:'#e5c979',alignSelf:'flex-start'},offSummary:{fontWeight:'800',color:'#7c5200'},offCell:{backgroundColor:'#fce7e7',borderColor:'#e5a1a1'},offText:{color:'#9a1e25',fontWeight:'900',textAlign:'center'},combinedNote:{backgroundColor:'#f5f0ff',borderColor:'#c084fc',borderWidth:1,borderRadius:8,padding:10,marginVertical:8},combinedNoteTitle:{color:'#6b21a8',fontWeight:'800',fontSize:13},combinedNoteList:{color:'#581c87',fontWeight:'700',fontSize:12,marginTop:4},combinedHighlightToggle:{backgroundColor:'#eedcfc',paddingVertical:3,paddingHorizontal:8,borderRadius:4,borderWidth:1,borderColor:'#d8b4fe'},combinedHighlightToggleText:{color:'#6b21a8',fontWeight:'800',fontSize:11},combinedCell:{backgroundColor:'#f5f0ff',borderColor:'#a855f7',borderWidth:1.5},combinedSubjectText:{color:'#581c87',fontWeight:'700'},combinedTeacherText:{color:'#581c87',fontWeight:'900'},combinedChecked:{backgroundColor:'#f3e8ff',borderColor:'#a855f7'},note:{backgroundColor:'#fee2e2',borderColor:'#f87171',borderWidth:1,borderRadius:8,padding:10,marginVertical:8},noteTitle:{color:'#991b1b',fontWeight:'800',fontSize:13,marginBottom:3},noteList:{color:'#7f1d1d',fontWeight:'700',fontSize:12},workspace:{flexDirection:'row',alignItems:'flex-start',gap:8,width:'100%',...Platform.select({web:{height:'auto' as any,minHeight:0 as any,maxHeight:'82vh' as any,overflow:'visible' as any},default:{}})},workspaceCoaching:{flexDirection:'column',alignItems:'stretch',gap:0,...Platform.select({web:{height:'auto' as any,minHeight:0 as any,overflow:'visible' as any},default:{}})},workspaceVertical:{flex:1,...Platform.select({web:{height:'auto' as any,maxHeight:'82vh' as any,overflowY:'auto' as any,overflowX:'auto' as any,paddingRight:12},default:{}})},workspaceVerticalCoaching:{width:'100%',flex:0,...Platform.select({web:{height:'auto' as any,maxHeight:405 as any,overflowY:'auto' as any,overflowX:'auto' as any},default:{}})},workspaceScroll:{flex:1,...Platform.select({web:{overflow:'visible' as any},default:{}})},tableHeaderRow:{zIndex:100,...Platform.select({web:{position:'sticky' as any,top:0,zIndex:100,backgroundColor:'#cfe1f4'},default:{}})},stickyTop:{...Platform.select({web:{position:'sticky' as any,top:0,zIndex:90,backgroundColor:'#d6e6f5'},default:{}})},stickyLeft:{...Platform.select({web:{position:'sticky' as any,left:0,zIndex:80,backgroundColor:'#dce9f6'},default:{}})},bodyTable:{borderTopWidth:0,paddingTop:0,alignSelf:'flex-start',minWidth:'100%'},table:{borderWidth:1,borderColor:'#b8cde3',backgroundColor:'#fff',alignSelf:'flex-start',minWidth:'100%'},row:{flexDirection:'row'},alt:{backgroundColor:'#f1f7fd'},rowEven:{backgroundColor:'#f4f8fc'},rowOdd:{backgroundColor:'#eaf2fa'},headerText:{fontSize:13,color:'#102a45',fontWeight:'800'},timeText:{fontSize:13,color:'#102a45',fontWeight:'800'},head:{width:138,flexShrink:0,minHeight:44,backgroundColor:'#d6e6f5',borderRightWidth:1,borderBottomWidth:1,borderColor:'#b8cde3',alignItems:'center',justifyContent:'center',padding:2},rowHead:{width:100,flexShrink:0,minHeight:44,borderRightWidth:1,borderBottomWidth:1,borderColor:'#b8cde3',alignItems:'center',justifyContent:'center'},classHeadEven:{backgroundColor:'#dce9f6'},classHeadOdd:{backgroundColor:'#ffffff'},classRowEven:{backgroundColor:'#eaf2fa'},classRowOdd:{backgroundColor:'#ffffff'},coachHead:{width:115,minHeight:40,backgroundColor:'#d6e6f5'},coachRowHead:{width:105,minHeight:38,backgroundColor:'#dce9f6'},coach:{width:115,flexShrink:0,minHeight:38,height:38,borderRightWidth:1,borderBottomWidth:1,borderColor:'#bcd1e6',padding:0,justifyContent:'center',alignItems:'stretch'},coachSelect:{backgroundColor:'transparent',borderWidth:0,borderRadius:0,minHeight:38,height:'100%',width:'100%',paddingHorizontal:2,paddingVertical:0,justifyContent:'center',alignItems:'center'},coachSelectText:{fontFamily:'System',fontSize:12,fontWeight:'700',color:'#1e3a5f',textAlign:'center'},coachText:{textAlign:'center',fontSize:13,fontWeight:'700',color:'#1e3a5f'},cell:{width:138,flexShrink:0,minHeight:54,height:54,borderRightWidth:1,borderBottomWidth:1,borderColor:'#bcd1e6',padding:0,justifyContent:'space-between',alignItems:'stretch'},cellSubjectSelect:{backgroundColor:'transparent',borderWidth:0,borderRadius:0,minHeight:26,height:26,paddingHorizontal:2,paddingVertical:0,justifyContent:'center',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#d4e2f0'},cellSubjectSelectText:{fontFamily:'System',fontSize:13,fontWeight:'600',color:'#17365d',textAlign:'center'},cellTeacherSelect:{backgroundColor:'transparent',borderWidth:0,borderRadius:0,minHeight:26,height:26,paddingHorizontal:2,paddingVertical:0,justifyContent:'center',alignItems:'center'},cellTeacherSelectText:{fontFamily:'System',fontSize:13,fontWeight:'800',color:'#091e36',textAlign:'center'},watermarkText:{color:'#94a3b8',fontWeight:'400'},tiffin:{width:82,flexShrink:0,backgroundColor:'#fff0be',alignItems:'center',justifyContent:'center',paddingHorizontal:2},conflict:{backgroundColor:'#fee2e2',borderColor:'#ef4444',borderWidth:2,zIndex:2},conflictSelect:{backgroundColor:'transparent',borderWidth:0},conflictSelectText:{color:'#0f172a',fontWeight:'800'},conflictText:{color:'#991b1b',fontWeight:'800'},subject:{fontWeight:'900',textAlign:'center'},center:{textAlign:'center',fontSize:14,lineHeight:20},outTeacher:{backgroundColor:'#fff7ed',borderColor:'#f97316',borderWidth:2},count:{width:190,backgroundColor:'#fff',borderWidth:1,borderColor:'#c7d7e8',borderRadius:8,padding:9,...Platform.select({web:{maxHeight:'82vh' as any,overflowY:'auto' as any},default:{}})},countResizeHandle:{width:10,minHeight:120,alignSelf:'stretch',backgroundColor:'#dbe8f5',borderRadius:5,alignItems:'center',justifyContent:'center',cursor:'ew-resize' as any},resizeMark:{fontSize:18,fontWeight:'900',color:'#6b8096'},countTitle:{fontSize:17,fontWeight:'900',marginBottom:8},countRow:{flexDirection:'row',borderBottomWidth:1,borderColor:'#c7d7e8',padding:7},total:{flexDirection:'row',justifyContent:'space-between',backgroundColor:'#c8def7',padding:8},bottomCountPanel:{marginTop:10,backgroundColor:'#fff',borderWidth:1,borderColor:'#c7d7e8',borderRadius:8,padding:10,width:'100%'},bottomCountHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8,paddingBottom:6,borderBottomWidth:1,borderColor:'#e2ecf6'},bottomCountTitle:{fontSize:15,fontWeight:'900',color:'#173f77'},bottomTotalBadge:{backgroundColor:'#1768c5',paddingVertical:4,paddingHorizontal:12,borderRadius:6},bottomTotalText:{color:'#fff',fontWeight:'800',fontSize:14},bottomCountGrid:{flexDirection:'row',flexWrap:'wrap',gap:6},bottomCountChip:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#f1f7fd',borderWidth:1,borderColor:'#bcd2ea',borderRadius:6,paddingVertical:5,paddingHorizontal:8,minWidth:140,flexGrow:1,maxWidth:240},bottomCountName:{fontSize:13,fontWeight:'700',color:'#1e3a5f',flex:1,marginRight:6},bottomCountNum:{backgroundColor:'#fff',borderWidth:1,borderColor:'#97b8de',borderRadius:4,paddingHorizontal:6,paddingVertical:1},bottomCountNumText:{fontSize:13,fontWeight:'900',color:'#1768c5'},bottomCountEmpty:{color:'#64748b',fontStyle:'italic',padding:6},noClass:{backgroundColor:'#fff',padding:50,alignItems:'center',borderRadius:10},noClassText:{fontSize:22,fontWeight:'900',color:'#8b2630'},bottom:{marginTop:16,backgroundColor:'#fff',borderRadius:10,padding:12},bottomButtons:{flexDirection:'row',gap:8,flexWrap:'wrap',alignItems:'center'},month:{minWidth:0,width:140,marginBottom:0},historyRow:{flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderColor:'#dae4ee',paddingVertical:9},delete:{backgroundColor:'#b62934',padding:9,borderRadius:6},reportContainer:{marginTop:14,backgroundColor:'#fff',borderRadius:8,borderWidth:1,borderColor:'#94a3b8',padding:14,width:'100%'},reportHeaderBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10,marginBottom:12,paddingBottom:10,borderBottomWidth:1,borderColor:'#cbd5e1'},reportSchoolTitle:{fontSize:20,fontWeight:'900',color:'#1f4e78',textAlign:'center'},reportMonthTitle:{fontSize:16,fontWeight:'800',color:'#1f4e78',textAlign:'center',marginTop:2},reportActionButtons:{flexDirection:'row',gap:8,alignItems:'center',flexWrap:'wrap'},reportDownloadBtn:{backgroundColor:'#15803d',paddingVertical:8,paddingHorizontal:14,borderRadius:6},reportDownloadBtnText:{color:'#fff',fontWeight:'800',fontSize:13},reportPrintBtn:{backgroundColor:'#1e40af',paddingVertical:8,paddingHorizontal:14,borderRadius:6},reportPrintBtnText:{color:'#fff',fontWeight:'800',fontSize:13},reportCloseBtn:{backgroundColor:'#64748b',paddingVertical:8,paddingHorizontal:12,borderRadius:6},reportCloseBtnText:{color:'#fff',fontWeight:'800',fontSize:13},reportFilterRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'},reportSearchInput:{backgroundColor:'#f8fafc',borderWidth:1,borderColor:'#cbd5e1',borderRadius:6,paddingHorizontal:10,paddingVertical:6,minWidth:220,fontSize:13},reportExpandBtn:{backgroundColor:'#e2e8f0',paddingVertical:6,paddingHorizontal:10,borderRadius:6,borderWidth:1,borderColor:'#cbd5e1'},reportExpandBtnText:{color:'#1e293b',fontWeight:'800',fontSize:12},reportCountBadge:{color:'#475569',fontSize:12,fontWeight:'700',marginLeft:'auto'},reportScrollBox:{width:'100%',...Platform.select({web:{maxHeight:'70vh' as any,overflowY:'auto' as any,overflowX:'auto' as any},default:{maxHeight:550}})},reportStickyHeader:{...Platform.select({web:{position:'sticky' as any,top:0,zIndex:20,backgroundColor:'#ffffff'},default:{}})},reportTable:{borderWidth:1,borderColor:'#000',alignSelf:'flex-start'},reportRow:{flexDirection:'row'},reportHeaderRow:{backgroundColor:'#ffffff',borderBottomWidth:1,borderColor:'#000'},reportHeaderText:{color:'#cc0000',fontWeight:'800',textDecorationLine:'underline',fontSize:13},reportCell:{borderRightWidth:1,borderBottomWidth:1,borderColor:'#000',paddingHorizontal:8,paddingVertical:6,justifyContent:'center',alignItems:'center'},reportCellText:{fontSize:12,color:'#0f172a'},reportRowWhite:{backgroundColor:'#ffffff'},reportRowAlt:{backgroundColor:'#eaf2fa'},reportTotalRow:{backgroundColor:'#d9e1f2',borderTopWidth:1,borderColor:'#000'},masterPanel:{backgroundColor:'#fff',borderWidth:1,borderColor:'#c6d7e8',borderRadius:8,padding:10,marginBottom:8,flexDirection:'row',flexWrap:'wrap',gap:9,alignItems:'center'},masterSelect:{minWidth:190},masterDayText:{fontWeight:'900',color:'#17613c',backgroundColor:'#d9f0e2',padding:10,borderRadius:6},masterAction:{backgroundColor:'#1768c5',padding:11,borderRadius:6},coachingFormat:{backgroundColor:'#e4f2ff',borderWidth:1,borderColor:'#a9cbea',padding:10,borderRadius:8,marginBottom:8},coachingHelp:{color:'#365b7c',fontWeight:'700',marginTop:3},examPublic:{backgroundColor:'#fff',marginTop:14,padding:12,borderRadius:10,borderWidth:1,borderColor:'#c6d7e8'},examRow:{paddingVertical:9,borderBottomWidth:1,borderColor:'#d7e2ed',flexDirection:'row'},tools:{backgroundColor:'#fff',marginTop:14,padding:12,borderRadius:10},toolTabs:{flexDirection:'row',flexWrap:'wrap',gap:8,marginVertical:8},toolButton:{backgroundColor:'#dceafb',padding:11,borderRadius:7},panel:{borderTopWidth:1,borderColor:'#d3deea',paddingTop:12,marginTop:8,gap:8},panelTitle:{fontSize:18,fontWeight:'900',color:'#173f77'},formField:{minWidth:240,flexGrow:1},label:{fontWeight:'800',color:'#36516e'},configInput:{borderWidth:1,borderColor:'#b8c9db',borderRadius:7,padding:12,minWidth:230,minHeight:46,backgroundColor:'#fff'},multiline:{minHeight:105,textAlignVertical:'top'},subjectChecks:{flexDirection:'row',flexWrap:'wrap',gap:7},subjectCheck:{borderWidth:1,borderColor:'#b9c9da',paddingHorizontal:8,paddingVertical:6,borderRadius:5,backgroundColor:'#fff'},subjectChecked:{backgroundColor:'#1768c5',borderColor:'#1768c5'},subjectSaving:{opacity:.5},subjectCheckText:{fontSize:12,color:'#263d54'},subjectCheckedText:{color:'#fff',fontWeight:'900'},assignHeader:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center'},assignHelp:{color:'#61758a',marginBottom:5},assignList:{maxHeight:430,borderWidth:1,borderColor:'#d2deea',borderRadius:8},teacherSubjectRow:{padding:11,borderBottomWidth:1,borderColor:'#d7e2ed'},teacherSubjectName:{fontWeight:'900',color:'#173f77',fontSize:15,marginBottom:8},
modalOverlay:{flex:1,backgroundColor:'rgba(15,23,42,0.65)',justifyContent:'center',alignItems:'center',padding:10},
modalContainer:{backgroundColor:'#f8fafc',borderRadius:10,width:'100%',maxWidth:860,...Platform.select({web:{maxHeight:'94vh' as any},default:{maxHeight:650}}),borderWidth:1,borderColor:'#cbd5e1',overflow:'hidden'},
modalHeaderBar:{backgroundColor:'#1e293b',paddingHorizontal:14,paddingVertical:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8},
modalTabGroup:{flexDirection:'row',gap:6,flexWrap:'wrap'},
modalTab:{paddingHorizontal:10,paddingVertical:6,borderRadius:6,backgroundColor:'#334155'},
modalTabActive:{backgroundColor:'#2563eb'},
modalTabText:{color:'#cbd5e1',fontSize:12,fontWeight:'700'},
modalTabTextActive:{color:'#ffffff',fontWeight:'900'},
modalActionsGroup:{flexDirection:'row',gap:8,alignItems:'center',flexWrap:'wrap'},
modalExcelBtn:{backgroundColor:'#16a34a',paddingHorizontal:12,paddingVertical:7,borderRadius:6},
modalPrintBtn:{backgroundColor:'#2563eb',paddingHorizontal:12,paddingVertical:7,borderRadius:6},
modalCloseBtn:{backgroundColor:'#475569',paddingHorizontal:10,paddingVertical:7,borderRadius:6},
modalBtnText:{color:'#ffffff',fontWeight:'800',fontSize:12},
modalScrollBody:{width:'100%'},
modalScrollContent:{padding:16,alignItems:'center'},
paperSheet:{backgroundColor:'#ffffff',width:'100%',maxWidth:760,padding:24,borderRadius:4,borderWidth:1,borderColor:'#d1d5db',...Platform.select({web:{boxShadow:'0 4px 12px rgba(0,0,0,0.1)'} as any,default:{}})},
paperSchoolTitle:{fontSize:20,fontWeight:'900',color:'#000000',textAlign:'center'},
paperSchoolSub:{fontSize:13,fontWeight:'700',color:'#000000',textAlign:'center',marginTop:2},
paperUnitTitle:{fontSize:13,fontWeight:'700',color:'#000000',textAlign:'center',marginTop:2},
paperDocTitle:{fontSize:14,fontWeight:'800',color:'#000000',textAlign:'center',marginTop:8,marginBottom:14},
paperTeacherInfoRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12,paddingBottom:6,borderBottomWidth:1,borderColor:'#94a3b8',flexWrap:'wrap',gap:6},
paperTeacherInfoText:{fontSize:13,color:'#000000'},
paperTable:{borderWidth:1,borderColor:'#000000',width:'100%'},
paperTableRow:{flexDirection:'row',borderBottomWidth:1,borderColor:'#000000'},
paperTableHeaderRow:{backgroundColor:'#f8fafc',borderBottomWidth:1,borderColor:'#000000'},
paperTableTotalRow:{backgroundColor:'#f1f5f9'},
paperCell:{borderRightWidth:1,borderColor:'#000000',paddingHorizontal:6,paddingVertical:5,justifyContent:'center',alignItems:'center'},
paperHeaderCellText:{fontSize:12,fontWeight:'800',color:'#000000',textAlign:'center'},
paperCellText:{fontSize:12,color:'#000000',textAlign:'center'},
paperSignatureRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-end',marginTop:48,paddingHorizontal:16},
paperSignatureBox:{alignItems:'center',width:220},
paperSignatureLine:{width:'100%',borderTopWidth:1,borderStyle:'dashed',borderColor:'#000000',marginBottom:6},
paperSignatureLabel:{fontSize:12,fontWeight:'700',color:'#000000'},
clickableBadgeCoaching:{backgroundColor:'#e0e7ff',borderRadius:12,paddingHorizontal:10,paddingVertical:2,borderWidth:1,borderColor:'#818cf8'},
clickableBadgeCoachingText:{color:'#3730a3',fontWeight:'900',fontSize:13},
clickableBadge:{backgroundColor:'#f1f5f9',borderRadius:12,paddingHorizontal:8,paddingVertical:2,borderWidth:1,borderColor:'#cbd5e1'},
clickableBadgeText:{color:'#1e293b',fontWeight:'800',fontSize:12},
clickableBadgeTotal:{backgroundColor:'#dbeafe',borderRadius:12,paddingHorizontal:8,paddingVertical:2,borderWidth:1,borderColor:'#93c5fd'}
});


