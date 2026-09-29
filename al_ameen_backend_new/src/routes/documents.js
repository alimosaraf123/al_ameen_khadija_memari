const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const crypto = require('crypto');

const pool = require('../db');
const { auth, allow } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();


// ========================================
// UPLOAD FOLDER
// ========================================

const uploadDir = path.join(
  __dirname,
  '../../uploads'
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}


// ========================================
// MULTER
// ========================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {

    const ext =
      path.extname(file.originalname);

    const filename =
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2) +
      ext;

    cb(null, filename);
  },

});


const upload = multer({

  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {

    const allowed =
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/pdf';

    if (!allowed) {
      return cb(
        new Error(
          'Only image and PDF files are allowed'
        )
      );
    }

    cb(null, true);
  },

});


// ========================================
// HELPER
// ========================================

function getPhysicalPath(fileUrl) {

  if (!fileUrl) {
    return null;
  }

  const filename =
    path.basename(fileUrl);

  return path.join(
    uploadDir,
    filename
  );
}


function removePhysicalFile(fileUrl) {

  try {

    const physicalPath =
      getPhysicalPath(fileUrl);

    if (
      physicalPath &&
      fs.existsSync(physicalPath)
    ) {
      fs.unlinkSync(physicalPath);
    }

  } catch (error) {

    console.error(
      'FILE DELETE ERROR:',
      error
    );

  }
}


// ========================================
// GET STUDENT DOCUMENTS
// Admin / Super Admin only
// ========================================

router.get(
  '/student/:id',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(async (req, res) => {

    const result =
      await pool.query(
        `
        SELECT *
        FROM student_documents
        WHERE student_id=$1
        ORDER BY uploaded_at DESC
        `,
        [req.params.id]
      );

    res.json({
      success: true,
      documents: result.rows,
    });

  })
);


// ========================================
// UPLOAD NEW DOCUMENT
// ========================================

router.post(
  '/student/:id',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  upload.single('file'),

  asyncHandler(async (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        success: false,
        message: 'File required',
      });

    }

    const studentId =
      req.params.id;

    const documentType =
      req.body.document_type ||
      'other';


    // Same type already uploaded?
    const oldDocument =
      await pool.query(
        `
        SELECT id
        FROM student_documents
        WHERE student_id=$1
        AND document_type=$2
        LIMIT 1
        `,
        [
          studentId,
          documentType,
        ]
      );


    if (
      oldDocument.rowCount > 0 &&
      documentType !== 'other'
    ) {

      // Newly uploaded unnecessary file remove
      removePhysicalFile(
        `/uploads/${req.file.filename}`
      );

      return res.status(409).json({
        success: false,
        message:
          'This document already exists. Please use Change / Replace.',
        document_id:
          oldDocument.rows[0].id,
      });

    }


    const fileUrl =
      `/uploads/${req.file.filename}`;


    const result =
      await pool.query(
        `
        INSERT INTO student_documents
        (
          student_id,
          document_type,
          document_title,
          file_url,
          guardian_visible,
          guardian_download_allowed,
          uploaded_by
        )

        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7
        )

        RETURNING *
        `,
        [
          studentId,

          documentType,

          req.body.document_title ||
            req.file.originalname,

          fileUrl,

          req.body.guardian_visible
            !== 'false',

          req.body
            .guardian_download_allowed
            !== 'false',

          req.user.userId,
        ]
      );


    res.status(201).json({
      success: true,
      message:
        'Document uploaded successfully',
      document:
        result.rows[0],
    });

  })
);


// ========================================
// CHANGE / REPLACE FILE
// ========================================

router.post(
  '/:documentId/replace',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  upload.single('file'),

  asyncHandler(async (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        success: false,
        message:
          'Please select a new file',
      });

    }


    const oldResult =
      await pool.query(
        `
        SELECT *
        FROM student_documents
        WHERE id=$1
        `,
        [req.params.documentId]
      );


    if (!oldResult.rowCount) {

      removePhysicalFile(
        `/uploads/${req.file.filename}`
      );

      return res.status(404).json({
        success: false,
        message:
          'Document not found',
      });

    }


    const oldDocument =
      oldResult.rows[0];

    const newFileUrl =
      `/uploads/${req.file.filename}`;


    try {

      const result =
        await pool.query(
          `
          UPDATE student_documents

          SET
            file_url=$1,
            document_title=$2,
            uploaded_by=$3,
            uploaded_at=NOW()

          WHERE id=$4

          RETURNING *
          `,
          [
            newFileUrl,

            req.body.document_title ||
              oldDocument.document_title ||
              req.file.originalname,

            req.user.userId,

            req.params.documentId,
          ]
        );


      // DB update successful হলে
      // old physical file remove
      removePhysicalFile(
        oldDocument.file_url
      );


      res.json({
        success: true,
        message:
          'Document replaced successfully',
        document:
          result.rows[0],
      });


    } catch (error) {

      // DB update fail হলে
      // new file remove
      removePhysicalFile(
        newFileUrl
      );

      throw error;
    }

  })
);


// ========================================
// EDIT DOCUMENT PERMISSION / TITLE
// ========================================

router.put(
  '/:documentId',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(async (req, res) => {

    const current =
      await pool.query(
        `
        SELECT *
        FROM student_documents
        WHERE id=$1
        `,
        [req.params.documentId]
      );


    if (!current.rowCount) {

      return res.status(404).json({
        success: false,
        message:
          'Document not found',
      });

    }


    const old =
      current.rows[0];


    const guardianVisible =
      req.body.guardian_visible ===
        undefined
        ? old.guardian_visible
        : Boolean(
            req.body.guardian_visible
          );


    const guardianDownload =
      req.body
        .guardian_download_allowed ===
        undefined
        ? old.guardian_download_allowed
        : Boolean(
            req.body
              .guardian_download_allowed
          );


    const result =
      await pool.query(
        `
        UPDATE student_documents

        SET
          document_title=$1,
          guardian_visible=$2,
          guardian_download_allowed=$3

        WHERE id=$4

        RETURNING *
        `,
        [
          req.body.document_title ||
            old.document_title,

          guardianVisible,

          guardianDownload,

          req.params.documentId,
        ]
      );


    res.json({
      success: true,
      message:
        'Document settings updated',
      document:
        result.rows[0],
    });

  })
);


// ========================================
// VIEW FILE
// ========================================

router.get(
  '/:documentId/file',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(async (req, res) => {

    const result =
      await pool.query(
        `
        SELECT *
        FROM student_documents
        WHERE id=$1
        `,
        [req.params.documentId]
      );


    if (!result.rowCount) {

      return res.status(404).json({
        success: false,
        message:
          'Document not found',
      });

    }


    const document =
      result.rows[0];

    const physicalPath =
      getPhysicalPath(
        document.file_url
      );


    if (
      !physicalPath ||
      !fs.existsSync(physicalPath)
    ) {

      return res.status(404).json({
        success: false,
        message:
          'Document file not found',
      });

    }


    res.sendFile(
      physicalPath
    );

  })
);


// ========================================
// DOWNLOAD FILE
// ========================================

router.get(
  '/:documentId/download',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(async (req, res) => {

    const result =
      await pool.query(
        `
        SELECT *
        FROM student_documents
        WHERE id=$1
        `,
        [req.params.documentId]
      );


    if (!result.rowCount) {

      return res.status(404).json({
        success: false,
        message:
          'Document not found',
      });

    }


    const document =
      result.rows[0];

    const physicalPath =
      getPhysicalPath(
        document.file_url
      );


    if (
      !physicalPath ||
      !fs.existsSync(physicalPath)
    ) {

      return res.status(404).json({
        success: false,
        message:
          'Document file not found',
      });

    }


    const ext =
      path.extname(
        physicalPath
      );


    const downloadName =
      (
        document.document_title ||
        document.document_type ||
        'document'
      )
        .replace(
          /[\\/:*?"<>|]/g,
          '_'
        ) +
      ext;


    res.download(
      physicalPath,
      downloadName
    );

  })
);


// ========================================
// DELETE DOCUMENT
// ========================================

router.delete(
  '/:documentId',

  auth,

  allow(
    'super_admin',
    'admin'
  ),

  asyncHandler(async (req, res) => {

    const oldResult =
      await pool.query(
        `
        SELECT *
        FROM student_documents
        WHERE id=$1
        `,
        [req.params.documentId]
      );


    if (!oldResult.rowCount) {

      return res.status(404).json({
        success: false,
        message:
          'Document not found',
      });

    }


    const oldDocument =
      oldResult.rows[0];


    await pool.query(
      `
      DELETE FROM student_documents
      WHERE id=$1
      `,
      [req.params.documentId]
    );


    removePhysicalFile(
      oldDocument.file_url
    );


    res.json({
      success: true,
      message:
        'Document deleted successfully',
    });

  })
);



const LEGACY_BASE='https://khadija.al-ameenmission.com/office_working_area/';
const LEGACY_TYPES=[
 ['dob','birth_certificate','Date of Birth Certificate'],['mpAdmit','mp_admit','MP Admit'],['mpMarksheet','mp_marksheet','MP Marksheet'],
 ['aadhar','aadhaar','Aadhaar'],['passbook','bank_passbook','Bank Passbook'],['obc','obc_certificate','OBC Certificate'],
 ['phCertificate','ph_certificate','P.H. Certificate'],['xiRegistration','xi_registration','XI Registration'],
 ['hsAdmit','hs_admit','H.S Admit'],['hsMarksheet','hs_marksheet','H.S Marksheet'],['hsCertificate','hs_certificate','H.S Certificate']
];
function legacyToken(html){const tag=(html.match(/<input[^>]*name=["']csrf_token["'][^>]*>/is)||[])[0]||'';return (tag.match(/value=["']([^"']+)["']/i)||[])[1]||'';}
function legacyCookie(response,current=''){const raw=response.headers.get('set-cookie');return raw?raw.split(';')[0]:current;}
async function legacyRequest(url,options,cookie=''){const headers={...(options?.headers||{})};if(cookie)headers.cookie=cookie;const response=await fetch(new URL(url,LEGACY_BASE),{...options,headers,redirect:'manual'});return{response,cookie:legacyCookie(response,cookie)};}
async function legacyLogin(email,password,forceLogout){
 let cookie='',r=await legacyRequest('index.php',{},cookie);cookie=r.cookie;let html=await r.response.text(),csrf=legacyToken(html);
 const authBody=()=>new URLSearchParams({csrf_token:csrf,u_email:email,u_password:password});
 r=await legacyRequest('auth.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:authBody()},cookie);cookie=r.cookie;let result=JSON.parse(await r.response.text());
 if(result.status==='another_active'&&forceLogout){await legacyRequest('logout_all.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf_token:csrf})},cookie);r=await legacyRequest('index.php',{},cookie);cookie=r.cookie;html=await r.response.text();csrf=legacyToken(html);r=await legacyRequest('auth.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:authBody()},cookie);cookie=r.cookie;result=JSON.parse(await r.response.text());}
 if(result.status!=='success')throw new Error(result.message||'Legacy login failed');return cookie;
}
router.post('/legacy-import',auth,allow('super_admin','admin'),asyncHandler(async(req,res)=>{
 const email=String(req.body?.email||'').trim(),password=String(req.body?.password||''),registration=String(req.body?.registration_no||'').trim(),session=String(req.body?.session||new Date().getFullYear()),className=String(req.body?.class_name||'').trim().toLowerCase();
 if(!email||!password||!registration||!className)return res.status(400).json({success:false,message:'Legacy login, registration, session and class are required'});
 const student=(await pool.query('SELECT id FROM students WHERE LOWER(registration_no)=LOWER($1) LIMIT 1',[registration])).rows[0];if(!student)return res.status(404).json({success:false,message:'Local student not found'});
 const cookie=await legacyLogin(email,password,!!req.body.force_logout_all);let page=await legacyRequest('bulkDocumentDownload.php',{},cookie),html=await page.response.text();const csrf=(html.match(/csrf_token:\s*["']([^"']+)/i)||[])[1];if(!csrf)throw new Error('Legacy document token not found');
 const directory=path.join(uploadDir,'legacy');await fs.promises.mkdir(directory,{recursive:true});let imported=0,skipped=0,missing=0;
 for(const [legacyType,documentType,title] of LEGACY_TYPES){
  const body=new URLSearchParams({session,selectClass:className,selectSex:'all',statselect:'active',selectedValue:legacyType,csrf_token:csrf});
  const listing=await legacyRequest('ajax/bulkDocumentDownload_ajax.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body},cookie),listingHtml=await listing.response.text();
  const paths=[...listingHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);const source=paths.find(v=>v.split('/').includes(registration)||path.basename(v).startsWith(registration+'_'));
  if(!source){missing++;continue}const exists=await pool.query('SELECT 1 FROM student_documents WHERE student_id=$1 AND document_type=$2',[student.id,documentType]);if(exists.rowCount){skipped++;continue}
  const file=await legacyRequest(source,{},cookie);if(!file.response.ok)throw new Error('Could not download '+title);const input=Buffer.from(await file.response.arrayBuffer()),filename=crypto.randomUUID()+'.webp';
  await sharp(input).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path.join(directory,filename));
  await pool.query('INSERT INTO student_documents(student_id,document_type,document_title,file_url,uploaded_by) VALUES($1,$2,$3,$4,$5)',[student.id,documentType,title,'/uploads/legacy/'+filename,req.user.userId]);imported++;
 }
 res.json({success:true,imported,skipped,missing,total:LEGACY_TYPES.length});
}));
module.exports = router;