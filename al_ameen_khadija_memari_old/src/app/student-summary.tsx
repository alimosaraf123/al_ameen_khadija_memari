import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { api } from '../lib/api';

export default function StudentSummary() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { void (async () => { try { const data = await api('/api/attendance/student-summary'); setRows(data.summary || []); } catch (e: any) { setError(e.message); } finally { setLoading(false); } })(); }, []);
  const total = rows.reduce((n, row) => n + Number(row.total || 0), 0);
  const absent = rows.reduce((n, row) => n + Number(row.absent || 0), 0);
  return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}><AcademyHeader /><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',marginVertical:12}}><View><Text style={s.title}>Student Summary</Text><Text style={s.note}>Absent count is calculated from printed and active Gate Pass records.</Text></View><TouchableOpacity onPress={()=>router.push('/daily-attendance' as any)} style={{backgroundColor:'#0284c7',paddingVertical:9,paddingHorizontal:15,borderRadius:6,flexDirection:'row',alignItems:'center',gap:6}}><Text style={{color:'#fff',fontWeight:'800',fontSize:13}}>📋 Open Daily Attendance Sheet</Text></TouchableOpacity></View>{loading ? <ActivityIndicator color="#1565c0" /> : error ? <Text style={s.error}>{error}</Text> : <View style={s.table}><View style={[s.row, s.head]}><Text style={[s.cell, s.classCell]}>Class</Text><Text style={s.cell}>Present</Text><Text style={s.cell}>Absent</Text><Text style={[s.cell, s.totalCell]}>Total</Text></View>{rows.map(row => <View key={row.class_name} style={s.row}><Text style={[s.cell, s.classCell]}>{row.class_name}</Text><Text style={s.cell}>{row.present}</Text><Text style={s.cell}>{row.absent}</Text><Text style={[s.cell, s.totalCell]}>{row.total}</Text></View>)}<View style={[s.row, s.totalRow]}><Text style={[s.cell, s.classCell]}>Total</Text><Text style={s.cell}>{total - absent}</Text><Text style={s.cell}>{absent}</Text><Text style={[s.cell, s.totalCell]}>{total}</Text></View></View>}</ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ page:{flex:1,backgroundColor:'#f1f5f9'},content:{padding:16,width:'100%',maxWidth:1100,alignSelf:'center'},title:{fontSize:24,fontWeight:'900',color:'#173a2a',marginVertical:12},note:{color:'#64748b',marginBottom:14},table:{backgroundColor:'#fff',borderWidth:1,borderColor:'#9fb4c8'},row:{flexDirection:'row',minHeight:44,borderBottomWidth:1,borderBottomColor:'#cbd5df',alignItems:'stretch'},head:{backgroundColor:'#dbe8f4'},totalRow:{backgroundColor:'#9be89b',borderBottomWidth:0},cell:{flex:1,padding:10,borderRightWidth:1,borderRightColor:'#cbd5df',textAlign:'center'},classCell:{flex:1.3,textAlign:'left',fontWeight:'800'},totalCell:{backgroundColor:'#9be89b'},error:{color:'#b42318',padding:12}});
