require('dotenv').config();
const path=require('path');
const express=require('express');
const cors=require('cors');
const pool=require('./src/db');

const app=express();
const PORT=process.env.PORT||3000;
app.use(cors());
app.use(express.json({limit:'2mb'}));
app.use('/uploads',express.static(path.join(__dirname,'uploads')));

app.get('/',(req,res)=>res.json({success:true,message:'Al-Ameen Backend API is running'}));
app.get('/db-test',async(req,res)=>{try{const r=await pool.query('SELECT NOW() server_time');res.json({success:true,message:'Neon PostgreSQL connection successful',serverTime:r.rows[0].server_time});}catch(e){res.status(500).json({success:false,message:'Database connection failed',error:e.message});}});

app.use('/api',require('./src/routes/auth'));
app.use('/api/rooms',require('./src/routes/rooms'));
app.use('/api/students',require('./src/routes/students'));
app.use('/api/student-transfer',require('./src/routes/studentTransfer').createTransferRouter(pool));
app.use('/api/teachers',require('./src/routes/teachers'));
app.use('/api/guardians',require('./src/routes/guardians'));
app.use('/api/attendance',require('./src/routes/attendance'));
app.use('/api/behavior',require('./src/routes/behavior'));
app.use('/api/illness',require('./src/routes/illness'));
app.use('/api/problems',require('./src/routes/problems'));
app.use('/api/notices',require('./src/routes/notices'));
app.use('/api/routines',require('./src/routes/routines'));
app.use('/api/gate-passes',require('./src/routes/gatePasses'));
app.use('/api/visits',require('./src/routes/visits'));
app.use('/api/student-lifecycle',require('./src/routes/studentLifecycle'));
app.use('/api/service-panels',require('./src/routes/servicePanels'));
app.use('/api/marks',require('./src/routes/marks'));
app.use('/api/terminal-exams',require('./src/routes/terminalExams'));
app.use('/api/dues',require('./src/routes/dues'));
app.use('/api/documents',require('./src/routes/documents'));

app.use((err,req,res,next)=>{console.error(err);if(err.code==='CLOUDINARY_NOT_CONFIGURED')return res.status(503).json({success:false,message:err.message});res.status(err.status||500).json({success:false,message:err.status?err.message:'Server error',error:process.env.NODE_ENV==='development'?err.message:undefined});});

app.listen(PORT,'0.0.0.0',()=>console.log(`Server running on http://localhost:${PORT}`));
