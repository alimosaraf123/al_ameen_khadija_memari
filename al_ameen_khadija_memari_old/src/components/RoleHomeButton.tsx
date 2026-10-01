import React,{useEffect,useState}from'react';
import{StyleSheet,Text,TouchableOpacity}from'react-native';
import{router}from'expo-router';
import{getUser}from'../lib/auth';
export const homeForRole=(role:string)=>role==='guardian'?'/guardian':role==='teacher'?'/teacher':role==='gateman'?'/gateman':role==='office'?'/office':role==='library'?'/library':'/superadmin';
export default function RoleHomeButton(){const[role,setRole]=useState('');useEffect(()=>{void getUser<any>().then(u=>setRole(u?.role||''))},[]);if(!role)return null;return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to main menu" style={s.button} onPress={()=>router.replace(homeForRole(role) as any)}><Text style={s.text}>⌂ Home</Text></TouchableOpacity>}
const s=StyleSheet.create({button:{backgroundColor:'#1768c5',paddingHorizontal:12,paddingVertical:7,borderRadius:7,marginRight:8},text:{color:'#fff',fontWeight:'800'}});