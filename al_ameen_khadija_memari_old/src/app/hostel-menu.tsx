import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { getUser } from '../lib/auth';

const items: [string, string][] = [['Rooms','/rooms'],['Teacher Room Assignment','/room-assignments'],['Calling Schedule','/calling-schedule'],['Daily Student Attendance','/daily-attendance'],['Evening Room Attendance','/attendance'],['Student Behaviour','/behavior'],['Student Illness','/illness'],['Room Problem','/problems'],['Stock','/dining-stock'],['Asset Register','/asset-register']];
export default function HostelMenu(){
  const [role, setRole] = useState<string>('');
  useEffect(() => { getUser().then((u: any) => setRole(String(u?.role || ''))).catch(() => {}); }, []);
  const visibleItems = items.filter(([, path]) => path !== '/calling-schedule' || role === 'super_admin');
  return <ScrollView contentContainerStyle={s.body}><AcademyHeader/><View style={s.nav}><TouchableOpacity onPress={()=>router.replace('/superadmin')} style={s.light}><Text>Home</Text></TouchableOpacity></View><Text style={s.title}>Hostel</Text><View style={s.grid}>{visibleItems.map(([label,path])=><TouchableOpacity key={path} style={s.card} onPress={()=>router.push(path as any)}><Text style={s.arrow}>›</Text><Text style={s.cardText}>{label}</Text></TouchableOpacity>)}</View></ScrollView>;
}
const s=StyleSheet.create({body:{padding:16,gap:14},nav:{flexDirection:'row'},light:{backgroundColor:'#e0ebf6',padding:11,borderRadius:7},title:{fontSize:26,fontWeight:'900',color:'#173f77'},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},card:{minWidth:250,flexGrow:1,flexDirection:'row',alignItems:'center',gap:14,padding:18,borderRadius:10,backgroundColor:'#fff',borderWidth:1,borderColor:'#d5e0ec'},arrow:{fontSize:28,color:'#1768c5'},cardText:{fontSize:18,fontWeight:'800',color:'#173f77'}});
