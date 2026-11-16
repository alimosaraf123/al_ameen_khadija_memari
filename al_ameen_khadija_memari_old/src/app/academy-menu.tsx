import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';

const items: [string, string][] = [['Weekly Marks','/marks'],['OMR Exam & Evaluation','/omr-evaluation'],['Terminal Exam','/terminal-exams'],['Print Terminal Result','/class-results'],['Routine','/routines'],['Notice','/notices'],['Library','/library']];
export default function AcademyMenu(){return <ScrollView contentContainerStyle={s.body}><AcademyHeader/><View style={s.nav}><TouchableOpacity onPress={()=>router.replace('/superadmin')} style={s.light}><Text>Home</Text></TouchableOpacity></View><Text style={s.title}>Academy</Text><View style={s.grid}>{items.map(([label,path])=><TouchableOpacity key={path} style={s.card} onPress={()=>router.push(path as any)}><Text style={s.arrow}>›</Text><Text style={s.cardText}>{label}</Text></TouchableOpacity>)}</View></ScrollView>}
const s=StyleSheet.create({body:{padding:16,gap:14},nav:{flexDirection:'row'},light:{backgroundColor:'#e0ebf6',padding:11,borderRadius:7},title:{fontSize:26,fontWeight:'900',color:'#173f77'},grid:{flexDirection:'row',flexWrap:'wrap',gap:12},card:{minWidth:250,flexGrow:1,flexDirection:'row',alignItems:'center',gap:14,padding:18,borderRadius:10,backgroundColor:'#fff',borderWidth:1,borderColor:'#d5e0ec'},arrow:{fontSize:28,color:'#1768c5'},cardText:{fontSize:18,fontWeight:'800',color:'#173f77'}});
