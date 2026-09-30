import React,{useState} from 'react';
import {Platform,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

type Props={label:string;value:string;onChange:(value:string)=>void;kind?:'date'|'datetime'|'month';disabled?:boolean;style?:any;optional?:boolean;minimum?:string};
const pad=(n:number)=>String(n).padStart(2,'0');
const dateValue=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const timeValue=(d:Date)=>`${pad(d.getHours())}:${pad(d.getMinutes())}`;
function parsed(value:string){const d=value?new Date(value.length===10?value+'T00:00:00':value):new Date();return Number.isNaN(d.getTime())?new Date():d}
export default function DatePickerField({label,value,onChange,kind='date',disabled=false,style,optional=false,minimum}:Props){
 const [picker,setPicker]=useState<'date'|'time'|null>(null),[draft,setDraft]=useState<Date|null>(null);
 if(Platform.OS==='web')return <View style={[s.wrap,style]}><Text style={s.label}>{label}</Text>{React.createElement('input',{type:kind==='datetime'?'datetime-local':kind,value:value||'',disabled,min:minimum||undefined,onChange:(e:any)=>onChange(e.target.value),style:webStyle})}</View>;
 const open=()=>{if(!disabled)setPicker('date')};
 const changed=(_:any,next?:Date)=>{if(!next){setPicker(null);return}if(kind==='datetime'&&picker==='date'){setDraft(next);setPicker('time');return}setPicker(null);if(kind==='month')onChange(`${next.getFullYear()}-${pad(next.getMonth()+1)}`);else if(kind==='datetime'){const base=draft||next;base.setHours(next.getHours(),next.getMinutes(),0,0);onChange(`${dateValue(base)}T${timeValue(base)}`);setDraft(null)}else onChange(dateValue(next))};
 const display=value?(kind==='date'?value.split('-').reverse().join('/'):value.replace('T',' ')):(optional?'Select if needed':'Select date');
 return <View style={[s.wrap,style]}><Text style={s.label}>{label}</Text><TouchableOpacity disabled={disabled} onPress={open} style={[s.field,disabled&&s.disabled]}><Text style={value?s.value:s.placeholder}>{display}</Text><Text>📅</Text></TouchableOpacity>{picker&&<DateTimePicker value={picker==='time'?(draft||parsed(value)):parsed(value)} mode={picker} minimumDate={minimum?parsed(minimum):undefined} onChange={changed}/>}</View>;
}
const webStyle={width:'100%',minHeight:44,border:'1px solid #cbd5e1',borderRadius:9,padding:'0 11px',fontSize:14,background:'#fff',boxSizing:'border-box' as const};
const s=StyleSheet.create({wrap:{marginBottom:10,minWidth:180},label:{fontSize:12,fontWeight:'700',color:'#475569',marginBottom:5},field:{height:44,borderWidth:1,borderColor:'#cbd5e1',borderRadius:9,backgroundColor:'#fff',paddingHorizontal:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},disabled:{opacity:.55},value:{color:'#111827'},placeholder:{color:'#94a3b8'}});
