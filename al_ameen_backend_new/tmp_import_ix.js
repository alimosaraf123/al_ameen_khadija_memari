require('dotenv').config();
const fs=require('fs'),pool=require('./src/db');
const data=JSON.parse(fs.readFileSync('D:/memari_soft/ix_marks.json'));
(async()=>{const c=await pool.connect();try{
 await c.query('BEGIN');
 const ex=(await c.query('SELECT id,status,created_by FROM terminal_exams WHERE id=28 FOR UPDATE')).rows[0];
 if(!ex||ex.status==='published') throw Error('Target exam unavailable or published');
 const subs=(await c.query('SELECT tes.id,s.subject_name,tes.theory_marks,tes.mcq_marks,tes.oral_marks FROM terminal_exam_subjects tes JOIN subjects s ON s.id=tes.subject_id WHERE tes.terminal_exam_id=28')).rows;
 const sm=new Map(subs.map(x=>[x.subject_name.toLowerCase(),x])); let count=0;
 for(const row of data){
  const st=(await c.query('SELECT id FROM students WHERE registration_no=$1 AND is_active=TRUE LIMIT 1',[String(row.reg)])).rows[0];
  if(!st) throw Error('Student not found: '+row.reg+' '+row.name);
  for(const [sn,m] of Object.entries(row.marks)){
   const a=sm.get(sn.toLowerCase()); if(!a) throw Error('Subject not found: '+sn);
   const w=m.written,mcq=m.mcq,o=m.oral,all=w===null&&mcq===null&&o===null,total=all?null:(w||0)+(mcq||0)+(o||0);
   if(w!==null&&w>Number(a.theory_marks)||mcq!==null&&mcq>Number(a.mcq_marks)||o!==null&&o>Number(a.oral_marks)) throw Error(row.reg+' '+sn+' exceeds limit');
   await c.query('INSERT INTO terminal_marks(exam_subject_id,student_id,obtained_marks,written_marks,mcq_obtained,oral_obtained,remarks,entered_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(exam_subject_id,student_id) DO UPDATE SET obtained_marks=EXCLUDED.obtained_marks,written_marks=EXCLUDED.written_marks,mcq_obtained=EXCLUDED.mcq_obtained,oral_obtained=EXCLUDED.oral_obtained,remarks=EXCLUDED.remarks,entered_by=EXCLUDED.entered_by',[a.id,st.id,total,w,mcq,o,all?'Absent':null,ex.created_by]); count++;
  }
 }
 await c.query('COMMIT'); console.log(JSON.stringify({students:data.length,marks:count,status:ex.status}));
}catch(e){await c.query('ROLLBACK');console.error(e.message);process.exitCode=1}finally{c.release();await pool.end()}})();
