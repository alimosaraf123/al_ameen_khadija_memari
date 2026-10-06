import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AcademyHeader from '../components/AcademyHeader';
import { Field } from '../components/ui';
import { api } from '../lib/api';
import { Select } from '../components/StudentDirectory';

export default function Behavior() {
  const [registrationNo, setRegistrationNo] = useState('');
  const [student, setStudent] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [type, setType] = useState('');
  const [details, setDetails] = useState('');
  const [action, setAction] = useState('');
  const [positivePoints, setPositivePoints] = useState('');
  const [negativePoints, setNegativePoints] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const search = async () => {
    if (!registrationNo.trim()) return Alert.alert('Required', 'Enter registration number.');
    setLoading(true);
    try {
      const data = await api(`/api/behavior/registration/${encodeURIComponent(registrationNo.trim())}`);
      setStudent(data.student);
      setRecords(data.records || []);
    } catch (error: any) {
      setStudent(null); setRecords([]); Alert.alert('Not Found', error.message);
    } finally { setLoading(false); }
  };

  const save = async () => {
    if (!student || !details.trim()) return Alert.alert('Required', 'Search a student and write behaviour details.');
    const plus = Number(positivePoints || 0);
    const minus = Number(negativePoints || 0);
    if (!Number.isInteger(plus) || !Number.isInteger(minus) || plus < 0 || minus < 0) return Alert.alert('Invalid points', 'Use whole numbers in the + or - field.');
    if (plus > 0 && minus > 0) return Alert.alert('Invalid points', 'à¦à¦•à¦Ÿà¦¿ entry-à¦¤à§‡ + à¦…à¦¥à¦¬à¦¾ - à¦à¦•à¦Ÿà¦¿ à¦®à¦¾à¦¤à§à¦° à¦¦à¦¿à¦¨à¥¤');
    setSaving(true);
    try {
      await api('/api/behavior', { method: 'POST', body: JSON.stringify({ student_id: student.id, behavior_type: type.trim() || null, details: details.trim(), action_taken: action.trim() || null, positive_points: plus, negative_points: minus }) });
      setType(''); setDetails(''); setAction(''); setPositivePoints(''); setNegativePoints(''); await search(); setShowForm(false);
      Alert.alert('Saved', 'Student behaviour record saved.');
    } catch (error: any) { Alert.alert('Error', error.message); }
    finally { setSaving(false); }
  };

  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
    <AcademyHeader />
    <Text style={s.title}>Student Behaviour</Text>
    <Text style={s.help}>Registration number à¦¦à¦¿à§Ÿà§‡ student à¦–à§à¦à¦œà§‡ behaviour à¦¯à§‹à¦— à¦•à¦°à§à¦¨à¥¤</Text>
    <View style={s.searchRow}><Field placeholder="Registration number" value={registrationNo} onChangeText={setRegistrationNo} style={s.searchInput} /><TouchableOpacity onPress={search} style={s.searchButton}><Text style={s.buttonText}>{loading ? 'Searching...' : 'Search'}</Text></TouchableOpacity></View>
    {loading && <ActivityIndicator color="#6f42c1" />}
    {student && <>
      <View style={s.studentCard}><Text style={s.studentName}>{student.student_name}</Text><Text style={s.meta}>Reg. {student.registration_no} Â· Class {student.class_name || '-'} Â· Room {student.room_name || '-'}</Text><Text style={s.rank}>Behaviour Rank: {records.reduce((sum, r) => sum + Number(r.positive_points || 0) - Number(r.negative_points || 0), 0)}</Text></View>
      <View style={s.recordsBox}><View style={s.recordsHeader}><Text style={s.recordsStudent}>{student.student_name}</Text><TouchableOpacity onPress={() => setShowForm(true)} style={s.addButton}><Text style={s.addText}>Add</Text></TouchableOpacity></View><ScrollView horizontal showsHorizontalScrollIndicator><View style={s.table}><View style={[s.tableRow, s.headerRow]}>{['TID','PARTICULARS','REMARKS','CLASS','DATE','DEBIT (-)','CREDIT (+)','CIVIL','GENERATE','DELETE'].map(h => <Text key={h} style={[s.cell, s.headerCell]}>{h}</Text>)}</View>{records.length === 0 ? <Text style={s.empty}>No behaviour records found.</Text> : records.map((record, index) => { const debit=Number(record.negative_points||0); const credit=Number(record.positive_points||0); return <View key={record.id} style={s.tableRow}><Text style={s.cell}>{index + 1}</Text><Text style={s.cell}>Student Behaviour</Text><Text style={s.cell}>{record.details || record.behavior_type || 'Overall Behavior'}</Text><Text style={s.cell}>{student.class_name || '-'}</Text><Text style={s.cell}>{String(record.record_date || record.created_at || '').slice(0,16).replace('T',' ')}</Text><Text style={[s.cell, s.debit]}>{debit || ''}</Text><Text style={[s.cell, s.credit]}>{credit || ''}</Text><Text style={s.cell}>{credit - debit}</Text><Text style={s.cell}>{record.reported_by_name || 'User'}</Text><TouchableOpacity style={s.deleteButton}><Text style={s.deleteText}>âŒ«</Text></TouchableOpacity></View> })}</View></ScrollView></View>
      <View style={s.formCard}>
        <Select label="Behaviour Type" value={type} onChange={setType} options={[{value:'',label:'Select behaviour type'},{value:'Good',label:'Good'},{value:'Discipline',label:'Discipline'},{value:'Misconduct',label:'Misconduct'},{value:'Achievement',label:'Achievement'},{value:'Other',label:'Other'}]} />
        <View style={s.pointsRow}><Field placeholder="+ Points (good behaviour)" value={positivePoints} onChangeText={v => setPositivePoints(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={s.pointInput} /><Field placeholder="- Points (bad behaviour)" value={negativePoints} onChangeText={v => setNegativePoints(v.replace(/[^0-9]/g, ''))} keyboardType="numeric" style={s.pointInput} /></View>
        <Field placeholder="Behaviour details *" value={details} onChangeText={setDetails} multiline numberOfLines={3} style={s.multiline} />
        <Field placeholder="Action taken" value={action} onChangeText={setAction} multiline numberOfLines={2} style={s.multiline} />
        <TouchableOpacity disabled={saving} onPress={save} style={s.saveButton}><Text style={s.buttonText}>{saving ? 'Saving...' : 'Save Behaviour'}</Text></TouchableOpacity>
      </View>
      <Text style={s.sectionTitle}>Previous Records ({records.length})</Text>
      {records.map(record => <View key={record.id} style={s.recordCard}><Text style={s.recordTitle}>{record.behavior_type || 'Behaviour'} Â· {String(record.record_date).slice(0,10)} {Number(record.positive_points || 0) > 0 ? `Â· +${record.positive_points}` : Number(record.negative_points || 0) > 0 ? `Â· -${record.negative_points}` : ''}</Text><Text style={s.recordText}>{record.details}</Text>{!!record.action_taken && <Text style={s.actionText}>Action: {record.action_taken}</Text>}<Text style={s.reporter}>By {record.reported_by_name || 'User'}</Text></View>)}
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  page:{flex:1,backgroundColor:'#f5f2fa'},content:{width:'100%',maxWidth:1100,alignSelf:'center',padding:16,paddingBottom:45},title:{fontSize:27,fontWeight:'900',color:'#42256a',marginTop:6},help:{color:'#70647f',marginTop:4,marginBottom:16},searchRow:{flexDirection:'row',gap:8},searchInput:{flex:1,marginBottom:0},searchButton:{backgroundColor:'#6f42c1',borderRadius:9,paddingHorizontal:22,justifyContent:'center'},buttonText:{color:'#fff',fontWeight:'900',textAlign:'center'},studentCard:{backgroundColor:'#eee5fb',borderRadius:13,padding:14,marginTop:14},studentName:{fontSize:18,fontWeight:'900',color:'#39205b'},meta:{color:'#695879',marginTop:4},rank:{color:'#6f42c1',fontWeight:'900',marginTop:7},recordsBox:{backgroundColor:'#f3f3f3',borderWidth:1,borderColor:'#222',borderRadius:6,padding:14,marginTop:14},recordsHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:9},recordsStudent:{fontSize:16,color:'#25354a'},addButton:{backgroundColor:'#1677ed',borderRadius:4,paddingHorizontal:12,paddingVertical:7},addText:{color:'#fff',fontWeight:'800'},table:{minWidth:1040,borderWidth:1,borderColor:'#d7dce2'},tableRow:{flexDirection:'row',minHeight:39,borderBottomWidth:1,borderColor:'#d7dce2',alignItems:'stretch'},headerRow:{backgroundColor:'#fafafa'},cell:{width:110,paddingHorizontal:8,paddingVertical:8,textAlign:'center',borderRightWidth:1,borderColor:'#d7dce2',color:'#17202b'},headerCell:{fontWeight:'900',fontSize:14},debit:{color:'#b21e2b'},credit:{color:'#008a00',fontWeight:'900'},deleteButton:{width:75,alignItems:'center',justifyContent:'center'},deleteText:{fontSize:20,color:'#17202b'},empty:{padding:16,color:'#667085'},formCard:{backgroundColor:'#fff',borderRadius:15,padding:15,marginVertical:14},pointsRow:{flexDirection:'row',gap:8},pointInput:{flex:1},multiline:{minHeight:72,textAlignVertical:'top'},saveButton:{backgroundColor:'#6f42c1',borderRadius:9,padding:14},sectionTitle:{fontSize:18,fontWeight:'900',color:'#432c61',marginBottom:10},recordCard:{backgroundColor:'#fff',borderRadius:12,padding:13,marginBottom:9},recordTitle:{fontWeight:'900',color:'#4f3371'},recordText:{color:'#354052',marginTop:5},actionText:{color:'#175f3b',marginTop:5,fontWeight:'700'},reporter:{color:'#7b8490',fontSize:12,marginTop:8}
});

