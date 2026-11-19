import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Print from 'expo-print';
import AcademyHeader from '../components/AcademyHeader';
import { StudentMenuActions } from '../components/StudentMenu';
import { api } from '../lib/api';
import { AL_AMEEN_ROUND_LOGO_BASE64 } from '../assets/roundLogoBase64';

const safe = (v: any) =>
  String(v ?? '')
    .trim()
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

const formatDate = (v: any) => {
  if (!v) return '';
  const s = String(v).split('T')[0];
  const parts = s.split('-');
  if (parts.length === 3) {
    return `${parts[2]} / ${parts[1]} / ${parts[0]}`;
  }
  return s;
};

export function buildRegistrationFormHtml(student: any = null) {
  const s = student || {};
  const v1 = s.visitor1 || {};
  const v2 = s.visitor2 || {};

  const val = (v: any, hint: string = '') => {
    const text = safe(v);
    if (text) {
      return `<span class="val filled">${text}</span>`;
    }
    if (hint) {
      return `<span class="val"><span class="hint">${safe(hint)}</span></span>`;
    }
    return `<span class="val"></span>`;
  };

  const admDate = formatDate(s.admission_date);
  const dob = formatDate(s.date_of_birth);
  const sessionFrom = s.session_from || (s.session ? String(s.session).split('-')[0] : '');
  const sessionTo = s.session_to || (s.session ? String(s.session).split('-')[1] : '');
  const handicapped = s.is_handicapped !== undefined ? (s.is_handicapped ? 'Yes' : 'No') : (s.handicap || '');
  const orphan = s.is_orphan !== undefined ? (s.is_orphan ? 'Yes' : 'No') : (s.orphan || '');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Student Registration Form</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    margin: 0;
    padding: 0;
    background: #f1f5f9;
    font-family: 'Segoe UI', 'Nirmala UI', Tahoma, Geneva, Verdana, sans-serif;
    color: #111;
  }
  .sheet {
    width: 210mm;
    height: 296.8mm;
    margin: 0 auto;
    padding: 6.5mm 7mm;
    background: #fff;
    position: relative;
    page-break-after: always;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  @media screen {
    .sheet {
      margin: 15px auto;
      box-shadow: 0 4px 15px rgba(0,0,0,0.15);
    }
  }
  .outer-border {
    border: 3px solid #018b01;
    border-radius: 18px;
    padding: 3px;
    width: 100%;
    height: 100%;
    position: relative;
  }
  .inner-border {
    border: 1.5px solid #018b01;
    border-radius: 14px;
    padding: 7px 10px 8px 10px;
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -46%);
    width: 530px;
    height: 530px;
    opacity: 0.08;
    pointer-events: none;
    z-index: 0;
  }

  /* HEADER */
  .header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    margin-bottom: 4px;
  }
  .header-logo {
    width: 58px;
    height: 58px;
    object-fit: contain;
    margin-left: 10px;
  }
  .header-content {
    flex: 1;
    text-align: center;
    margin-right: 68px;
  }
  .school-title {
    font-size: 21px;
    font-weight: 600;
    color: #0b2239;
    margin: 0 0 1px 0;
    letter-spacing: -0.2px;
  }
  .form-title {
    font-size: 18px;
    font-weight: 600;
    color: #0b2239;
    margin: 0 0 2px 0;
  }
  .form-subtitle {
    font-size: 10.5px;
    color: #1a56db;
    margin: 0;
    letter-spacing: 0.1px;
  }
  .rules-title {
    font-size: 14px;
    font-weight: 700;
    color: #111;
    margin: 4px 0 0 0;
    letter-spacing: 0.2px;
  }
  .header-divider {
    border-top: 1px solid #111;
    margin-top: 5px;
  }

  /* BOXES */
  .form-box {
    position: relative;
    z-index: 1;
    border: 1px solid #111;
    margin-bottom: 5px;
    padding: 5px 8px 4px 8px;
  }
  .box-title {
    text-align: center;
    font-size: 11.5px;
    font-weight: 700;
    margin: -2px 0 4px 0;
    color: #111;
  }
  .divider-title {
    text-align: center;
    font-size: 11.5px;
    font-weight: 700;
    margin: 5px 0 4px 0;
    padding-top: 4px;
    border-top: 1px solid #111;
    color: #111;
  }

  /* FIELD ROWS */
  .row {
    display: flex;
    align-items: flex-end;
    margin-bottom: 6px;
    font-size: 11px;
    line-height: 1.15;
  }
  .row:last-child {
    margin-bottom: 2px;
  }
  .f {
    display: flex;
    align-items: flex-end;
    margin-right: 12px;
    position: relative;
  }
  .f:last-child {
    margin-right: 0;
  }
  .lbl {
    font-weight: 700;
    white-space: nowrap;
    margin-right: 5px;
    font-size: 11px;
    color: #111;
  }
  .val {
    flex: 1;
    border-bottom: 1px dotted #444;
    min-height: 15px;
    position: relative;
    font-size: 11px;
    color: #0b192c;
    padding: 0 4px;
    white-space: nowrap;
    overflow: hidden;
  }
  .val.filled {
    font-weight: 600;
    color: #042f2e;
  }
  .hint {
    position: absolute;
    right: 4px;
    bottom: 1px;
    font-size: 10px;
    color: #88929b;
    pointer-events: none;
    font-weight: normal;
  }

  /* DECLARATION & SIGNATURE */
  .declaration-box {
    position: relative;
    z-index: 1;
    border: 1px solid #111;
    padding: 5px 8px;
    margin-bottom: 8px;
    font-size: 10.5px;
    font-weight: 700;
    color: #111;
    line-height: 1.35;
  }
  .sig-row {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: space-between;
    padding: 18px 25px 3px 25px;
  }
  .sig-block {
    width: 235px;
    text-align: center;
  }
  .sig-line {
    border-top: 1.5px solid #111;
    margin-bottom: 4px;
  }
  .sig-text {
    font-size: 11.5px;
    font-weight: 700;
    color: #111;
  }

  /* PAGE 2 RULES */
  .rules-box {
    position: relative;
    z-index: 1;
    background: #dbe4eb;
    border: 1px solid #111;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
  }
  .rules-header {
    background: #212529;
    color: #fff;
    text-align: center;
    font-size: 14.5px;
    font-weight: 700;
    padding: 5px 0;
    border-bottom: 1px solid #111;
    letter-spacing: 0.3px;
  }
  .rules-list {
    padding: 8px 14px 6px 14px;
    font-size: 11px;
    line-height: 1.45;
    color: #111;
  }
  .rule-item {
    padding: 3px 0;
    border-bottom: 1px solid #cbd5e1;
    text-align: justify;
  }
  .rule-item:last-child {
    border-bottom: none;
  }
  .rules-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 18px 8px 18px;
  }
  .accept-badge {
    background: #212529;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 14px;
    border-radius: 4px;
  }
  .rule-sig-block {
    width: 230px;
    text-align: center;
  }
  .rule-sig-line {
    border-top: 1.5px solid #111;
    margin-bottom: 4px;
  }
  .rule-sig-text {
    font-size: 11.5px;
    font-weight: 700;
    color: #111;
  }
</style>
</head>
<body>

<!-- PAGE 1 -->
<div class="sheet">
  <div class="outer-border">
    <div class="inner-border">
      <img src="${AL_AMEEN_ROUND_LOGO_BASE64}" class="watermark" />

      <!-- HEADER -->
      <div class="header">
        <img src="${AL_AMEEN_ROUND_LOGO_BASE64}" class="header-logo" />
        <div class="header-content">
          <h1 class="school-title">Al-Ameen Mission Academy, Memari</h1>
          <h2 class="form-title">Student Registration Form</h2>
          <div class="form-subtitle">( PLEASE FILL UP THIS FORM IN ALL CAPITAL LETTERS AND USE A BLUE PEN )</div>
        </div>
      </div>

      <!-- BOX 1: BASIC DETAILS -->
      <div class="form-box">
        <div class="row">
          <div class="f" style="flex: 3;"><span class="lbl">Student Name</span>${val(s.student_name)}</div>
          <div class="f" style="flex: 1.5;"><span class="lbl">Mission Reg. No.</span>${val(s.registration_no)}</div>
          <div class="f" style="flex: 1;"><span class="lbl">Class</span>${val(s.class_name)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">Gender</span>${val(s.gender)}</div>
          <div class="f" style="flex: 1.5;"><span class="lbl">Admission Date</span>${val(admDate, 'D D / M M / Y Y Y Y')}</div>
          <div class="f" style="flex: 1.5;"><span class="lbl">Date of Birth</span>${val(dob, 'D D / M M / Y Y Y Y')}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.2;"><span class="lbl">Session</span>${val(sessionFrom)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">To</span>${val(sessionTo)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Monthly Fees</span>${val(s.monthly_fees)}</div>
          <div class="f" style="flex: 1.4;"><span class="lbl">Stream</span>${val(s.stream, 'Sc / Arts / Gen')}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.2;"><span class="lbl">WhatsApp No.</span>${val(s.whatsapp_number || s.guardian_mobile || s.mobile_number)}</div>
          <div class="f" style="flex: 1.5;"><span class="lbl">Email ID</span>${val(s.email)}</div>
          <div class="f" style="flex: 1.3;"><span class="lbl">Aadhar No.</span>${val(s.aadhaar_no)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">Blood Group</span>${val(s.blood_group)}</div>
          <div class="f" style="flex: 0.9;"><span class="lbl">Cast</span>${val(s.caste_name)}</div>
          <div class="f" style="flex: 1.4;"><span class="lbl">Prev. Branch</span>${val(s.previous_branch_name, '(If applicable)')}</div>
          <div class="f" style="flex: 1;"><span class="lbl">Handicap (Y/N)</span>${val(handicapped)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 0.9;"><span class="lbl">Orphan (Y/N)</span>${val(orphan)}</div>
          <div class="f" style="flex: 1.3;"><span class="lbl">Who died</span>${val(s.who_died)}</div>
          <div class="f" style="flex: 1.8;"><span class="lbl">Bang. Shiksha ID</span>${val(s.banglarshiksha_id)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">Kanyashree ID</span>${val(s.kanyashree_id)}</div>
          <div class="f" style="flex: 1.5;"><span class="lbl">Kanyashree Status</span>${val(s.kanyashree_status)}</div>
        </div>
      </div>

      <!-- BOX 2: PARENT DETAILS -->
      <div class="form-box">
        <div class="box-title">Parent Details</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Father Name</span>${val(s.father_name)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">F. Aadhar No.</span>${val(s.father_aadhaar_no)}</div>
          <div class="f" style="flex: 1.3;"><span class="lbl">F. Qualification</span>${val(s.father_qualification)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.3;"><span class="lbl">F. Occupation</span>${val(s.father_occupation)}</div>
          <div class="f" style="flex: 1.1;"><span class="lbl">F. Income ₹</span>${val(s.father_annual_income, 'Monthly')}</div>
          <div class="f" style="flex: 1.3;"><span class="lbl">F. Mobile No</span>${val(s.father_mobile || s.guardian_mobile)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Mother Name</span>${val(s.mother_name)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">M. Aadhar No.</span>${val(s.mother_aadhaar_no)}</div>
          <div class="f" style="flex: 1.3;"><span class="lbl">M. Qualification</span>${val(s.mother_qualification)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.3;"><span class="lbl">M. Occupation</span>${val(s.mother_occupation)}</div>
          <div class="f" style="flex: 1.1;"><span class="lbl">M. Income ₹</span>${val(s.mother_annual_income, 'Monthly')}</div>
          <div class="f" style="flex: 1.3;"><span class="lbl">Mo. Mobile No</span>${val(s.mother_mobile || s.alternate_mobile)}</div>
        </div>
      </div>

      <!-- BOX 3: ADDRESS -->
      <div class="form-box">
        <div class="box-title">Present Address</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Vill</span>${val(s.present_village || s.village)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PO</span>${val(s.present_post_office || s.post_office)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PS</span>${val(s.present_police_station || s.police_station)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">PIN</span>${val(s.present_pin_code || s.pin_code)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Block</span>${val(s.present_block)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">District</span>${val(s.present_district || s.district)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Panchayat</span>${val(s.present_panchayat)}</div>
        </div>
        <div class="divider-title">Permanent Address</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Vill</span>${val(s.permanent_village || s.village)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PO</span>${val(s.permanent_post_office || s.post_office)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PS</span>${val(s.permanent_police_station || s.police_station)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">PIN</span>${val(s.permanent_pin_code || s.pin_code)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Block</span>${val(s.permanent_block)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">District</span>${val(s.permanent_district || s.district)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Panchayat</span>${val(s.permanent_panchayat)}</div>
        </div>
      </div>

      <!-- BOX 4: VISITOR DETAILS -->
      <div class="form-box">
        <div class="box-title">Visitor 1 Details (without Father &amp; Mother)</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Name</span>${val(v1.visitor_name)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Relation</span>${val(v1.relation)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Mobile</span>${val(v1.mobile_number)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Village</span>${val(v1.village)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PO</span>${val(v1.post_office)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PS</span>${val(v1.police_station)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">PIN</span>${val(v1.pin_code)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Block</span>${val(v1.block)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">District</span>${val(v1.district)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">State</span>${val(v1.state)}</div>
        </div>
        <div class="divider-title">Visitor 2 Details (without Father &amp; Mother)</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Name</span>${val(v2.visitor_name)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Relation</span>${val(v2.relation)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Mobile</span>${val(v2.mobile_number)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Village</span>${val(v2.village)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PO</span>${val(v2.post_office)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PS</span>${val(v2.police_station)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">PIN</span>${val(v2.pin_code)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Block</span>${val(v2.block)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">District</span>${val(v2.district)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">State</span>${val(v2.state)}</div>
        </div>
      </div>

      <!-- BOX 5: ACCOUNT DETAILS -->
      <div class="form-box">
        <div class="box-title">Account Details</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">A/c No.</span>${val(s.bank_account_no)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">IFSC</span>${val(s.bank_ifsc_code)}</div>
          <div class="f" style="flex: 1.5;"><span class="lbl">Bank Name</span>${val(s.bank_name)}</div>
        </div>
      </div>

      <!-- BOX 6: DECLARATION -->
      <div class="declaration-box">
        * I hereby declare that the information provided above is true to the best of my knowledge. I have read and understood the rules and regulations of the institute and agree to abide by them.
      </div>

      <!-- SIGNATURES -->
      <div class="sig-row">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-text">Father / Mother Signature with Date</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-text">Student Signature with Date</div>
        </div>
      </div>

    </div>
  </div>
</div>

<!-- PAGE 2 -->
<div class="sheet">
  <div class="outer-border">
    <div class="inner-border">
      <img src="${AL_AMEEN_ROUND_LOGO_BASE64}" class="watermark" />

      <!-- HEADER -->
      <div class="header" style="margin-bottom: 8px;">
        <img src="${AL_AMEEN_ROUND_LOGO_BASE64}" class="header-logo" />
        <div class="header-content">
          <h1 class="school-title">Al-Ameen Mission Academy, Memari</h1>
          <div class="rules-title">STUDENT AND GUARDIAN MUST FOLLOW MISSION RULES AND REGULATIONS</div>
          <div class="header-divider"></div>
        </div>
      </div>

      <!-- STUDENT RULES -->
      <div class="rules-box">
        <div class="rules-header">শিক্ষার্থী হিসেবে মেনে চলবো</div>
        <div class="rules-list">
          <div class="rule-item">১) ফজর ওয়াক্ত শেষ হওয়ার আগে ঘুম থেকে উঠবো এবং রাত্রি ১১:৩০ সময় ঘুমোতে যাব তারপর পড়ার আবেদন করবো না।</div>
          <div class="rule-item">২) প্রতিদিন পাঁচ ওয়াক্ত সালাত আদায় করবো, রোজার সময় রোজা এবং তালিমে উপস্থিত থাকবো।</div>
          <div class="rule-item">৩) শিক্ষক, শিক্ষিকা এবং শিক্ষাকর্মীদের সঙ্গে ভদ্র আচরণ করবো এবং তাঁদের নির্দেশ মেনে চলবো।</div>
          <div class="rule-item">৪) মিশনে শালীন পোষাক পড়বো ছেলেদের পোষাক, জিন্স, লেগিন্স, নাইটি (দিনে) ইত্যাদি পরবো না।</div>
          <div class="rule-item">৫) মিশনে পড়াশোনার পরিবেশ নষ্ট করবো না এবং প্রতিদিন পড়া তৈরি করবো।</div>
          <div class="rule-item">৬) অপর কোন অভিভাবকের মোবাইল ব্যবহার করবো না।</div>
          <div class="rule-item">৭) কখনও যদি আমার কাছে মোবাইল ফোন, অবাঞ্ছিত পত্র পত্রিকা বা ইলেকট্রনিক্স দ্রব্য পাওয়া যায় তাহলে মিশন আমাকে বিতারিত করলে তাতে আমার কোনোও আপত্তি থাকবে না।</div>
          <div class="rule-item">৮) মিশনে সিনেমা দেখার অনুরোধ করবো না এবং কোন অনুষ্ঠানে নাচার আবেদন করব না।</div>
          <div class="rule-item">৯) মিশনে আসা বা মিশন থেকে বাড়ি যাওয়ার সময় মিশনের ইউনিফর্ম পড়ে যাতায়াত করব।</div>
          <div class="rule-item">১০) মিশন থেকে দেওয়া খাবার ডাইনিং এ বসে খাব। রুমে নিয়ে যাব না।</div>
          <div class="rule-item">১১) মিশনের সমন্ত নিয়ম মেনে চলবো নিয়ম না মানতে পারলে মিশন থেকে TC নিয়ে চলে যাব।</div>
        </div>
        <div class="rules-bottom">
          <div class="accept-badge">* উপরের সমস্ত নিয়ম মেনে চলব</div>
          <div class="rule-sig-block">
            <div class="rule-sig-line"></div>
            <div class="rule-sig-text">Student Signature with Date</div>
          </div>
        </div>
      </div>

      <!-- GUARDIAN RULES -->
      <div class="rules-box" style="margin-bottom: 4px;">
        <div class="rules-header">অভিভাবক / অভিভাবিকা হিসেবে মেনে চলবো</div>
        <div class="rules-list">
          <div class="rule-item">১) সাক্ষাতের দিন ছাড়া অন্য দিন আমি বা আমার প্রতিনিধি সাক্ষাত করতে আসবো না এবং ছাত্রীদের রুমে যাওয়ার অনুরোধ করবো না। কোনো সময় আমার মোবাইল অন্য কোনো ছাত্রীকে দেবো না অন্যথায় মেয়েকে একমাসের ছুটি নিয়ে বাড়ি যেতে বাধ্য থাকব।</div>
          <div class="rule-item">২) প্রতি মাসের ফীজ সেই মাসের ১০ তারিখের মধ্যে দিয়ে দেবো, না দিলে প্রতিদিন নির্দিষ্ট হারে লেট ফাইন দিতে বাধ্য থাকবো।</div>
          <div class="rule-item">৩) মিশন ছুটি পড়ার আগেরদিন ছুটি নেওয়ার আবেদন জানাবো না এবং রাখতে আসার দিন না আসলে (তা যে কোনো কারণের জন্যই হোক) প্রতিদিন ৩০০/- (তিনশ টাকা) হিসাবে ফাইন সহ ছাত্রীকে মিশনে রেখে যাবো।</div>
          <div class="rule-item">৪) মোবাইল নম্বর বা কোন ডকুমেন্ট পরিবর্তন করলে তা মিশনের অফিসে অবশ্যই জানাবো</div>
          <div class="rule-item">৫) ছাত্রীর চিকিৎসার জন্য মিশন কর্তৃপক্ষ আসতে বললে ছাত্রীকে বাড়ি নিয়ে গিয়ে চিকিৎসা করিয়ে সুস্থ করে রেখে যাবো।</div>
          <div class="rule-item">৬) মিশনে এলে অবশ্যই ভিজিটিং কার্ড নিয়ে আসব।</div>
          <div class="rule-item">৭) অভিভাবকদের কুপন কেটে খেতে হবে, মেয়েদের খাবার খাওয়া যাবেনা।</div>
          <div class="rule-item">৮) মিশনের নিয়ম / পড়াশুনা / থাকা খাওয়া ইত্যাদি পছন্দ না হলে মিশনে এসে T.C এর আবেদন জানাবো। E.Mail, whatsapp এ গ্রহণযোগ্য নয়। আবেদন জানানোর মাস পর্যন্ত মাসিক ফীজ দিতে বাধ্য থাকবো।</div>
        </div>
        <div class="rules-bottom">
          <div class="accept-badge">* উপরের সমস্ত নিয়ম মেনে চলব</div>
          <div class="rule-sig-block">
            <div class="rule-sig-line"></div>
            <div class="rule-sig-text">Guardian Signature with Date</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<script>
  window.onload = function() {
    window.focus();
    window.print();
  };
</script>
</body>
</html>`;
}

export default function StudentRegistrationFormScreen() {
  const [regNo, setRegNo] = useState('');
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadStudent = async () => {
    const q = regNo.trim();
    if (!q) {
      return Alert.alert('Required', 'Please enter a student Registration Number');
    }
    setLoading(true);
    try {
      const list = await api('/api/students?q=' + encodeURIComponent(q));
      const match = (list.students || []).find(
        (x: any) => String(x.registration_no || '').trim().toLowerCase() === q.toLowerCase()
      );
      if (!match) {
        throw new Error('Student not found with Registration No: ' + q);
      }
      const data: any = await api('/api/students/' + match.id);
      setStudent(data.student);
    } catch (err: any) {
      setStudent(null);
      Alert.alert('Student Lookup', err.message || 'Failed to load student');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (targetStudent: any = null) => {
    const html = buildRegistrationFormHtml(targetStudent);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const w = window.open('', '_blank', 'width=1100,height=850');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        return;
      }
    }
    await Print.printAsync({ html });
  };

  const previewHtml = buildRegistrationFormHtml(student);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AcademyHeader />

        {/* TOP TITLE & ACTIONS */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.pageTitle}>Student Registration Form & Rules</Text>
            <Text style={styles.pageSubtitle}>
              ছাত্র/ছাত্রীর ভর্তি ফর্ম এবং নিয়ামাবলী (A4 ২-পেজ প্রিন্ট রেডি)
            </Text>
          </View>
          <View style={styles.topRight}>
            <StudentMenuActions />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/superadmin'))}
            >
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CONTROLS CARD */}
        <View style={styles.controlCard}>
          {/* PRIMARY PRINT BLANK BUTTON */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.printBlankBtn}
              onPress={() => handlePrint(null)}
            >
              <Text style={styles.btnIcon}>🖨️</Text>
              <View>
                <Text style={styles.printBlankBtnText}>Print Blank Registration Form</Text>
                <Text style={styles.printBlankBtnSub}>
                  (২ পাতার ব্ল্যাঙ্ক ফর্ম প্রিন্ট করুন — হাতে লেখার জন্য)
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* OPTIONAL STUDENT LOOKUP */}
          <View style={styles.lookupSection}>
            <Text style={styles.lookupLabel}>
              Optional: ছাত্র/ছাত্রীর তথ্য দিয়ে প্রি-ফিল্ড ফর্ম প্রিন্ট করতে চাইলে রেজিস্ট্রেশন নং দিন:
            </Text>
            <View style={styles.lookupRow}>
              <TextInput
                style={styles.input}
                value={regNo}
                onChangeText={setRegNo}
                onSubmitEditing={loadStudent}
                placeholder="Registration Number (e.g. 2026/001)"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={[styles.btn, styles.loadBtn]}
                onPress={loadStudent}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>🔍 Load Student</Text>
                )}
              </TouchableOpacity>

              {student && (
                <>
                  <TouchableOpacity
                    style={[styles.btn, styles.printFilledBtn]}
                    onPress={() => handlePrint(student)}
                  >
                    <Text style={styles.btnText}>🖨️ Print Filled Form</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.clearBtn]}
                    onPress={() => {
                      setStudent(null);
                      setRegNo('');
                    }}
                  >
                    <Text style={styles.clearBtnText}>✖ Clear</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {student && (
              <View style={styles.studentBadge}>
                <Text style={styles.badgeText}>
                  👤 Loaded: <Text style={{ fontWeight: '800' }}>{student.student_name}</Text> | Reg:{' '}
                  {student.registration_no} | Class: {student.class_name} | Session:{' '}
                  {student.session_from || student.session || '-'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* PREVIEW CONTAINER */}
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>
              📄 Live A4 Print Preview ({student ? 'Filled Form' : 'Blank Form'})
            </Text>
            <TouchableOpacity
              style={styles.quickPrint}
              onPress={() => handlePrint(student)}
            >
              <Text style={styles.quickPrintText}>🖨️ Print Now</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS === 'web' ? (
            <View style={styles.webPreviewWrap}>
              {/* @ts-ignore */}
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: '#64748b',
                  padding: '20px 10px',
                  borderRadius: '8px',
                  overflowX: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </View>
          ) : (
            <View style={styles.mobilePlaceholder}>
              <Text style={{ color: '#475569', fontSize: 14 }}>
                A4 ২-পাতার প্রিন্ট প্রিভিউ ব্রাউজারে উপলব্ধ। মোবাইল থেকে সরাসরি প্রিন্ট করতে উপরের &quot;Print Blank Form&quot; বাটনে চাপুন।
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  closeBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  closeBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  controlCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 14,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  printBlankBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#15803d',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  btnIcon: {
    fontSize: 24,
  },
  printBlankBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  printBlankBtnSub: {
    color: '#dcfce7',
    fontSize: 12,
    fontWeight: '500',
  },
  lookupSection: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
    gap: 8,
  },
  lookupLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  lookupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 14,
    height: 40,
    minWidth: 260,
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
  },
  btn: {
    height: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
  },
  loadBtn: {
    backgroundColor: '#2563eb',
  },
  printFilledBtn: {
    backgroundColor: '#0891b2',
  },
  clearBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  clearBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 13,
  },
  studentBadge: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 13,
    color: '#065f46',
  },
  previewCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  quickPrint: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  quickPrintText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  webPreviewWrap: {
    width: '100%',
    overflowX: 'auto',
  },
  mobilePlaceholder: {
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
});
