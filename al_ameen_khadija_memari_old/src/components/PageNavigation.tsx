import React from 'react';
import {Text,TouchableOpacity,View,StyleSheet} from 'react-native';
import {router} from 'expo-router';
import AcademyHeader from './AcademyHeader';

export default function PageNavigation(){
  return <View><AcademyHeader/><TouchableOpacity onPress={()=>router.back()} style={s.back}><Text style={s.text}>← Back</Text></TouchableOpacity></View>;
}
const s=StyleSheet.create({back:{alignSelf:'flex-start',backgroundColor:'#e5eef8',paddingHorizontal:14,paddingVertical:8,borderRadius:7,marginBottom:8},text:{color:'#1764a5',fontWeight:'800'}});
