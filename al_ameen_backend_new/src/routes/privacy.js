const express = require('express');
const router = express.Router();

const privacyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Al-Ameen Academy</title>
  <style>
    :root {
      --primary: #0284c7;
      --primary-dark: #0369a1;
      --text: #1e293b;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background-color: var(--bg);
      margin: 0;
      padding: 0;
    }
    header {
      background: linear-gradient(135deg, #0284c7, #0f172a);
      color: white;
      padding: 40px 20px;
      text-align: center;
    }
    header h1 {
      margin: 0 0 10px 0;
      font-size: 2rem;
    }
    header p {
      margin: 0;
      opacity: 0.9;
      font-size: 0.95rem;
    }
    .container {
      max-width: 800px;
      margin: -20px auto 40px auto;
      padding: 0 15px;
    }
    .content-card {
      background: var(--card);
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.05);
      border: 1px solid var(--border);
    }
    h2 {
      color: var(--primary-dark);
      margin-top: 28px;
      margin-bottom: 12px;
      font-size: 1.35rem;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 6px;
    }
    p, li {
      font-size: 1rem;
      color: #334155;
    }
    ul {
      padding-left: 20px;
    }
    li {
      margin-bottom: 8px;
    }
    .contact-box {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 16px 20px;
      margin-top: 24px;
    }
    footer {
      text-align: center;
      padding: 20px;
      font-size: 0.85rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <header>
    <h1>Privacy Policy</h1>
    <p>Al-Ameen Academy / Al-Ameen Khadija Memari</p>
    <p><small>Effective Date: November 10, 2026 | Last Updated: November 10, 2026</small></p>
  </header>

  <div class="container">
    <div class="content-card">
      <p>Welcome to <strong>Al-Ameen Academy</strong> ("we," "our," or "us"). We are committed to protecting the privacy of our students, guardians, educators, and staff. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our mobile application and related educational management services.</p>

      <h2>1. Information We Collect</h2>
      <p>We only collect information necessary to deliver educational services, school administration, and parent-school communication:</p>
      <ul>
        <li><strong>Account Information:</strong> Full name, phone number, email address, and role (e.g., Guardian, Teacher, Administrator).</li>
        <li><strong>Student & Academic Records:</strong> Student admission ID, class, section, attendance records, examination routines, notices, and payment receipts.</li>
        <li><strong>Technical & Device Data:</strong> IP address, device type, operating system version, and application access logs solely used for security monitoring, fraud prevention, and system reliability.</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the collected information solely for legitimate educational and administrative purposes:</p>
      <ul>
        <li>To authenticate and manage access for guardians, students, teachers, and school administrators.</li>
        <li>To notify guardians about student attendance, school announcements, exam routines, and holidays.</li>
        <li>To process and record institutional fee receipts and financial records transparently.</li>
        <li>To maintain system security, detect unauthorized access, and ensure reliable service delivery.</li>
      </ul>

      <h2>3. Advertising & Data Sharing</h2>
      <p><strong>We do NOT display any advertisements within our application.</strong> We do not sell, rent, lease, or commercialize your personal information to third parties, advertisers, or data brokers.</p>

      <h2>4. Data Storage and Security</h2>
      <p>We implement robust administrative, technical, and physical security measures:</p>
      <ul>
        <li><strong>In-Transit Encryption:</strong> All communications between the mobile app and our servers are encrypted using modern Transport Layer Security (TLS/HTTPS).</li>
        <li><strong>Role-Based Access Control:</strong> Only authorized school staff and verified guardians have access to specific student records.</li>
        <li><strong>Encrypted Storage:</strong> Sensitive data and database backups are maintained within secure, certified cloud infrastructure.</li>
      </ul>

      <h2>5. Children's Privacy</h2>
      <p>Our application is an educational tool designed for schools, teachers, and guardians. Any student information is provided and managed under the strict supervision of the school administration and legal guardians. We comply with applicable child privacy protections and do not collect data from children for promotional or advertising purposes.</p>

      <h2>6. Data Retention and Deletion Rights</h2>
      <p>We retain academic and operational records for as long as a student is enrolled or as mandated by educational regulations. Users and guardians have the right to request access to, correction of, or deletion of their personal data. To request data deletion or account removal, please contact the institution administration at the email below.</p>

      <div class="contact-box">
        <h3 style="margin-top: 0; color: #0369a1;">Contact Us</h3>
        <p>If you have any questions, concerns, or requests regarding this Privacy Policy or your data, please contact:</p>
        <p>
          <strong>Al-Ameen Khadija Academy Memari</strong><br>
          Memari, Purba Bardhaman, West Bengal, India<br>
          Email: <a href="mailto:abdul713146@gmail.com">abdul713146@gmail.com</a>
        </p>
      </div>
    </div>
  </div>

  <footer>
    &copy; 2026 Al-Ameen Khadija Academy Memari. All rights reserved.
  </footer>
</body>
</html>`;

router.get(['/', '/privacy', '/privacy-policy'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(privacyHtml);
});

module.exports = router;

