const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');
const vm = require('vm');
let slots = [], cursor = 0, calls = [], selected;
const react = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; }]; },
  useRef: initial => { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; }
};
const result = { student: { registration_no: '123', student_name: 'Test student' }, loans: [{ id: 7, accession_no: 'test-book', title: 'Test' }] };
let rejectLookup = false;
const api = async (path, options) => { calls.push({path, options}); if(rejectLookup) throw Error('Issued book not found'); return options ? {success:true} : result; };
const source = ts.transpileModule(fs.readFileSync('src/components/LibraryLookup.tsx','utf8'), {compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const componentExports = {};
vm.runInNewContext(source, {exports: componentExports, require: name => name === 'react' ? react : name === 'react-native' ? {Text:'Text',View:'View',TextInput:'TextInput',TouchableOpacity:'Button'} : {api}});
const render = () => { cursor=0; return componentExports.default({onStudent: value => {selected=value;}}); };
const find = (tree, type) => tree?.type === type ? tree : tree?.children?.flat(Infinity).map(child => find(child,type)).find(Boolean);
async function enter(tree) { find(tree,'Button').props.onPress(); await new Promise(resolve=>setImmediate(resolve)); }
(async()=>{
 let tree=render(); find(tree,'TextInput').props.onChangeText('test-book'); tree=render(); await enter(tree);
 assert.equal(calls.length,1); assert.match(calls[0].path,/return-book\/test-book$/); assert.equal(selected.student.registration_no,'123');
 tree=render(); assert.equal(find(tree,'Button').children[0].children[0],'Confirm Return (Enter)');
 await enter(tree); assert.equal(calls[1].options.method,'PATCH'); assert.match(calls[1].path,/loans\/7\/return$/);
 tree=render(); assert.equal(find(tree,'TextInput').props.value,''); assert.ok(JSON.stringify(tree).includes('Book returned successfully'));
 rejectLookup=true; find(tree,'TextInput').props.onChangeText('missing-book'); tree=render(); await enter(tree); tree=render(); assert.ok(JSON.stringify(tree).includes('Issued book not found'));
 console.log('PASS: scan lookup, confirmation, return request, reset and visible errors');
})().catch(error=>{console.error(error);process.exitCode=1;});
