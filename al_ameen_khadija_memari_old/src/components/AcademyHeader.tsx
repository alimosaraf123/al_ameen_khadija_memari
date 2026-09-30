import React,{useEffect,useState} from 'react';
import {Image,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {router} from 'expo-router';
import {clearSession,getUser} from '../lib/auth';
export default function AcademyHeader(){
 const [admin,setAdmin]=useState(false);
 useEffect(()=>{void getUser<any>().then(user=>setAdmin(user?.role==='admin'||user?.role==='super_admin'));},[]);
 return <View style={styles.header}><Image source={require('../../assets/images/al-ameen-logo.jpg')} resizeMode="contain" accessibilityLabel="Al-Ameen Mission Academy Memari logo" style={styles.logo}/><Text style={styles.name}>Al-Ameen Mission Academy Memari</Text>{admin&&<View style={styles.actions}><TouchableOpacity style={styles.home} onPress={()=>router.push('/superadmin')}><Text style={styles.actionText}>Home</Text></TouchableOpacity><TouchableOpacity style={styles.logout} onPress={async()=>{await clearSession();router.replace('/')}}><Text style={styles.actionText}>Logout</Text></TouchableOpacity></View>}</View>;
}
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12,padding:16,backgroundColor:'#fff',borderRadius:12,marginBottom:14},logo:{width:58,height:60},name:{flex:1,minWidth:210,color:'#166534',fontSize:21,fontWeight:'800'},actions:{flexDirection:'row',gap:7},home:{backgroundColor:'#1768c5',paddingHorizontal:13,paddingVertical:9,borderRadius:7},logout:{backgroundColor:'#b52d3a',paddingHorizontal:13,paddingVertical:9,borderRadius:7},actionText:{color:'#fff',fontWeight:'800'}});