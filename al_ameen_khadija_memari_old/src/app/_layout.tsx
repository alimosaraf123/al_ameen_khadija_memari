import React, {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Platform,View,Text} from 'react-native';
import {Stack,usePathname} from 'expo-router';
import {api} from '../lib/api';
import {clearSession,getToken,subscribeSession} from '../lib/auth';
import {canOpenRoute,PRIVATE_ROUTES} from '../lib/routeAccess';
import {registerPushNotifications,subscribeToPushNavigation} from '../lib/pushNotifications';

export default function Layout() {
 const [session,setSession]=useState<{checked:boolean;user:any}>({checked:false,user:null});
 const request=useRef(0);
 const pathname=usePathname();
 useEffect(()=>{
  if(Platform.OS==='web'&&typeof document!=='undefined'){
   document.title='Al-Ameen Mission Academy Memari';
   let iconLink=document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
   if(!iconLink){
    iconLink=document.createElement('link');
    iconLink.rel='icon';
    document.head.appendChild(iconLink);
   }
   iconLink.type='image/png';
   iconLink.href='/favicon.png';
  }
 },[]);
 useEffect(()=>{
  let active=true;
  const verify=async()=>{
   const current=++request.current;
   let user=null;
   try {
    if(await getToken()) {
     const data=await Promise.race([
      api('/api/me'),
      new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Session check timed out')),6000)),
     ]);
     if(data.user?.is_active)user=data.user;
    }
   } catch { /* Verify the session with the server before granting access. */ }
   if(active&&current===request.current)setSession({checked:true,user});
  };
  const unsubscribe=subscribeSession(verify);
  void verify();
  return()=>{active=false;unsubscribe();};
 },[pathname]);
 useEffect(()=>{
  if(!session.user)return;
  void registerPushNotifications().catch(()=>{});
  return subscribeToPushNavigation();
 },[session.user?.id]);
 useEffect(()=>{
  if(!['super_admin','admin','office'].includes(String(session.user?.role||'')))return;
  const timeoutMs=5*60*1000;
  let timer:ReturnType<typeof setTimeout>;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{void clearSession()},timeoutMs)};
  const activity=()=>schedule();
  schedule();
  const events=['mousedown','keydown','touchstart','scroll','pointerdown'];
  if(Platform.OS==='web'&&typeof document!=='undefined')events.forEach(event=>document.addEventListener(event,activity,{passive:true}));
  const appState=AppState.addEventListener('change',state=>{if(state==='active')schedule();else clearTimeout(timer)});
  return()=>{clearTimeout(timer);events.forEach(event=>{if(Platform.OS==='web'&&typeof document!=='undefined')document.removeEventListener(event,activity)});appState.remove()};
 },[session.user?.role]);
 if(!session.checked)return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator size="large" accessibilityLabel="Checking login"/></View>;
 return <Stack screenOptions={{headerShown:false}}>
  <Stack.Screen name="index"/>
  {PRIVATE_ROUTES.map(name=><Stack.Protected key={name} guard={canOpenRoute(name,session.user)}><Stack.Screen name={name}/></Stack.Protected>)}
 </Stack>;
}

export function ErrorBoundary({error}: {error: Error}) {
 return <View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:'#f3f6f9'}}>
  <Text style={{fontSize:20,fontWeight:'800',marginBottom:12}}>Application error</Text>
  <Text selectable style={{textAlign:'center',color:'#b42318'}}>{error?.message || 'The application could not start.'}</Text>
 </View>;
}
