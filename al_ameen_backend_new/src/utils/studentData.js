const studentFields = [
  'registration_no',
  'admission_no',
  'student_name',
  'class_name',
  'roll_no',
  'room_id',
  'date_of_birth',
  'gender',

  'father_name',
  'mother_name',
  'guardian_name',
  'guardian_mobile',
  'alternate_mobile',

  'address',
  'village',
  'post_office',
  'police_station',
  'district',
  'pin_code',

  'admission_date',
  'student_type',
  'photo_url',

  'monthly_fees',
  'mobile_number',
  'whatsapp_number',
  'email',
  'session_from',
  'session_to',

  'aadhaar_no',
  'caste_name',
  'blood_group',
  'admitted_school_name',
  'stream',
  'is_handicapped',
  'is_orphan',
  'previous_branch_name',
  'banglarshiksha_id',
  'kanyashree_id',
  'aikyashree_id',

  'father_aadhaar_no',
  'father_qualification',
  'father_occupation',
  'father_annual_income',
  'father_mobile',

  'mother_aadhaar_no',
  'mother_qualification',
  'mother_occupation',
  'mother_annual_income',
  'mother_mobile',

  'present_village',
  'present_police_station',
  'present_pin_code',
  'present_post_office',
  'present_block',
  'present_district',
  'present_state',

  'permanent_village',
  'permanent_police_station',
  'permanent_pin_code',
  'permanent_post_office',
  'permanent_block',
  'permanent_district',
  'permanent_state',

  'bank_account_no',
  'bank_name',
  'bank_ifsc_code',
  'bank_branch_name',
  'bank_branch_address',

  'is_active',
];

const numericFields = new Set([
  'room_id',
  'monthly_fees',
  'father_annual_income',
  'mother_annual_income',
]);

const booleanFields = new Set([
  'is_handicapped',
  'is_orphan',
  'is_active',
]);

function normalizeValue(field, value) {
  if (value === undefined) {
    return undefined;
  }

  if (booleanFields.has(field)) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === null || value === '') {
      return false;
    }

    const text = String(value).trim().toLowerCase();

    return ['true', '1', 'yes', 'y'].includes(text);
  }

  if (numericFields.has(field)) {
    if (value === null || value === '') {
      return null;
    }

    const num = Number(value);

    return Number.isFinite(num) ? num : null;
  }

  if (value === null) {
    return null;
  }

  const text = String(value).trim();

  return text === '' ? null : text;
}

function prepareBody(body) {
  const b = { ...body };

  // Old fields-এর compatibility রাখার জন্য
  if (
    b.village === undefined &&
    b.present_village !== undefined
  ) {
    b.village = b.present_village;
  }

  if (
    b.post_office === undefined &&
    b.present_post_office !== undefined
  ) {
    b.post_office = b.present_post_office;
  }

  if (
    b.police_station === undefined &&
    b.present_police_station !== undefined
  ) {
    b.police_station = b.present_police_station;
  }

  if (
    b.district === undefined &&
    b.present_district !== undefined
  ) {
    b.district = b.present_district;
  }

  if (
    b.pin_code === undefined &&
    b.present_pin_code !== undefined
  ) {
    b.pin_code = b.present_pin_code;
  }

  return b;
}


module.exports = { studentFields, numericFields, booleanFields, normalizeValue, prepareBody };
