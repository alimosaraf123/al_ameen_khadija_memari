require('dotenv').config();
const path=require('path');
const express=require('express');
const cors=require('cors');
const pool=require('./src/db');
const {moduleAccess}=require('./src/middleware/moduleAccess');
const {governance}=require('./src/middleware/governance');

const app=express();
const PORT=process.env.PORT||3000;
app.set('trust proxy', 1);
const allowedOrigins=String(process.env.CORS_ORIGINS||'https://al-ameen-khadija.onrender.com,https://al-ameen-khadija-memari.onrender.com,http://localhost:8081,http://127.0.0.1:8081,http://localhost:8082,http://127.0.0.1:8082,http://localhost:8083,http://127.0.0.1:8083').split(',').map(x=>x.trim()).filter(Boolean);
//app.use(cors({origin:(origin,callback)=>{if(!origin||allowedOrigins.includes(origin))return callback(null,true);return callback(new Error('Origin not allowed'));}}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    try {
      if (new URL(origin).hostname.endsWith('.onrender.com')) return callback(null, true);
    } catch {}
    return callback(new Error('Origin not allowed'));
  }
}));
app.disable('x-powered-by');
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});next();});
app.use(express.json({limit:'20mb'}));
app.use(governance);
app.use('/uploads',express.static(path.join(__dirname,'uploads')));
app.get('/uploads/routines/:filename',require('./src/routes/routines').servePublishedImage);

app.get('/',(req,res)=>res.json({success:true,message:'Al-Ameen Backend API is running'}));
app.get('/db-test',require('./src/middleware/auth').auth,require('./src/middleware/auth').allow('super_admin'),async(req,res)=>{try{const r=await pool.query('SELECT NOW() server_time');res.json({success:true,message:'Neon PostgreSQL connection successful',serverTime:r.rows[0].server_time});}catch(e){res.status(500).json({success:false,message:'Database connection failed'});}});

app.use('/api',require('./src/routes/auth'));
app.use('/api/rooms',...moduleAccess('rooms_support',req=>req.method==='GET'&&req.path==='/accessible'),require('./src/routes/rooms'));
app.use('/api/students',...moduleAccess('students'),require('./src/routes/students'));
app.use('/api/student-transfer',...moduleAccess('student_transfer'),require('./src/routes/studentTransfer').createTransferRouter(pool));
app.use('/api/teachers/attendance',...moduleAccess('teachers_support'),require('./src/routes/staffAttendance'));
app.use('/api/teachers',...moduleAccess('teachers_support',req=>(req.method==='GET'&&req.path==='/')||(req.method==='PATCH'&&/^\/\d+\/subjects$/.test(req.path))),require('./src/routes/teachers'));
app.use('/api/guardians',...moduleAccess('guardians',null,req=>req.method==='GET'&&['/fee-payment/open','/fee-receipt/open'].includes(req.path)),require('./src/routes/guardians'));
app.use('/api/attendance',...moduleAccess('attendance'),require('./src/routes/attendance'));
app.use('/api/behavior',...moduleAccess('behavior'),require('./src/routes/behavior'));
app.use('/api/illness',...moduleAccess('illness'),require('./src/routes/illness'));
app.use('/api/problems',...moduleAccess('problems'),require('./src/routes/problems'));
app.use('/api/notices',...moduleAccess('notices'),require('./src/routes/notices'));
app.use('/api/push',require('./src/routes/push'));
app.use('/api/routines',...moduleAccess('routines'),require('./src/routes/routines'));
app.use('/api/gate-passes',...moduleAccess('gate_passes'),require('./src/routes/gatePasses'));
app.use('/api/visits',...moduleAccess('visits'),require('./src/routes/visits'));
app.use('/api/student-lifecycle',...moduleAccess('student_lifecycle'),require('./src/routes/studentLifecycle'));
app.use('/api/system-admin',require('./src/routes/systemAdmin'));
app.use('/api/service-panels',...moduleAccess('service_panels'),require('./src/routes/servicePanels'));
app.use('/api/marks',...moduleAccess('marks'),require('./src/routes/marks'));
app.use('/api/terminal-exams',...moduleAccess('terminal_exams'),require('./src/routes/terminalExams'));
app.use('/api/dues',...moduleAccess('dues'),require('./src/routes/dues'));
app.use('/api/documents',...moduleAccess('documents'),require('./src/routes/documents'));
app.use('/api/assets',...moduleAccess('asset_register'),require('./src/routes/assetRegister'));

app.use((err,req,res,next)=>{console.error(err);if(err.code==='CLOUDINARY_NOT_CONFIGURED')return res.status(503).json({success:false,message:err.message});res.status(err.status||500).json({success:false,message:err.status?err.message:'Server error',error:process.env.NODE_ENV==='development'?err.message:undefined});});

app.listen(PORT,'0.0.0.0',()=>console.log(`Server running on http://localhost:${PORT}`));
