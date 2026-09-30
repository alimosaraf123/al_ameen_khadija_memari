import React,{useState} from 'react';
import {ScrollView,Text,Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {api} from '../lib/api';
import {Field,Button,Card,H1} from '../components/ui';
import DatePickerField from '../components/DatePickerField';
export default function Dues(){
 const [student,setStudent]=useState(''),[title,setTitle]=useState(''),[amount,setAmount]=useState(''),[dueDate,setDueDate]=useState(''),[list,setList]=useState<any[]>([]);
 const load=async()=>{try{const d=await api(`/api/dues/student/${student}`);setList(d.dues)}catch(e:any){Alert.alert('Error',e.message)}};
 const add=async()=>{try{await api('/api/dues',{method:'POST',body:JSON.stringify({student_id:Number(student),due_title:title,amount:Number(amount),due_date:dueDate||null})});setTitle('');setAmount('');setDueDate('');load()}catch(e:any){Alert.alert('Error',e.message)}};
 return <SafeAreaView style={{flex:1,backgroundColor:'#f3f6f9'}}><ScrollView contentContainerStyle={{padding:16}}><H1>Dues</H1><Field placeholder="Student ID" value={student} onChangeText={setStudent} keyboardType="numeric"/><Button title="Load Dues" onPress={load}/><Field placeholder="Due title" value={title} onChangeText={setTitle}/><Field placeholder="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric"/><DatePickerField label="Due Date" value={dueDate} onChange={setDueDate} optional/><Button title="Add Due" onPress={add}/>{list.map(x=><Card key={x.id}><Text style={{fontWeight:'800'}}>{x.due_title}</Text><Text>₹{x.amount} • {x.status}{x.due_date?' • '+String(x.due_date).slice(0,10):''}</Text></Card>)}</ScrollView></SafeAreaView>;
}
