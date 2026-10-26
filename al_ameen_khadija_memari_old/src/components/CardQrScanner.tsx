import React,{useState}from'react';
import{Alert,StyleSheet,Text,TouchableOpacity,View}from'react-native';
import{CameraView,useCameraPermissions}from'expo-camera';

function registrationFromQr(raw:string){
 const value=String(raw||'').trim();
 if(!value)return '';
 if(/^\d{4,8}$/.test(value))return value;
 const aamMatch=value.match(/^aam(\d{4,8})$/i);
 if(aamMatch)return aamMatch[1];
 const values=[value];
 try{const decoded=decodeURIComponent(value);if(decoded!==value)values.push(decoded)}catch{}
 for(const candidate of values){
  try{
   const parsed=JSON.parse(candidate);
   for(const key of ['registration_no','registration','reg_no','reg','student','id']){
    const v=String(parsed?.[key]??'').trim();
    if(/^\d{4,8}$/.test(v))return v;
    const m=v.match(/^aam(\d{4,8})$/i);
    if(m)return m[1];
   }
  }catch{}
 }
 try{
  const url=new URL(value);
  for(const key of ['registration_no','registration','reg_no','reg','student','id']){
   const candidate=url.searchParams.get(key);
   if(candidate&&/^\d{4,8}$/.test(candidate.trim()))return candidate.trim();
   const m=candidate?.match(/^aam(\d{4,8})$/i);
   if(m)return m[1];
  }
 }catch{}
 const marked=value.match(/(?:registration|reg|student|stu|id)(?:istration)?(?:[\s_\-]?no)?[\s_:\=\/\-]*(\d{4,8})/i);
 if(marked)return marked[1];
 const candidates=value.match(/\b\d{4,8}\b/g)||[];
 return candidates[0]||'';
}

export default function CardQrScanner({onRegistration}:{onRegistration:(registration:string)=>void|Promise<void>}){
 const[permission,requestPermission]=useCameraPermissions();
 const[open,setOpen]=useState(false),[locked,setLocked]=useState(false);
 const start=async()=>{if(!permission?.granted){const result=await requestPermission();if(!result.granted)return Alert.alert('Camera permission','Camera permission is required to scan the student card.')}setLocked(false);setOpen(true)};
 const scanned=async({data}:any)=>{if(locked)return;setLocked(true);const registration=registrationFromQr(data);if(!registration){setLocked(false);return Alert.alert('Invalid card','Registration number was not found in this barcode / QR code.')}setOpen(false);await onRegistration(registration)};
 return <View style={s.wrap}><TouchableOpacity onPress={open?()=>setOpen(false):start} style={s.button}><Text style={s.white}>{open?'Close Scanner':'Scan Student Card Barcode / QR'}</Text></TouchableOpacity>{open&&<View style={s.cameraBox}><CameraView style={s.camera} facing="back" barcodeScannerSettings={{barcodeTypes:['qr','code128','code39','code93','ean13','ean8','upc_a','upc_e']}} onBarcodeScanned={locked?undefined:scanned}/><Text style={s.help}>Card Barcode ba QR code camera frame-er moddhe dhorun.</Text></View>}</View>
}
const s=StyleSheet.create({wrap:{backgroundColor:'#fff',borderRadius:9,borderWidth:1,borderColor:'#cbd8e4',padding:10},button:{alignSelf:'flex-start',backgroundColor:'#6b3fa0',paddingHorizontal:14,paddingVertical:10,borderRadius:7},white:{color:'#fff',fontWeight:'900'},cameraBox:{marginTop:10,maxWidth:420},camera:{width:'100%',height:270,borderRadius:9,overflow:'hidden'},help:{marginTop:7,color:'#526b84',fontWeight:'700'}});
