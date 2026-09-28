const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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


module.exports = router;