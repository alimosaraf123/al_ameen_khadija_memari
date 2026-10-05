import React, {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Stack,usePathname} from 'expo-router';
import {api} from '../lib/api';
import {getToken,subscribeSession} from '../lib/auth';
import {canOpenRoute,PRIVATE_ROUTES} from '../lib/routeAccess';

export default function Layout() {
 const [session,setSession]=useState<{checked:boolean;user:any}>({checked:false,user:null});
 const request=useRef(0);
 const pathname=usePathname();
 useEffect(()=>{
  let active=true;
  const verify=async()=>{
   const current=++request.current;
   let user=null;
   try {
    if(await getToken()) {
     const data=await api('/api/me');
     if(data.user?.is_active)user=data.user;
    }
   } catch { /* Verify the session with the server before granting access. */ }
   if(active&&current===request.current)setSession({checked:true,user});
  };
  const unsubscribe=subscribeSession(verify);
  void verify();
  return()=>{active=false;unsubscribe();};
 },[pathname]);
 if(!session.checked)return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator size="large" accessibilityLabel="Checking login"/></View>;
 return <Stack screenOptions={{headerShown:false}}>
  <Stack.Screen name="index"/>
  {PRIVATE_ROUTES.map(name=><Stack.Protected key={name} guard={canOpenRoute(name,session.user)}><Stack.Screen name={name}/></Stack.Protected>)}
 </Stack>;
}
