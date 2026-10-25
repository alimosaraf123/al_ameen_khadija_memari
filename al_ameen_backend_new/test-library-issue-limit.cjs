const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const s=fs.readFileSync('src/routes/servicePanels.js','utf8');
const route=s.slice(s.indexOf("router.post('/library/issue'"),s.indexOf("router.patch('/library/loans"));
let handler, active=0, calls=[];
const client={release(){},async query(sql){calls.push(sql);if(sql.startsWith('SELECT id FROM students'))return {rows:[{id:1}]};if(sql.startsWith('SELECT COUNT'))return {rows:[{count:String(active)}]};if(sql.startsWith('SELECT * FROM library_books'))return {rows:[{id:10,available_copies:1}]};return {rows:[]};}};
vm.runInNewContext(route,{router:{post(...args){handler=args.at(-1)}},auth(){},allow:()=>()=>{},asyncHandler:f=>f,schemaReady:Promise.resolve(),pool:{connect:async()=>client}});
async function attempt(count){active=count;calls=[];let status=200,body;const res={status(n){status=n;return this},json(v){body=v;return this}};await handler({body:{book_id:10,student_id:1,due_date:'2026-11-08'},user:{userId:1}},res);return {status,body};}
(async()=>{
 for(const count of [0,1]){assert.equal((await attempt(count)).status,201);assert.ok(calls.includes('COMMIT'));assert.ok(calls.indexOf('SELECT id FROM students WHERE id=$1 FOR UPDATE')<calls.findIndex(q=>q.startsWith('SELECT COUNT')));}
 for(const count of [2,3]){const r=await attempt(count);assert.equal(r.status,409);assert.match(r.body.message,/already has 2 issued books/);assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.some(q=>q.startsWith('INSERT')));}
 assert.equal((await attempt(1)).status,201);
 console.log('PASS: 0/1 active loans allowed; 2+ blocked without insert; after return allowed; student locked before count');
})().catch(e=>{console.error(e);process.exitCode=1});
