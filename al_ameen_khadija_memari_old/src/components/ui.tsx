import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export function Field(props: any) {
  return <TextInput placeholderTextColor="#888" {...props} placeholder={props.placeholder||props.label} style={[styles.input, props.style]} />;
}
export function Button({ title, onPress, danger=false }: any) {
  return <TouchableOpacity onPress={onPress} style={[styles.button, danger && styles.danger]}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>;
}
export function Card({ children }: any) { return <View style={styles.card}>{children}</View>; }
export function H1({ children }: any) { return <Text style={styles.h1}>{children}</Text>; }
export function Muted({ children }: any) { return <Text style={styles.muted}>{children}</Text>; }

const styles=StyleSheet.create({
  input:{borderWidth:1,borderColor:'#ccd3da',backgroundColor:'#fff',borderRadius:10,padding:12,fontSize:16,marginBottom:10},
  button:{backgroundColor:'#1565c0',padding:13,borderRadius:10,marginVertical:6},danger:{backgroundColor:'#c62828'},buttonText:{color:'#fff',fontWeight:'700',textAlign:'center',fontSize:16},
  card:{backgroundColor:'#fff',borderRadius:14,padding:14,marginBottom:12,elevation:2},h1:{fontSize:24,fontWeight:'800',marginBottom:12},muted:{color:'#667085'}
});
