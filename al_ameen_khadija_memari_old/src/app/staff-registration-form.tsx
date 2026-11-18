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

export function buildStaffFormHtml(staff: any = null) {
  const t = staff || {};
  const d = t.profile_details || {};
  const edu: any[] = Array.isArray(t.education_details) ? t.education_details : [];

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

  const joiningDate = formatDate(t.joining_date || d.joining_date);
  const dob = formatDate(t.date_of_birth || d.date_of_birth);
  const prevJoinDate = formatDate(d.prev_join_date);

  const qualRows = [1, 2, 3, 4, 5, 6, 7, 8].map(i => {
    const item = edu[i - 1] || {};
    return `<tr>
      <td style="width: 38px;">${i}</td>
      <td style="width: 105px;">${safe(item.qualification || '')}</td>
      <td style="width: 132px;">${safe(item.board_university || '')}</td>
      <td style="width: 132px;">${safe(item.institution || '')}</td>
      <td style="width: 70px;">${safe(item.marks_grade || '')}</td>
      <td style="width: 75px;">${safe(item.passing_year || '')}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Staff Form</title>
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

  /* QUALIFICATION TABLE */
  .qual-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 4px;
    font-size: 11px;
  }
  .qual-table th {
    border: 1px solid #111;
    padding: 4px 3px;
    font-weight: 700;
    text-align: center;
    background: #f8fafc;
    color: #111;
  }
  .qual-table td {
    border: 1px solid #111;
    height: 22px;
    padding: 2px 4px;
    text-align: center;
    color: #111;
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
  .sig-row-single {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: flex-end;
    padding: 14px 25px 2px 25px;
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
  .rules-box-staff {
    position: relative;
    z-index: 1;
    background: #dbe4eb;
    border: 1px solid #111;
    margin-top: 6px;
    display: flex;
    flex-direction: column;
  }
  .rules-header {
    background: #212529;
    color: #fff;
    text-align: center;
    font-size: 14.5px;
    font-weight: 700;
    padding: 6px 0;
    border-bottom: 1px solid #111;
    letter-spacing: 0.3px;
  }
  .rules-list-staff {
    padding: 8px 14px 6px 14px;
    font-size: 10.9px;
    line-height: 1.55;
    color: #111;
  }
  .rule-item-staff {
    padding: 4.8px 0;
    border-bottom: 1px solid #cbd5e1;
    text-align: justify;
  }
  .rule-item-staff:last-child {
    border-bottom: none;
  }
  .rules-bottom-staff {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 18px 14px 18px;
  }
  .accept-badge {
    background: #212529;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 16px;
    border-radius: 4px;
  }
  .rule-sig-block {
    width: 240px;
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
    <div class="inner-border" style="justify-content: space-between;">
      <img src="${AL_AMEEN_ROUND_LOGO_BASE64}" class="watermark" />

      <!-- HEADER -->
      <div class="header">
        <img src="${AL_AMEEN_ROUND_LOGO_BASE64}" class="header-logo" />
        <div class="header-content">
          <h1 class="school-title">Al-Ameen Mission Academy, Memari</h1>
          <h2 class="form-title">Staff Form</h2>
          <div class="form-subtitle">( PLEASE FILL UP THIS FORM IN ALL CAPITAL LETTERS AND USE A BLUE PEN )</div>
        </div>
      </div>

      <!-- BOX 1: BASIC DETAILS -->
      <div class="form-box">
        <div class="row">
          <div class="f" style="flex: 1.2;"><span class="lbl">Employee ID</span>${val(t.staff_id || t.employee_id)}</div>
          <div class="f" style="flex: 2.5;"><span class="lbl">Name</span>${val(t.name)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">Gender</span>${val(t.gender)}</div>
          <div class="f" style="flex: 1.4;"><span class="lbl">Joining Date</span>${val(joiningDate, 'D D / M M / Y Y Y Y')}</div>
          <div class="f" style="flex: 1.4;"><span class="lbl">Date of Birth</span>${val(dob, 'D D / M M / Y Y Y Y')}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">Salary</span>${val(d.salary || t.salary)}</div>
          <div class="f" style="flex: 1.4;"><span class="lbl">WhatsApp No.</span>${val(d.whatsapp || t.whatsapp || t.mobile)}</div>
          <div class="f" style="flex: 1.4;"><span class="lbl">Mobile No</span>${val(t.mobile)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.4;"><span class="lbl">Email ID</span>${val(t.email)}</div>
          <div class="f" style="flex: 1;"><span class="lbl">Blood Group</span>${val(d.blood_group || t.blood_group)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Staff Type</span>${val(d.staff_type || t.staff_type)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Subject</span>${val(t.subject)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.2;"><span class="lbl">Aadhar No.</span>${val(d.aadhaar_no || t.aadhaar_no)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">EPIC No</span>${val(d.voter_no || d.epic_no)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PAN</span>${val(d.pan_no || t.pan_no)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.4;"><span class="lbl">Designation</span>${val(t.designation)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Role</span>${val(d.staff_role || t.role)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Cast</span>${val(d.caste || t.caste)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.8;"><span class="lbl">Prev. Branch</span>${val(d.prev_branch, '(If applicable)')}</div>
          <div class="f" style="flex: 1.4;"><span class="lbl">Prev. Join Date</span>${val(prevJoinDate, 'D D / M M / Y Y Y Y')}</div>
        </div>
      </div>

      <!-- BOX 2: PARENT DETAILS -->
      <div class="form-box">
        <div class="box-title">Parent Details</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Father Name</span>${val(d.father_name)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">F. Occupation</span>${val(d.father_occupation)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">F. Mobile No</span>${val(d.father_mobile)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Mother Name</span>${val(d.mother_name)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">M. Occupation</span>${val(d.mother_occupation)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Mo. Mobile No</span>${val(d.mother_mobile)}</div>
        </div>
      </div>

      <!-- BOX 3: PRESENT ADDRESS -->
      <div class="form-box">
        <div class="box-title">Present Address</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">Vill</span>${val(d.present_village || t.village)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PO</span>${val(d.present_post_office || t.post_office)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">PS</span>${val(d.present_police_station || t.police_station)}</div>
        </div>
        <div class="row">
          <div class="f" style="flex: 1;"><span class="lbl">PIN</span>${val(d.present_pin_code || t.pin_code)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Block</span>${val(d.present_block || t.block)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">District</span>${val(d.present_district || t.district)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">Panchayat</span>${val(d.present_panchayat || t.panchayat)}</div>
        </div>
      </div>

      <!-- BOX 4: ACCOUNT DETAILS -->
      <div class="form-box">
        <div class="box-title">Account Details</div>
        <div class="row">
          <div class="f" style="flex: 1.5;"><span class="lbl">A/c No.</span>${val(d.account_no || t.bank_account_no)}</div>
          <div class="f" style="flex: 1.2;"><span class="lbl">IFSC</span>${val(d.ifsc_code || t.bank_ifsc)}</div>
          <div class="f" style="flex: 1.5;"><span class="lbl">Bank Name</span>${val(d.bank_name || t.bank_name)}</div>
        </div>
      </div>

      <!-- BOX 5: QUALIFICATION DETAILS -->
      <div class="form-box">
        <div class="box-title">Qualification Details</div>
        <table class="qual-table">
          <thead>
            <tr>
              <th style="width: 38px;">SL</th>
              <th style="width: 105px;">Qualification</th>
              <th style="width: 132px;">Board / University</th>
              <th style="width: 132px;">Institution</th>
              <th style="width: 70px;">Marks /<br>Grade</th>
              <th style="width: 75px;">Passing Year</th>
            </tr>
          </thead>
          <tbody>
            ${qualRows}
          </tbody>
        </table>
      </div>

      <!-- BOX 6: DECLARATION -->
      <div class="declaration-box">
        * I hereby declare that the information provided above is true to the best of my knowledge. I have read and understood the rules and regulations of the institute and agree to abide by them.
      </div>

      <!-- SIGNATURE -->
      <div class="sig-row-single">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-text">Staff Signature with Date</div>
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
      <div class="header" style="margin-bottom: 6px;">
        <img src="${AL_AMEEN_ROUND_LOGO_BASE64}" class="header-logo" />
        <div class="header-content">
          <h1 class="school-title">Al-Ameen Mission Academy, Memari</h1>
          <div class="rules-title">Staff MUST FOLLOW MISSION RULES AND REGULATIONS</div>
          <div class="header-divider"></div>
        </div>
      </div>

      <!-- STAFF RULES -->
      <div class="rules-box-staff">
        <div class="rules-header">কর্মী হিসেবে মেনে চলবো</div>
        <div class="rules-list-staff">
          <div class="rule-item-staff">১) ছাত্র-ছাত্রীদের রুমের মধ্যে মোবাইল ব্যবহার করা যাবে না।</div>
          <div class="rule-item-staff">২) মিশন ক্যাম্পাসের মধ্যে কোনরকম নেশাদ্রব্য ব্যবহার করা যাবে না।</div>
          <div class="rule-item-staff">৩) ছাত্র-ছাত্রীদের নিজের মোবাইল ফোন ব্যবহার করতে দেওয়া যাবে না বিশেষ প্রয়োজনে অফিসে পাঠাতে হবে এবং আপনারা অভিভাবকের সঙ্গে কথা বলতে অফিসে ফোন ব্যবহার করবেন।</div>
          <div class="rule-item-staff">৪) বাজার থেকে বা অনলাইন থেকে কোন জিনিস ছাত্র-ছাত্রীদের কিনে এনে দেওয়া যাবে না।</div>
          <div class="rule-item-staff">৫) ছাত্র-ছাত্রীদের নির্দিষ্ট সময়ে ক্লাসে পাঠাতে হবে এবং মিশনের রুটিন অনুযায়ী কাজ আছে কিনা তা লক্ষ্য রাখতে হবে এবং তাদেরকে রুটিন মাফিক চলার জন্য সহযোগিতা উৎসাহিত করতে হবে।।</div>
          <div class="rule-item-staff">৬) ছাত্র-ছাত্রীদের সঙ্গে তাদের একান্ত ব্যক্তিগত ব্যাপার বা আপনাদের একান্ত ব্যক্তিগত ব্যাপার নিয়ে আলোচনা করবেন না।</div>
          <div class="rule-item-staff">৭) ছাত্র-ছাত্রীদের দিয়ে ব্যক্তিগত কাজ করবেন না (মশারি টাঙানো, কাপড় কাচা, খাতা লেখা ইত্যাদি) এবং সকল ছাত্র-ছাত্রীদের সঙ্গে সমব্যবহার করবেন কারোর প্রতি বৈষম্যমূলক আচরণ করবেন না।</div>
          <div class="rule-item-staff">৮) ছাত্র-ছাত্রীদের সঙ্গে বন্ধুত্ব সুলভ আচরণ করবেন কিন্তু কখনো বন্ধু হবেন না।</div>
          <div class="rule-item-staff">৯) প্রয়োজনে ছাত্র-ছাত্রীদের অফিসের ফোন থেকে অভিভাবকদের সঙ্গে ফোন করিয়ে দিতে হবে।</div>
          <div class="rule-item-staff">১০) ক্লাস কোচিং এর খাতা দেখা নির্দিষ্ট সময়ের মধ্যে করতে হবে।</div>
          <div class="rule-item-staff">১১) নির্দিষ্ট ছুটির দিন ছাড়া অন্য দিন ছুটি নিতে হলে আগে অফিসের অনুমতি নিতে হবে বিনা অনুমতিতে ছুটি নিলে দ্বিগুণ ছুটি কাটা হবে।</div>
          <div class="rule-item-staff">১২) ছাত্র-ছাত্রীদের ছুটিতে বাড়ি যাওয়ার পরের দিন শিক্ষক/শিক্ষিকা এবং স্টাফদের বাড়ি যেতে হবে। ছাত্র-ছাত্রী মিশনের আসার আগের দিন আসতে হবে। ওই দুদিন অনুপস্থিত থাকলে প্রতিটির জন্য মোট ছুটির অর্ধেক দিন ছুটি গণ্য করা হবে।</div>
          <div class="rule-item-staff">১৩) সকাল ৬ টার পর মিশন থেকে যাবেন এবং পরের দিন দুপুর ১২ টার মধ্যে আসতে হবে বেলা বারোটার পর একটার আগে এলে Late Marking হবে মাসে দুটি Late Marking এর জন্য একটি ছুটি হিসেবে গণ্য হবে।।</div>
          <div class="rule-item-staff">১৪) প্রার্থনার সময় ছাত্র-ছাত্রীদের সঙ্গে শিক্ষক শিক্ষিকাদের শিক্ষাকর্মীদের উপস্থিত থাকতে হবে।</div>
          <div class="rule-item-staff">১৫) বিশেষ প্রয়োজনে ক্যাম্পাসের বাইরে যেতে হলে যাওয়ার সময় গেটে কারণ ও সময় লিখে সই করে যেতে হবে। সপ্তাহে ১ দিনের বেশি না ও ৩ ঘন্টার মধ্যে ফিরে আসতে হবে।</div>
          <div class="rule-item-staff">১৬) ছাত্র-ছাত্রী অসুস্থ হলে তাদের খেয়াল রাখতে হবে এবং প্রয়োজনে তাদের সঙ্গে ডাক্তারের কাছে যেতে হবে।</div>
          <div class="rule-item-staff">১৭) ছাত্র-ছাত্রীদের দিয়ে রুম পরিষ্কার রাখতে হবে।</div>
          <div class="rule-item-staff">১৮) পরিস্থিতি অনুসারে কর্তৃপক্ষের নির্দেশ পালন করতে হবে।</div>
          <div class="rule-item-staff">১৯) নিজে মিশনের সকল নিয়ম মানলে এবং ছাত্রছাত্রীদের নিয়ে সুন্দরভাবে মিশনের আদর্শ উপযোগী করে তুললে সেক্ষেত্রে কাউকে ইনসেনটিভ দেয়া হবে। (কর্তৃপক্ষ যাদের ভালো বুঝবেন কেবল তাদের জন্য।)</div>
          <div class="rule-item-staff">২০) নিজের ফোন থেকে ছাত্রীদের সঙ্গে কথা বলিয়ে দিলে বা অন্য কারো সঙ্গে যোগাযোগ করিয়ে দিলে বা অনলাইন থেকে বা বাজার থেকে অফিসের অনুমতি ব্যতীত কিছু কিনে দিলে স্যালারির ১০% কেটে নেয়া হবে।</div>
        </div>
        <div class="rules-bottom-staff">
          <div class="accept-badge">* উপরের সমস্ত নিয়ম মেনে চলব</div>
          <div class="rule-sig-block">
            <div class="rule-sig-line"></div>
            <div class="rule-sig-text">Signature with Date</div>
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

export default function StaffRegistrationFormScreen() {
  const [query, setQuery] = useState('');
  const [staff, setStaff] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadStaff = async () => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return Alert.alert('Required', 'Please enter Staff ID or Name to search');
    }
    setLoading(true);
    try {
      const data: any = await api('/api/teachers');
      const teachers: any[] = data.teachers || [];
      const match = teachers.find(
        t =>
          String(t.staff_id || '').toLowerCase() === q ||
          String(t.name || '').toLowerCase().includes(q) ||
          String(t.login_id || '').toLowerCase() === q
      );
      if (!match) {
        throw new Error('Staff not found with ID / Name: ' + query);
      }
      setStaff(match);
    } catch (err: any) {
      setStaff(null);
      Alert.alert('Staff Lookup', err.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (targetStaff: any = null) => {
    const html = buildStaffFormHtml(targetStaff);
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

  const previewHtml = buildStaffFormHtml(staff);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <AcademyHeader />

        {/* TOP TITLE & ACTIONS */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.pageTitle}>Staff Registration Form & Rules</Text>
            <Text style={styles.pageSubtitle}>
              স্টাফদের ফর্ম ও নিয়ামাবলী (A4 ২-পেজ প্রিন্ট রেডি)
            </Text>
          </View>
          <View style={styles.topRight}>
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
                <Text style={styles.printBlankBtnText}>Print Blank Staff Form</Text>
                <Text style={styles.printBlankBtnSub}>
                  (২ পাতার ব্ল্যাঙ্ক ফর্ম প্রিন্ট করুন — হাতে লেখার জন্য)
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* OPTIONAL STAFF LOOKUP */}
          <View style={styles.lookupSection}>
            <Text style={styles.lookupLabel}>
              Optional: কোনো স্টাফের তথ্য দিয়ে প্রি-ফিল্ড ফর্ম প্রিন্ট করতে চাইলে Staff ID বা নাম দিন:
            </Text>
            <View style={styles.lookupRow}>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={loadStaff}
                placeholder="Staff ID or Name (e.g. TCH001 / Sk...)"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={[styles.btn, styles.loadBtn]}
                onPress={loadStaff}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>🔍 Load Staff</Text>
                )}
              </TouchableOpacity>

              {staff && (
                <>
                  <TouchableOpacity
                    style={[styles.btn, styles.printFilledBtn]}
                    onPress={() => handlePrint(staff)}
                  >
                    <Text style={styles.btnText}>🖨️ Print Filled Form</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.clearBtn]}
                    onPress={() => {
                      setStaff(null);
                      setQuery('');
                    }}
                  >
                    <Text style={styles.clearBtnText}>✖ Clear</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {staff && (
              <View style={styles.staffBadge}>
                <Text style={styles.badgeText}>
                  👤 Loaded: <Text style={{ fontWeight: '800' }}>{staff.name}</Text> | Staff ID:{' '}
                  {staff.staff_id || '-'} | Designation: {staff.designation || '-'} | Subject:{' '}
                  {staff.subject || '-'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* PREVIEW CONTAINER */}
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle}>
              📄 Live A4 Print Preview ({staff ? 'Filled Form' : 'Blank Form'})
            </Text>
            <TouchableOpacity
              style={styles.quickPrint}
              onPress={() => handlePrint(staff)}
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
                A4 ২-পাতার প্রিন্ট প্রিভিউ ব্রাউজারে উপলব্ধ। মোবাইল থেকে সরাসরি প্রিন্ট করতে উপরের &quot;Print Blank Staff Form&quot; বাটনে চাপুন।
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
  staffBadge: {
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
