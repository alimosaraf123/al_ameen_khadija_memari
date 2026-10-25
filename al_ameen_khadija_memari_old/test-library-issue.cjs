const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/app/library.tsx','utf8');
const handlers=source.slice(source.indexOf('const issue=async('),source.indexOf('const returned='));
let calls=[],message='',fail=false,focus=0;
const scope={data:{student:{id:12}},bookId:'',bookSearch:'',dueDate:'2026-11-08',scanValue:{current:'aam00475'},issueLock:{current:false},bookInput:{current:{focus(){focus++}}},setBookMessage:v=>message=v,setBookId(){},setBookSearch(){},setSelectedBook(){},loadBooks:async()=>{},student:async()=>{},loadStatus:async()=>{},api:async(path,options)=>{calls.push({path,options});if(fail)throw Error('This book already issued.');return options?{success:true}:{book:{id:42}}}};
vm.createContext(scope);
vm.runInContext(ts.transpileModule(handlers+';globalThis.scanAndIssue=scanAndIssue;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,scope);
(async()=>{
 await Promise.all([scope.scanAndIssue(),scope.scanAndIssue()]);
 assert.equal(calls.length,2);assert.match(calls[0].path,/book\/aam00475$/);
 assert.equal(calls[1].options.method,'POST');assert.equal(JSON.parse(calls[1].options.body).book_id,42);assert.equal(JSON.parse(calls[1].options.body).student_id,12);
 assert.equal(message,'Book issued successfully.');assert.equal(focus,1);
 calls=[];fail=true;scope.scanValue.current='aam00475';await scope.scanAndIssue();assert.equal(calls.length,1);assert.equal(message,'This book already issued.');
 console.log('PASS: scan + Enter issues once for selected student; unavailable book does not issue');
})().catch(e=>{console.error(e);process.exitCode=1});
