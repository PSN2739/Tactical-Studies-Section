/**
 * Google Apps Script backend for the Tactical Studies Section registration form.
 *
 * The script must be bound to the spreadsheet that contains the Data sheet.
 * Deploy it as a Web app with "Execute as: Me" and "Who has access: Anyone".
 */

const CONFIG = {
  spreadsheetId: '1Ul3s6_bxWazZA_8o1pW2q8z-hoRnxzYm9WWOSMLfVKw',
  sourceSheetName: 'Data',
  registrationSheetName: 'Registration',
  attendanceSheetName: 'Attendance',
  teacherApplicationsSheetName: 'TeacherApplications',
  teachersSheetName: 'Teachers',
  quizIndexSheetName: 'Quizzes',
  quizSheetPrefix: 'Quiz_',
  specialAssessmentIndexSheetName: 'SpecialAssessments',
  announcementsSheetName: 'Announcements',
  announcementHeaders: [
    'announcement_id', 'title', 'start_at', 'end_at', 'content', 'icon', 'created_at', 'created_by'
  ],
  legacyAssessmentOwners: {
    'รบด้วยวิธีรุก-ตีกลางวัน': 'onnicha2739@gmail.com'
  },
  announcementGalleryFolderId: '1mYtAuD15F6zD9TD-dzFAUsm4GZ7KBunQ',
  approvalEmail: 'nu2739@gmail.com',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbwc8GrsggUQenFkeH5wYfHPzkPDFJ0XhtHAKts27axlNDhWaYbBIhocXobu5XkNV0YN/exec',
  lookupIdColumn: 3,
  studentIdLength: 13,
  registrationHeaders: [
    'registration_id',
    'registered_at',
    'lookup_id',
    'data_column_a',
    'data_column_b',
    'data_column_c',
    'data_column_d',
    'email',
    'episode',
    'form_name'
  ],
  dataRegistrationHeaders: [
    'registration_email',
    'registration_id',
    'registration_episode',
    'registration_registered_at'
  ],
  dataAttendanceHeaders: [
    'registered_at',
    'form_name',
    'attendance_form_name'
  ],
  attendanceSubjects: [
    'รูปขบวน หมู่ ปล.',
    'แบบฝึกทำการรบ',
    'MOUT',
    'ตั้งรับ',
    'ระเบียบนำหน่วย คำสั่งฯ',
    'รบด้วยวิธีรุก-ตีกลางวัน',
    'ป้อมสนาม',
    'ถอนตัว',
    'เครื่องกีดขวาง',
    'รบด้วยวิธีรุก-ตีกลางคืน',
    'Unit School',
    'Drone Tactical'
  ]
};

const LEARNING_SUMMARY_VERSION = '5';
const QUIZ_ATTEMPT_START_TTL_SECONDS = 21600;
const QUIZ_ATTEMPT_SESSION_PROPERTY_PREFIX = 'QUIZ_ATTEMPT_SESSION_';
const QUIZ_ATTEMPT_SESSION_CLEANUP_CACHE_KEY = 'quiz-attempt-session-cleanup';

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (String(params.action || '').toLowerCase() === 'quiz-list') {
      return listQuizzes_();
    }
    if (String(params.action || '').toLowerCase() === 'special-assessment-list') {
      return listSpecialAssessments_();
    }
    if (String(params.action || '').toLowerCase() === 'announcement-gallery') {
      return listAnnouncementGalleryImages_();
    }
    if (String(params.action || '').toLowerCase() === 'announcements') {
      return listAnnouncements_();
    }
    if (String(params.action || '').toLowerCase() === 'get-quiz') {
      return getQuiz_(
        params.quizId || '',
        params.studentId || '',
        params.phase || 'pre-test',
        params.title || '',
        params.locationLatitude || '',
        params.locationLongitude || ''
      );
    }
    if (String(params.action || '').toLowerCase() === 'approve-teacher') {
      return approveTeacherByToken_(params.token || '');
    }
    if (String(params.action || '').toLowerCase() === 'attendance-lookup') {
      return lookupAttendance_(params.registrationId || '');
    }
    if (String(params.action || '').toLowerCase() === 'lookup') {
      return lookupStudent_(params.lookupId || params.studentId || '');
    }
    return jsonResponse_({
      ok: true,
      message: 'Tactical Studies Section API is running.'
    });
  } catch (error) {
    return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
  }
}

function doPost(e) {
  const data = (e && e.parameter) || {};
  const formName = normalizeValue_(data.formName);
  if (formName === 'teacher-login') {
    try {
      return teacherLogin_(data);
    } catch (error) {
      return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
    }
  }
  if (formName === 'attendance-student-login') {
    try {
      return attendanceStudentLogin_(data);
    } catch (error) {
      return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
    }
  }
  if (formName === 'teacher-dashboard') {
    try {
      return getTeacherDashboard_(data.token);
    } catch (error) {
      return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
    }
  }
  if (formName === 'teacher-attitude-lookup' || formName === 'teacher-attitude-lookup-many') {
    try {
      if (!getActiveTeacherEmail_(data.token)) {
        return jsonResponse_({ ok: false, message: 'กรุณาเข้าสู่ระบบครูใหม่' });
      }
      return formName === 'teacher-attitude-lookup-many'
        ? lookupAttitudeScores_(data.lookupIds)
        : lookupAttitudeScore_(data.lookupId);
    } catch (error) {
      return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
    }
  }
  if (formName === 'tactical-score-student-lookup-many' || formName === 'special-assessment-student-lookup-many') {
    try {
      return lookupScoreStudents_(formName, data);
    } catch (error) {
      return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
    }
  }

  if ([
    'teacher-attitude-save',
    'teacher-attitude-save-many',
    'submit-quiz',
    'submit-tactical-scores',
    'submit-special-assessment',
    'attendance-registration'
  ].indexOf(formName) >= 0) {
    try {
      ensureLearningSummaryInitialized_();
    } catch (error) {
      return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
    }
  }

  const lock = LockService.getScriptLock();
  let locked = false;

  try {
    lock.waitLock(30000);
    locked = true;
    const lookupId = normalizeValue_(data.lookupId);
    const registrationId = normalizeValue_(data.registrationId);
    const email = normalizeValue_(data.email);
    const episode = normalizeValue_(data.episode);

    if (formName === 'teacher-attitude-save' || formName === 'teacher-attitude-save-many') {
      if (!getActiveTeacherEmail_(data.token)) {
        return jsonResponse_({ ok: false, message: 'กรุณาเข้าสู่ระบบครูใหม่' });
      }
      return formName === 'teacher-attitude-save-many'
        ? saveAttitudeScores_(data)
        : saveAttitudeScore_(data);
    }
    if (formName === 'teacher-application') {
      return submitTeacherApplication_(data);
    }
    if (formName === 'teacher-login') {
      return teacherLogin_(data);
    }
    if (formName === 'create-announcement') {
      return createAnnouncement_(data);
    }
    if (formName === 'create-quiz') {
      return createQuiz_(data);
    }
    if (formName === 'begin-quiz') {
      return beginQuizAttempt_(data);
    }
    if (formName === 'submit-quiz') {
      return submitQuiz_(data);
    }
    if (formName === 'validate-score-code') {
      return validateTacticalScoreCode_(data.accessCode);
    }
    if (formName === 'submit-tactical-scores') {
      return submitTacticalScores_(data);
    }
    if (formName === 'create-special-assessment') {
      return createSpecialAssessment_(data);
    }
    if (formName === 'validate-special-assessment-code') {
      return validateSpecialAssessmentCode_(data);
    }
    if (formName === 'submit-special-assessment') {
      return submitSpecialAssessment_(data);
    }

    if (formName === 'attendance-registration') {
      return saveAttendance_(data);
    }

    if (!/^\d{4}$/.test(lookupId)) {
      return jsonResponse_({
        ok: false,
        message: 'ก่อนบันทึก กรุณาระบุเลขที่ให้ครบ 4 หลัก'
      });
    }

    const student = findStudentRecord_(lookupId);
    if (!student) {
      return jsonResponse_({
        ok: false,
        message: 'ไม่พบหมายเลขประจำตัวในชีต Data'
      });
    }
    if (student.ambiguous) {
      return jsonResponse_({
        ok: false,
        message: 'พบเลขค้นหานี้ซ้ำในชีต Data กรุณาแจ้งผู้ดูแลตรวจสอบก่อนลงทะเบียน'
      });
    }

    const spreadsheet = getRegistrationSpreadsheet_();
    const dataSheet = getSourceSheet_();
    const dataColumns = ensureDataRegistrationColumns_(dataSheet);
    const registrationRange = dataSheet.getRange(
      student.rowNumber,
      dataColumns.email,
      1,
      dataColumns.registeredAt - dataColumns.email + 1
    );
    const existingRegistration = registrationRange.getDisplayValues()[0];
    const registrationFormulas = registrationRange.getFormulas()[0];
    if (existingRegistration.some((value) => normalizeValue_(value) !== '')
      || registrationFormulas.some(Boolean)) {
      return jsonResponse_({
        ok: false,
        code: 'DUPLICATE_REGISTRATION',
        message: 'ท่านได้ลงทะเบียนแล้ว'
      });
    }

    if (!/^\d{13}$/.test(registrationId)) {
      return jsonResponse_({
        ok: false,
        message: 'กรุณาระบุหมายเลขประจำตัวให้ครบ 13 หลัก'
      });
    }

    if (!isValidEmail_(email)) {
      return jsonResponse_({
        ok: false,
        message: 'กรุณาระบุอีเมลให้ถูกต้อง'
      });
    }

    const validEpisodes = [];
    for (let episodeNumber = 1; episodeNumber <= 18; episodeNumber += 1) {
      validEpisodes.push('ตอนที่ ' + episodeNumber);
    }
    if (validEpisodes.indexOf(episode) === -1) {
      return jsonResponse_({
        ok: false,
        message: 'กรุณาเลือกตอนที่ 1-18'
      });
    }

    const registrationSheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
    const dataDuplicates = findDataRegistrationDuplicates_(dataSheet, dataColumns, email, registrationId);
    const legacyDuplicates = findRegistrationDuplicates_(registrationSheet, email, registrationId);
    const duplicates = {
      email: dataDuplicates.email || legacyDuplicates.email,
      registrationId: dataDuplicates.registrationId || legacyDuplicates.registrationId
    };
    if (duplicates.email || duplicates.registrationId) {
      const duplicateFields = [];
      if (duplicates.email) duplicateFields.push('อีเมลนี้');
      if (duplicates.registrationId) duplicateFields.push('เลขประจำตัว 13 หลักนี้');
      return jsonResponse_({
        ok: false,
        code: 'DUPLICATE_REGISTRATION',
        message: duplicateFields.join('และ') + 'ลงทะเบียนแล้ว'
      });
    }

    const registeredAt = new Date();
    writeDataRegistrationFields_(dataSheet, student.rowNumber, dataColumns, [
      email, registrationId, episode, registeredAt
    ]);

    return jsonResponse_({
      ok: true,
      registrationId: registrationId,
      message: 'บันทึกข้อมูลเรียบร้อยแล้ว'
    });
  } catch (error) {
    return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
  } finally {
    if (locked) lock.releaseLock();
  }

}

function submitTeacherApplication_(data) {
  const name = normalizeValue_(data.teacherName);
  const email = normalizeValue_(data.email).toLowerCase();
  const password = normalizeValue_(data.password);
  if (!name || !isValidEmail_(email) || password.length < 8) {
    return jsonResponse_({ ok: false, message: 'กรุณากรอกชื่อ อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษร' });
  }

  const spreadsheet = getRegistrationSpreadsheet_();
  const sheet = getOrCreateSheet_(spreadsheet, CONFIG.teacherApplicationsSheetName, [
    'application_id', 'submitted_at', 'teacher_name', 'email', 'password_hash', 'status', 'approval_token'
  ]);
  ensureSheetColumns_(sheet, 7);
  const existing = sheet.getDataRange().getDisplayValues().slice(1);
  if (existing.some((row) => normalizeValue_(row[3]).toLowerCase() === email
    && normalizeValue_(row[5]).toUpperCase() === 'PENDING')) {
    return jsonResponse_({ ok: false, message: 'อีเมลนี้มีคำขอรออนุมัติอยู่แล้ว' });
  }

  const applicationId = 'T' + String(Date.now());
  const approvalToken = Utilities.getUuid();
  sheet.appendRow([applicationId, new Date(), name, email, hashPassword_(password), 'PENDING', approvalToken]);
  try {
    const approvalUrl = CONFIG.webAppUrl + '?action=approve-teacher&token=' + encodeURIComponent(approvalToken);
    const emailBody = `มีคำขอสมัครครูใหม่\nรหัส: ${applicationId}\nชื่อ: ${name}\nอีเมล: ${email}\n\nกดลิงก์นี้เพื่ออนุมัติ:\n${approvalUrl}`;
    MailApp.sendEmail(CONFIG.approvalEmail, 'มีคำขอสมัครครูใหม่',
      emailBody, { htmlBody: buildApprovalEmailHtml_(applicationId, name, email, approvalUrl) });
  } catch (error) {
    throw new Error('บันทึกคำขอแล้ว แต่ส่งอีเมลอนุมัติไม่ได้ กรุณาอนุญาตสิทธิ์ MailApp ใน Apps Script');
  }
  return jsonResponse_({ ok: true, message: 'ส่งคำขอแล้ว กรุณารอการอนุมัติทางอีเมล' });
}

function approveTeacherByToken_(token) {
  const normalizedToken = normalizeValue_(token);
  if (!normalizedToken) return jsonResponse_({ ok: false, message: 'ไม่พบรหัสอนุมัติ' });
  const spreadsheet = getRegistrationSpreadsheet_();
  const applications = getOrCreateSheet_(spreadsheet, CONFIG.teacherApplicationsSheetName, [
    'application_id', 'submitted_at', 'teacher_name', 'email', 'password_hash', 'status', 'approval_token'
  ]);
  ensureSheetColumns_(applications, 7);
  const rows = applications.getDataRange().getValues();
  for (let index = 1; index < rows.length; index += 1) {
    if (normalizeValue_(rows[index][6]) !== normalizedToken) continue;
    if (normalizeValue_(rows[index][5]).toUpperCase() === 'APPROVED') {
      return jsonResponse_({ ok: true, message: 'บัญชีนี้อนุมัติแล้ว' });
    }
    rows[index][5] = 'APPROVED';
    applications.getRange(index + 1, 1, 1, rows[index].length).setValues([rows[index]]);
    const teachers = getOrCreateSheet_(spreadsheet, CONFIG.teachersSheetName, [
      'teacher_id', 'approved_at', 'teacher_name', 'email', 'password_hash', 'status'
    ]);
    teachers.appendRow([rows[index][0], new Date(), rows[index][2], rows[index][3], rows[index][4], 'ACTIVE']);
    return jsonResponse_({ ok: true, message: 'อนุมัติครูเรียบร้อยแล้ว' });
  }
  return jsonResponse_({ ok: false, message: 'ลิงก์อนุมัติไม่ถูกต้องหรือหมดอายุ' });
}

function approveTeacher(applicationId) {
  const requestedId = normalizeValue_(applicationId);
  if (!requestedId) {
    throw new Error('กรุณาระบุรหัสคำขอ เช่น approveTeacher("T175...") หรือใช้ listPendingTeacherApplications()');
  }
  const spreadsheet = getRegistrationSpreadsheet_();
  const applications = getOrCreateSheet_(spreadsheet, CONFIG.teacherApplicationsSheetName, [
    'application_id', 'submitted_at', 'teacher_name', 'email', 'password_hash', 'status', 'approval_token'
  ]);
  const rows = applications.getDataRange().getDisplayValues();
  for (let index = 1; index < rows.length; index += 1) {
    if (normalizeValue_(rows[index][0]) !== requestedId) continue;
    if (normalizeValue_(rows[index][5]).toUpperCase() === 'APPROVED') {
      return 'Teacher already approved: ' + requestedId;
    }
    rows[index][5] = 'APPROVED';
    applications.getRange(index + 1, 1, 1, rows[index].length).setValues([rows[index]]);
    const teachers = getOrCreateSheet_(spreadsheet, CONFIG.teachersSheetName, [
      'teacher_id', 'approved_at', 'teacher_name', 'email', 'password_hash', 'status'
    ]);
    teachers.appendRow([rows[index][0], new Date(), rows[index][2], rows[index][3], rows[index][4], 'ACTIVE']);
    return 'Teacher approved: ' + requestedId;
  }
  const pendingIds = rows.slice(1)
    .filter((row) => normalizeValue_(row[5]).toUpperCase() === 'PENDING')
    .map((row) => normalizeValue_(row[0]))
    .filter(Boolean);
  throw new Error('ไม่พบคำขอสมัครครูรหัส ' + requestedId
    + (pendingIds.length ? '. รหัสที่รออนุมัติ: ' + pendingIds.join(', ') : '. ยังไม่มีคำขอที่มีสถานะ PENDING'));
}

function listPendingTeacherApplications() {
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), CONFIG.teacherApplicationsSheetName, [
    'application_id', 'submitted_at', 'teacher_name', 'email', 'password_hash', 'status', 'approval_token'
  ]);
  return sheet.getDataRange().getDisplayValues().slice(1)
    .filter((row) => normalizeValue_(row[5]).toUpperCase() === 'PENDING')
    .map((row) => ({ applicationId: row[0], teacherName: row[2], email: row[3] }));
}

function approveTeacherByEmail(email) {
  const requestedEmail = normalizeValue_(email).toLowerCase();
  if (!isValidEmail_(requestedEmail)) throw new Error('กรุณาระบุอีเมลให้ถูกต้อง');
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), CONFIG.teacherApplicationsSheetName, [
    'application_id', 'submitted_at', 'teacher_name', 'email', 'password_hash', 'status', 'approval_token'
  ]);
  const rows = sheet.getDataRange().getDisplayValues();
  const match = rows.slice(1).find((row) => row[3].toLowerCase() === requestedEmail
    && normalizeValue_(row[5]).toUpperCase() === 'PENDING');
  if (!match) throw new Error('ไม่พบคำขอ PENDING ของอีเมล ' + requestedEmail);
  return approveTeacher(match[0]);
}

function teacherLogin_(data) {
  const email = normalizeValue_(data.email).toLowerCase();
  const password = normalizeValue_(data.password);
  const sheet = getRegistrationSpreadsheet_().getSheetByName(CONFIG.teachersSheetName);
  if (!sheet) return jsonResponse_({ ok: false, message: 'ยังไม่มีข้อมูลบัญชีครูในระบบ' });
  const rows = sheet.getDataRange().getDisplayValues();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row[3].toLowerCase() !== email || row[4] !== hashPassword_(password) || row[5] !== 'ACTIVE') continue;
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put('teacher:' + token, email, 21600);
    return jsonResponse_({ ok: true, token: token, teacherName: row[2] });
  }
  return jsonResponse_({ ok: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้รับอนุมัติ' });
}

function getActiveTeacherEmail_(token) {
  const email = CacheService.getScriptCache().get('teacher:' + normalizeValue_(token));
  if (!email) return '';
  const teachersSheet = getRegistrationSpreadsheet_().getSheetByName(CONFIG.teachersSheetName);
  if (!teachersSheet || teachersSheet.getLastRow() < 2) return '';
  const isActive = teachersSheet.getRange(2, 4, teachersSheet.getLastRow() - 1, 3)
    .getDisplayValues()
    .some((row) => normalizeValue_(row[0]).toLowerCase() === email.toLowerCase()
      && normalizeValue_(row[2]).toUpperCase() === 'ACTIVE');
  return isActive ? email : '';
}

function findAttitudeRecord_(sheet, lookupId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, 8).getDisplayValues();
  const matches = [];
  rows.forEach((row, index) => {
    if (normalizeLookupId_(row[0]) === lookupId) {
      matches.push({ rowNumber: index + 2, values: row });
    }
  });
  if (matches.length > 1) throw new Error('ชีตเจตคติมีเลขที่กองพันซ้ำ กรุณาตรวจสอบข้อมูล');
  return matches[0] || null;
}

function lookupAttitudeScore_(value) {
  const lookupId = normalizeLookupId_(value);
  if (!/^\d{4}$/.test(lookupId)) {
    return jsonResponse_({ ok: false, message: 'กรุณากรอกเลขที่กองพันให้ครบ 4 หลัก' });
  }
  const sheet = getRegistrationSpreadsheet_().getSheetByName('เจตคติ');
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบชีตเจตคติ' });
  const record = findAttitudeRecord_(sheet, lookupId);
  if (!record) return jsonResponse_({ ok: false, message: 'ไม่มีข้อมูลสำหรับเลขที่กองพันนี้' });
  const headers = sheet.getRange(1, 1, 1, 5).getDisplayValues()[0];
  return jsonResponse_(getAttitudeScoreResult_(lookupId, record, headers));
}

function lookupAttitudeScores_(values) {
  let lookupIds;
  try {
    lookupIds = JSON.parse(values || '');
  } catch (error) {
    return jsonResponse_({ ok: false, message: 'ข้อมูลเลขที่กองพันไม่ถูกต้อง' });
  }
  if (!Array.isArray(lookupIds) || lookupIds.length < 1 || lookupIds.length > 10) {
    return jsonResponse_({ ok: false, message: 'กรุณาส่งเลขที่กองพันตั้งแต่ 1 ถึง 10 หมายเลข' });
  }

  const normalizedIds = lookupIds.map(normalizeLookupId_);
  const sheet = getRegistrationSpreadsheet_().getSheetByName('เจตคติ');
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบชีตเจตคติ' });
  const headers = sheet.getRange(1, 1, 1, 5).getDisplayValues()[0];
  const recordsById = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 8).getDisplayValues().forEach((values, index) => {
      const lookupId = normalizeLookupId_(values[0]);
      if (!/^\d{4}$/.test(lookupId)) return;
      if (recordsById.has(lookupId)) {
        recordsById.set(lookupId, { duplicate: true });
        return;
      }
      recordsById.set(lookupId, { rowNumber: index + 2, values });
    });
  }

  return jsonResponse_({
    ok: true,
    data: normalizedIds.map((lookupId) => {
      if (!/^\d{4}$/.test(lookupId)) {
        return { lookupId, ok: false, message: 'กรุณากรอกเลขที่กองพันให้ครบ 4 หลัก' };
      }
      const record = recordsById.get(lookupId);
      if (!record) {
        return { lookupId, ok: false, message: 'ไม่มีข้อมูลสำหรับเลขที่กองพันนี้' };
      }
      if (record.duplicate) {
        return { lookupId, ok: false, message: 'ชีตเจตคติมีเลขที่กองพันซ้ำ กรุณาตรวจสอบข้อมูล' };
      }
      return Object.assign({ lookupId }, getAttitudeScoreResult_(lookupId, record, headers));
    })
  });
}

function getAttitudeScoreResult_(lookupId, record, headers) {
  const maximumScoreValue = normalizeValue_(record.values[4]);
  const maximumScore = Number(maximumScoreValue);
  const deductionValue = normalizeValue_(record.values[5]);
  const deduction = deductionValue ? Number(deductionValue) : 0;
  if (!maximumScoreValue || !Number.isFinite(maximumScore) || maximumScore < 0) {
    return { ok: false, message: 'คะแนนเต็มในคอลัมน์ E ไม่ถูกต้อง' };
  }
  if (!Number.isFinite(deduction) || deduction < 0 || deduction > maximumScore) {
    return { ok: false, message: 'คะแนนตัดในคอลัมน์ F ไม่ถูกต้อง' };
  }
  return {
    ok: true,
    data: {
      lookupId: lookupId,
      columns: record.values.slice(0, 5).map((value, index) => ({
        label: normalizeValue_(headers[index]) || 'คอลัมน์ ' + String.fromCharCode(65 + index),
        value: normalizeValue_(value)
      })),
      name: getAttitudeName_(headers, record.values),
      deduction: deduction,
      score: maximumScore - deduction,
      reason: normalizeValue_(record.values[7])
    }
  };
}

function getAttitudeName_(headers, values) {
  const nameIndexes = headers.reduce((indexes, header, index) => {
    if (/(ชื่อ|สกุล|name|surname|first\s*name|last\s*name)/i.test(normalizeValue_(header))) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const name = nameIndexes.map((index) => normalizeValue_(values[index]))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name || normalizeValue_(values[1]);
}

function saveAttitudeScore_(data) {
  const lookupId = normalizeLookupId_(data.lookupId);
  const deductionValue = normalizeValue_(data.deduction);
  const deduction = Number(deductionValue);
  const reason = normalizeValue_(data.reason);
  const validReasons = [
    'ป่วย',
    'ลา',
    'ขาด',
    'ธุรการ',
    'เครื่องแต่งกาย',
    'หลับ',
    'เล่นระหว่างเรียน',
    'ทานขนมระหว่างเรียน',
    'ยอดผิด',
    'ไม่ปฏิบัติตามคำสั่ง',
    'นั่งหลับ',
    'คุย',
    'ไม่ตรงเวลา'
  ];
  if (!/^\d{4}$/.test(lookupId)) {
    return jsonResponse_({ ok: false, message: 'กรุณากรอกเลขที่กองพันให้ครบ 4 หลัก' });
  }
  if (!deductionValue || !Number.isFinite(deduction) || deduction < 0) {
    return jsonResponse_({ ok: false, message: 'กรุณากรอกคะแนนตัดเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' });
  }
  if ((deduction > 0 && validReasons.indexOf(reason) < 0)
    || (deduction === 0 && reason && validReasons.indexOf(reason) < 0)) {
    return jsonResponse_({ ok: false, message: 'กรุณาเลือกสาเหตุการตัดคะแนน' });
  }

  const sheet = getRegistrationSpreadsheet_().getSheetByName('เจตคติ');
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบชีตเจตคติ' });
  const record = findAttitudeRecord_(sheet, lookupId);
  if (!record) return jsonResponse_({ ok: false, message: 'ไม่มีข้อมูลสำหรับเลขที่กองพันนี้' });
  const maximumScoreValue = normalizeValue_(record.values[4]);
  const maximumScore = Number(maximumScoreValue);
  if (!maximumScoreValue || !Number.isFinite(maximumScore) || maximumScore < 0) {
    return jsonResponse_({ ok: false, message: 'คะแนนเต็มในคอลัมน์ E ไม่ถูกต้อง' });
  }
  if (deduction > maximumScore) {
    return jsonResponse_({ ok: false, message: 'คะแนนตัดต้องไม่เกินคะแนนเต็ม ' + maximumScore });
  }

  sheet.getRange(record.rowNumber, 6).setValue(deduction).setNumberFormat('0.##');
  sheet.getRange(record.rowNumber, 8).setValue(reason).setNumberFormat('@');
  const remainingScore = recalculateAttitudeScoreRows_(sheet, record.rowNumber, 1)[0];
  sheet.getRange(record.rowNumber, 7).setNumberFormat('0.##');
  updateLearningSummaryAfterSourceWrite_(() => {
    syncLearningSummaryScoresByLookupId_(lookupId, { attitude: remainingScore });
  });
  return jsonResponse_({
    ok: true,
    data: { lookupId: lookupId, deduction: deduction, score: remainingScore, reason: reason },
    message: 'บันทึกคะแนนเจตคติเรียบร้อยแล้ว'
  });
}

function saveAttitudeScores_(data) {
  let entries;
  try {
    entries = JSON.parse(data.entries || '');
  } catch (error) {
    return jsonResponse_({ ok: false, message: 'ข้อมูลรายการตัดคะแนนไม่ถูกต้อง' });
  }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10) {
    return jsonResponse_({ ok: false, message: 'กรุณาส่งรายการตั้งแต่ 1 ถึง 10 หมายเลข' });
  }

  const validReasons = [
    'ป่วย',
    'ลา',
    'ขาด',
    'ธุรการ',
    'เครื่องแต่งกาย',
    'หลับ',
    'เล่นระหว่างเรียน',
    'ทานขนมระหว่างเรียน',
    'ยอดผิด',
    'ไม่ปฏิบัติตามคำสั่ง',
    'นั่งหลับ',
    'คุย',
    'ไม่ตรงเวลา'
  ];
  const sheet = getRegistrationSpreadsheet_().getSheetByName('เจตคติ');
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบชีตเจตคติ' });

  const seenIds = new Set();
  const recordsToSave = [];
  for (const entry of entries) {
    const lookupId = normalizeLookupId_(entry && entry.lookupId);
    const deductionValue = normalizeValue_(entry && entry.deduction);
    const deduction = Number(deductionValue);
    const reason = normalizeValue_(entry && entry.reason);
    if (!/^\d{4}$/.test(lookupId)) {
      return jsonResponse_({ ok: false, message: 'กรุณากรอกเลขที่กองพันให้ครบ 4 หลัก' });
    }
    if (seenIds.has(lookupId)) {
      return jsonResponse_({ ok: false, message: 'มีเลขที่กองพันซ้ำในรายการ: ' + lookupId });
    }
    seenIds.add(lookupId);
    if (!deductionValue || !Number.isFinite(deduction) || deduction < 0) {
      return jsonResponse_({ ok: false, message: 'กรุณากรอกคะแนนตัดของเลขที่ ' + lookupId + ' ให้ถูกต้อง' });
    }
    if ((deduction > 0 && validReasons.indexOf(reason) < 0)
      || (deduction === 0 && reason && validReasons.indexOf(reason) < 0)) {
      return jsonResponse_({ ok: false, message: 'กรุณาเลือกสาเหตุของเลขที่ ' + lookupId });
    }

    const record = findAttitudeRecord_(sheet, lookupId);
    if (!record) {
      return jsonResponse_({ ok: false, message: 'ไม่มีข้อมูลสำหรับเลขที่กองพัน ' + lookupId });
    }
    const maximumScoreValue = normalizeValue_(record.values[4]);
    const maximumScore = Number(maximumScoreValue);
    if (!maximumScoreValue || !Number.isFinite(maximumScore) || maximumScore < 0) {
      return jsonResponse_({ ok: false, message: 'คะแนนเต็มของเลขที่ ' + lookupId + ' ไม่ถูกต้อง' });
    }
    if (deduction > maximumScore) {
      return jsonResponse_({
        ok: false,
        message: 'คะแนนตัดของเลขที่ ' + lookupId + ' ต้องไม่เกินคะแนนเต็ม ' + maximumScore
      });
    }
    recordsToSave.push({
      rowNumber: record.rowNumber,
      lookupId,
      deduction,
      score: maximumScore - deduction,
      reason
    });
  }

  recordsToSave.forEach((record) => {
    const scoreRange = sheet.getRange(record.rowNumber, 6, 1, 3);
    scoreRange.setValues([[record.deduction, record.score, record.reason]]);
    sheet.getRange(record.rowNumber, 6, 1, 2).setNumberFormat('0.##');
    sheet.getRange(record.rowNumber, 8).setNumberFormat('@');
  });
  updateLearningSummaryAfterSourceWrite_(() => {
    recordsToSave.forEach((record) => {
      syncLearningSummaryScoresByLookupId_(record.lookupId, { attitude: record.score });
    });
  });

  return jsonResponse_({
    ok: true,
    data: recordsToSave.map((record) => ({
      lookupId: record.lookupId,
      deduction: record.deduction,
      score: record.score,
      reason: record.reason
    })),
    message: 'บันทึกคะแนนเจตคติเรียบร้อยแล้ว'
  });
}

function onEdit(e) {
  if (!e || !e.range) return;
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== 'เจตคติ' || range.getRow() < 2
    || range.getColumn() > 6 || range.getLastColumn() < 6) return;
  recalculateAttitudeScoreRows_(sheet, range.getRow(), range.getNumRows());
}

function setupLearningSummarySync() {
  const spreadsheet = getRegistrationSpreadsheet_();
  const triggers = ScriptApp.getProjectTriggers();
  const alreadyInstalled = triggers.some((trigger) =>
    trigger.getHandlerFunction() === 'syncLearningSummaryOnEdit'
      && trigger.getEventType() === ScriptApp.EventType.ON_EDIT
  );
  if (!alreadyInstalled) {
    ScriptApp.newTrigger('syncLearningSummaryOnEdit')
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create();
  }
  return 'LearningSummary source-sheet sync is installed.';
}

function syncLearningSummaryOnEdit(e) {
  if (!e || !e.range || e.range.getRow() < 2) return;
  const sheet = e.range.getSheet();
  const name = sheet.getName();
  const relevant = name === 'เจตคติ'
    || name === CONFIG.attendanceSheetName
    || name === CONFIG.registrationSheetName
    || name === 'QuizResults'
    || name === 'ScooreT'
    || name === CONFIG.specialAssessmentIndexSheetName
    || name.indexOf('Assessment_') === 0;
  if (!relevant || name === 'LearningSummary') return;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (name === 'เจตคติ' && e.range.getColumn() <= 6 && e.range.getLastColumn() >= 6) {
      recalculateAttitudeScoreRows_(sheet, e.range.getRow(), e.range.getNumRows());
    }
    rebuildLearningSummary_();
  } finally {
    lock.releaseLock();
  }
}

function recalculateAttitudeScoreRows_(sheet, firstRow, rowCount) {
  const lastRow = firstRow + rowCount - 1;
  const calculationStartRow = Math.max(2, firstRow);
  const calculationRowCount = lastRow - calculationStartRow + 1;
  if (calculationRowCount < 1) return [];
  const scores = sheet.getRange(calculationStartRow, 5, calculationRowCount, 2).getValues().map((row, index) => {
    if (normalizeValue_(row[0]) === '') {
      throw new Error('ไม่พบคะแนนเต็มในคอลัมน์ E แถว ' + (calculationStartRow + index));
    }
    const maximumScore = Number(row[0]);
    const deduction = row[1] === '' || row[1] === null ? 0 : Number(row[1]);
    if (!Number.isFinite(maximumScore) || maximumScore < 0) {
      throw new Error('คะแนนเต็มในคอลัมน์ E แถว ' + (calculationStartRow + index) + ' ไม่ถูกต้อง');
    }
    if (!Number.isFinite(deduction) || deduction < 0 || deduction > maximumScore) {
      throw new Error('คะแนนตัดในคอลัมน์ F แถว ' + (calculationStartRow + index) + ' ไม่ถูกต้อง');
    }
    return maximumScore - deduction;
  });
  sheet.getRange(calculationStartRow, 7, calculationRowCount, 1).setValues(scores.map((score) => [score]));
  return scores;
}

function getQuizIndexHeaders_() {
  return [
    'quiz_id', 'title', 'sheet_name', 'created_at', 'created_by', 'duration_minutes',
    'open_at', 'close_at', 'question_count', 'attempts_allowed', 'phase', 'pass_type',
    'pass_value', 'pass_score', 'active', 'location_restricted', 'location_latitude',
    'location_longitude', 'location_radius_meters'
  ];
}

function getOrCreateQuizIndexSheet_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.quizIndexSheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.quizIndexSheetName);

  const headers = getQuizIndexHeaders_();
  ensureSheetColumns_(sheet, headers.length);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    return sheet;
  }

  const columnCount = Math.max(sheet.getLastColumn(), headers.length);
  const values = sheet.getRange(1, 1, sheet.getLastRow(), columnCount).getValues();
  const existingHeaders = values[0].map(normalizeValue_);
  if (headers.every((header, index) => existingHeaders[index] === header)) return sheet;

  const headerIndexes = new Map(existingHeaders.map((header, index) => [header, index]));
  const migratedRows = values.slice(1).map((row) => {
    const migrated = headers.map((header) => {
      const index = headerIndexes.get(header);
      return index === undefined ? '' : row[index];
    });
    const rowPassType = normalizeValue_(row[11]).toLowerCase();
    const hasMisalignedNewRow = existingHeaders[11] === 'active'
      && (rowPassType === 'percent' || rowPassType === 'count');

    if (hasMisalignedNewRow) {
      migrated[11] = row[11];
      migrated[12] = row[12];
      migrated[13] = row[13];
      migrated[14] = row[14];
    }
    if (!migrated[11]) migrated[11] = 'percent';
    if (migrated[12] === '' || migrated[12] === null) migrated[12] = 70;
    if (migrated[13] === '' || migrated[13] === null) migrated[13] = migrated[12];
    if (!migrated[14]) migrated[14] = 'TRUE';
    return migrated;
  });

  sheet.getRange(1, 1, migratedRows.length + 1, headers.length)
    .setValues([headers].concat(migratedRows));
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  return sheet;
}

function createQuiz_(data) {
  const email = CacheService.getScriptCache().get('teacher:' + normalizeValue_(data.token));
  if (!email) return jsonResponse_({ ok: false, message: 'กรุณาเข้าสู่ระบบครูใหม่' });
  const title = normalizeValue_(data.title);
  const duration = Number(data.duration || 30);
  const questionCount = Number(data.questionCount || 0);
  const attemptsAllowed = Number(normalizeValue_(data.attemptsAllowed) || 1);
  const phase = normalizePhase_(data.phase);
  const questionType = normalizeValue_(data.questionType) === 'yes-no' ? 'yes-no' : 'multiple-choice';
  const requestedPassType = normalizeValue_(data.passType).toLowerCase();
  const passType = requestedPassType === 'none' ? 'none' : (requestedPassType === 'count' ? 'count' : 'percent');
  const passValueText = normalizeValue_(data.passValue ?? data.passScore);
  const passValue = passType === 'none' || passValueText === '' ? null : Number(passValueText);
  const locationRestricted = normalizeValue_(data.locationRestricted).toLowerCase() === 'true';
  const locationLatitude = locationRestricted && normalizeValue_(data.locationLatitude) !== ''
    ? Number(data.locationLatitude) : NaN;
  const locationLongitude = locationRestricted && normalizeValue_(data.locationLongitude) !== ''
    ? Number(data.locationLongitude) : NaN;
  const locationRadius = locationRestricted ? Number(data.locationRadius) : '';
  const openAt = normalizeValue_(data.openAt);
  const closeAt = normalizeValue_(data.closeAt);
  let rows;
  try { rows = JSON.parse(data.questions || '[]'); } catch (error) { rows = []; }
  const validRows = Array.isArray(rows) && rows.length > 0 && rows.every((row) => {
    const choicesValid = normalizeValue_(row.choice1) && normalizeValue_(row.choice2)
      && (questionType === 'yes-no' || (normalizeValue_(row.choice3) && normalizeValue_(row.choice4)));
    const answerPattern = questionType === 'yes-no' ? /^[1-2]$/ : /^[1-4]$/;
    return normalizeValue_(row.question) && choicesValid && answerPattern.test(normalizeValue_(row.answer));
  });
  if (!title || !validRows || !Number.isInteger(duration) || duration < 1
    || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > rows.length
    || !Number.isInteger(attemptsAllowed) || attemptsAllowed < 1 || attemptsAllowed > 999
    || !isValidDateRange_(openAt, closeAt) || !phase
    || (passType !== 'none' && (!Number.isFinite(passValue) || passValue < 0))
    || (passType === 'percent' && (passValue < 0 || passValue > 100))
    || (passType === 'count' && (passValue < 1 || passValue > questionCount))
    || (locationRestricted && (!Number.isFinite(locationLatitude) || locationLatitude < -90 || locationLatitude > 90
      || !Number.isFinite(locationLongitude) || locationLongitude < -180 || locationLongitude > 180
      || !Number.isInteger(locationRadius) || locationRadius < 10 || locationRadius > 50000))) {
    return jsonResponse_({ ok: false, message: 'ตรวจสอบชื่อเรื่อง ตัวเลือก เฉลย เกณฑ์ผ่าน และค่าการสอบให้ครบถ้วน' });
  }
  const spreadsheet = getRegistrationSpreadsheet_();
  const quizId = 'Q' + String(Date.now());
  const sheetName = CONFIG.quizSheetPrefix + quizId;
  const sheet = spreadsheet.insertSheet(sheetName);
  const headers = ['question', 'choice_1', 'choice_2', 'choice_3', 'choice_4', 'answer', 'explanation', 'active'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  const values = rows.map((row) => [
    normalizeValue_(row.question), normalizeValue_(row.choice1), normalizeValue_(row.choice2),
    normalizeValue_(row.choice3), normalizeValue_(row.choice4), normalizeValue_(row.answer),
    normalizeValue_(row.explanation), 'TRUE'
  ]);
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  const indexSheet = getOrCreateQuizIndexSheet_();
  indexSheet.appendRow([quizId, title, sheetName, new Date(), email, duration, openAt, closeAt,
    questionCount, attemptsAllowed, phase, passType, passValue === null ? '' : String(passValue),
    passValue === null ? '' : String(passValue), 'TRUE',
    locationRestricted ? 'TRUE' : 'FALSE', locationRestricted ? locationLatitude : '',
    locationRestricted ? locationLongitude : '', locationRestricted ? locationRadius : '']);
  return jsonResponse_({ ok: true, quizId: quizId, message: 'สร้างข้อสอบเรียบร้อยแล้ว' });
}

function listQuizzes_() {
  if (getRegistrationSpreadsheet_().getSheetByName('QuizAttemptHistory')) {
    getOrCreateQuizAttemptHistorySheet_();
  }
  const sheet = getOrCreateQuizIndexSheet_();
  const rows = sheet.getDataRange().getDisplayValues().slice(1)
    .filter((row) => row[14] !== 'FALSE')
    .map((row) => ({ quizId: row[0], title: row[1], duration: row[5], openAt: row[6], closeAt: row[7],
      questionCount: row[8], attemptsAllowed: row[9], phase: normalizePhase_(row[10]) || 'pre-test',
      passType: normalizeValue_(row[11]) === 'none' ? 'none' : (normalizeValue_(row[11]) === 'count' ? 'count' : 'percent'),
      passValue: normalizeValue_(row[11]) === 'none' ? null : Number(row[12] || row[13] || 70),
      locationRestricted: row[15] === 'TRUE', locationRadius: Number(row[18]) || 0 }));
  return jsonResponse_({ ok: true, quizzes: rows });
}

function getQuiz_(quizId, studentId, phase, title, locationLatitude, locationLongitude) {
  const quiz = quizId ? findQuizMetadata_(quizId) : findQuizMetadataByTitle_(title, phase);
  if (!quiz) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
  const requestedPhase = normalizePhase_(phase);
  if (!requestedPhase) return jsonResponse_({ ok: false, message: 'ไม่พบช่วงสอบที่ถูกต้อง' });
  if (!isQuizOpen_(quiz)) return jsonResponse_({ ok: false, message: 'แบบทดสอบยังไม่เปิดหรือปิดแล้ว' });
  if (quiz.locationRestricted) {
    if (!Number.isFinite(quiz.locationLatitude) || quiz.locationLatitude < -90 || quiz.locationLatitude > 90
      || !Number.isFinite(quiz.locationLongitude) || quiz.locationLongitude < -180 || quiz.locationLongitude > 180
      || !Number.isInteger(quiz.locationRadius) || quiz.locationRadius < 10 || quiz.locationRadius > 50000) {
      return jsonResponse_({ ok: false, message: 'การตั้งค่าพื้นที่สอบไม่ถูกต้อง กรุณาติดต่อครูผู้สร้างแบบทดสอบ' });
    }
    if (normalizeValue_(locationLatitude) === '' || normalizeValue_(locationLongitude) === '') {
      return jsonResponse_({ ok: false, message: 'ข้อสอบนี้กำหนดพื้นที่เข้าสอบ กรุณาอนุญาต GPS แล้วลองใหม่' });
    }
    const latitude = Number(locationLatitude);
    const longitude = Number(locationLongitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return jsonResponse_({ ok: false, message: 'ข้อสอบนี้กำหนดพื้นที่เข้าสอบ กรุณาอนุญาต GPS แล้วลองใหม่' });
    }
    const distance = distanceBetweenCoordinatesMeters_(
      latitude, longitude, quiz.locationLatitude, quiz.locationLongitude
    );
    if (distance > quiz.locationRadius) {
      return jsonResponse_({
        ok: false,
        message: `อยู่นอกพื้นที่สอบ ระยะห่างประมาณ ${Math.round(distance)} เมตร (กำหนดไม่เกิน ${quiz.locationRadius} เมตร)`
      });
    }
  }
  const student = findRegistrationRecord_(normalizeValue_(studentId));
  if (!student) return jsonResponse_({ ok: false, message: 'ไม่พบข้อมูลผู้เข้าสอบในชีต Registration' });
  const quizAttemptCount = countQuizAttempts_(studentId, quiz.quizId || normalizeValue_(quizId), requestedPhase);
  const attemptsAllowed = Number(quiz.attemptsAllowed || 1);
  const isPostTest = requestedPhase === 'post-test';
  const passRule = getQuizPassRule_(quiz, requestedPhase);
  const retryPostTestUntilPassed = isPostTest && passRule.passType !== 'none';
  const effectiveAttemptsAllowed = isPostTest && !retryPostTestUntilPassed ? 1 : attemptsAllowed;
  const attemptsRemaining = retryPostTestUntilPassed ? -1 : Math.max(0, effectiveAttemptsAllowed - quizAttemptCount);
  if (retryPostTestUntilPassed && hasPassedPostTest_(studentId, quiz.quizId || normalizeValue_(quizId), quiz)) {
    return jsonResponse_({ ok: false, message: 'ท่านสอบหลังเรียนผ่านเกณฑ์แล้ว ไม่สามารถสอบซ้ำได้', remainingAttempts: 0, attemptsUsed: quizAttemptCount });
  }
  if (!retryPostTestUntilPassed
    && hasQuizAttempt_(studentId, quiz.quizId || normalizeValue_(quizId), requestedPhase, effectiveAttemptsAllowed)) {
    return jsonResponse_({ ok: false, message: `คุณได้ใช้สิทธิ์สอบ${formatPhaseLabel_(requestedPhase)}ครบแล้ว ไม่สามารถสอบซ้ำได้`, remainingAttempts: 0, attemptsAllowed: quiz.attemptsAllowed, attemptsUsed: quizAttemptCount });
  }
  const sheet = getRegistrationSpreadsheet_().getSheetByName(quiz.sheetName);
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
  const rows = sheet.getDataRange().getDisplayValues().slice(1)
    .map((row, index) => ({ rowNumber: index + 2, row: row }))
    .filter((item) => item.row[7] !== 'FALSE');
  const resolvedQuizId = quiz.quizId || normalizeValue_(quizId);
  const questionCount = Math.min(quiz.questionCount, rows.length);
  const attemptToken = Utilities.getUuid();
  let selected;
  if (requestedPhase === 'pre-test' || requestedPhase === 'post-test') {
    const stableQuestionSet = shuffleForSeed_(
      rows,
      `${resolvedQuizId}:${normalizeValue_(studentId)}:pre-post`
    ).slice(0, questionCount);
    selected = shuffleForSeed_(stableQuestionSet, `${attemptToken}:${requestedPhase}:question-order`);
  } else {
    selected = shuffleServer_(rows).slice(0, questionCount);
  }
  const presentedQuestions = prepareQuizQuestions_(selected, attemptToken);
  const attempt = {
    quizId: resolvedQuizId, studentId: normalizeValue_(studentId), phase: requestedPhase,
    duration: quiz.duration,
    questionIds: presentedQuestions.map((item) => item.id),
    questionAnswers: presentedQuestions.map((item) => [item.id, item.answer]),
    passType: passRule.passType,
    passValue: passRule.passValue
  };
  storeQuizAttemptSession_(attemptToken, attempt, QUIZ_ATTEMPT_START_TTL_SECONDS);
  return jsonResponse_({ ok: true, quizId: resolvedQuizId, attemptToken: attemptToken, duration: quiz.duration,
    attemptsAllowed: effectiveAttemptsAllowed, attemptsUsed: quizAttemptCount, remainingAttempts: attemptsRemaining, student: student.examInfo,
    passType: passRule.passType, passValue: passRule.passValue, passScore: passRule.passValue,
    questions: presentedQuestions.map(({ id, question, choices }) => ({ id, question, choices })) });
}

function beginQuizAttempt_(data) {
  const attemptToken = normalizeValue_(data.attemptToken);
  const quizId = normalizeValue_(data.quizId);
  const studentId = normalizeValue_(data.studentId);
  const phase = normalizePhase_(data.phase);
  const attempt = getQuizAttemptSession_(attemptToken);
  if (!attempt || attempt.quizId !== quizId || attempt.studentId !== studentId || attempt.phase !== phase) {
    return jsonResponse_({ ok: false, message: 'เซสชันข้อสอบหมดอายุหรือไม่ถูกต้อง กรุณาเริ่มสอบใหม่' });
  }
  storeQuizAttemptSession_(attemptToken, attempt, getQuizAttemptTtlSeconds_(attempt.duration));
  return jsonResponse_({ ok: true });
}

function getQuizAttemptTtlSeconds_(durationMinutes) {
  const maximumTtlSeconds = 21600;
  return Math.min(maximumTtlSeconds, Math.max(300, Number(durationMinutes || 30) * 60 + 300));
}

function storeQuizAttemptSession_(attemptToken, attempt, ttlSeconds) {
  cleanupExpiredQuizAttemptSessions_();
  const session = { attempt: attempt, expiresAt: Date.now() + ttlSeconds * 1000 };
  const serialized = JSON.stringify(session);
  if (serialized.length > 9000) {
    throw new Error('ข้อมูลข้อสอบมีขนาดเกินกว่าที่ระบบจัดเก็บเซสชันได้ กรุณาติดต่อผู้ดูแล');
  }
  const cacheKey = 'quiz-attempt:' + attemptToken;
  CacheService.getScriptCache().remove(cacheKey);
  PropertiesService.getScriptProperties().setProperty(
    QUIZ_ATTEMPT_SESSION_PROPERTY_PREFIX + attemptToken,
    serialized
  );
  CacheService.getScriptCache().put(
    cacheKey,
    serialized,
    Math.min(21600, Math.max(1, Math.ceil(ttlSeconds)))
  );
}

function getQuizAttemptSession_(attemptToken) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'quiz-attempt:' + attemptToken;
  let serialized = cache.get(cacheKey);
  let session = null;
  if (serialized) {
    try {
      session = JSON.parse(serialized);
    } catch (error) {
      cache.remove(cacheKey);
      serialized = '';
    }
  }
  if (session && session.quizId && !session.attempt) {
    const legacyAttempt = session;
    session = {
      attempt: legacyAttempt,
      expiresAt: Date.now() + getQuizAttemptTtlSeconds_(legacyAttempt.duration) * 1000
    };
    serialized = JSON.stringify(session);
    PropertiesService.getScriptProperties().setProperty(
      QUIZ_ATTEMPT_SESSION_PROPERTY_PREFIX + attemptToken,
      serialized
    );
    cache.put(cacheKey, serialized, getQuizAttemptTtlSeconds_(legacyAttempt.duration));
  }
  if (!session) {
    const properties = PropertiesService.getScriptProperties();
    serialized = properties.getProperty(QUIZ_ATTEMPT_SESSION_PROPERTY_PREFIX + attemptToken);
    if (!serialized) return null;
    try {
      session = JSON.parse(serialized);
    } catch (error) {
      throw new Error('ข้อมูลเซสชันข้อสอบที่จัดเก็บไว้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล');
    }
  }
  if (!session || !session.attempt || !Number.isFinite(Number(session.expiresAt))) {
    cache.remove(cacheKey);
    const properties = PropertiesService.getScriptProperties();
    serialized = properties.getProperty(QUIZ_ATTEMPT_SESSION_PROPERTY_PREFIX + attemptToken);
    if (!serialized) return null;
    try {
      session = JSON.parse(serialized);
    } catch (error) {
      throw new Error('ข้อมูลเซสชันข้อสอบที่จัดเก็บไว้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล');
    }
    if (!session || !session.attempt || !Number.isFinite(Number(session.expiresAt))) {
      throw new Error('ข้อมูลเซสชันข้อสอบที่จัดเก็บไว้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล');
    }
  }
  const remainingSeconds = Math.ceil((Number(session.expiresAt) - Date.now()) / 1000);
  if (remainingSeconds <= 0) {
    removeQuizAttemptSession_(attemptToken);
    return null;
  }
  if (!cache.get(cacheKey)) {
    cache.put(cacheKey, JSON.stringify(session), Math.min(21600, remainingSeconds));
  }
  return session.attempt;
}

function removeQuizAttemptSession_(attemptToken) {
  CacheService.getScriptCache().remove('quiz-attempt:' + attemptToken);
  PropertiesService.getScriptProperties().deleteProperty(
    QUIZ_ATTEMPT_SESSION_PROPERTY_PREFIX + attemptToken
  );
}

function cleanupExpiredQuizAttemptSessions_() {
  const cache = CacheService.getScriptCache();
  if (cache.get(QUIZ_ATTEMPT_SESSION_CLEANUP_CACHE_KEY)) return;
  const properties = PropertiesService.getScriptProperties();
  const allProperties = properties.getProperties();
  const now = Date.now();
  Object.keys(allProperties).forEach((key) => {
    if (key.indexOf(QUIZ_ATTEMPT_SESSION_PROPERTY_PREFIX) !== 0) return;
    let session;
    try {
      session = JSON.parse(allProperties[key]);
    } catch (error) {
      throw new Error('ข้อมูลเซสชันข้อสอบที่จัดเก็บไว้ไม่ถูกต้อง กรุณาติดต่อผู้ดูแล');
    }
    if (!session || !Number.isFinite(Number(session.expiresAt)) || Number(session.expiresAt) <= now) {
      properties.deleteProperty(key);
    }
  });
  cache.put(QUIZ_ATTEMPT_SESSION_CLEANUP_CACHE_KEY, String(now), 600);
}

function prepareQuizQuestions_(selected, attemptToken) {
  return selected.map((item) => {
    const choices = item.row.slice(1, 5)
      .map((choice, index) => ({
        choice: normalizeValue_(choice),
        originalIndex: index
      }));
    const answerIndex = Number(normalizeValue_(item.row[5])) - 1;
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length
      || !choices[answerIndex].choice) {
      throw new Error('เฉลยของข้อสอบข้อที่ ' + (item.rowNumber - 1) + ' ไม่ถูกต้อง');
    }
    const availableChoices = choices.filter((choice) => choice.choice);
    const shuffledChoices = shuffleForSeed_(
      availableChoices,
      `${attemptToken}:${item.rowNumber}:choices`
    );
    return {
      id: item.rowNumber,
      question: item.row[0],
      choices: shuffledChoices.map((choice) => choice.choice),
      answer: String(shuffledChoices.findIndex((choice) => choice.originalIndex === answerIndex) + 1)
    };
  });
}

function submitQuiz_(data) {
  const quizId = normalizeValue_(data.quizId);
  const studentId = normalizeValue_(data.studentId);
  const phase = normalizePhase_(data.phase);
  const attemptToken = normalizeValue_(data.attemptToken);
  if (!studentId) return jsonResponse_({ ok: false, message: 'กรุณาระบุเลขประจำตัว' });
  let attempt;
  attempt = getQuizAttemptSession_(attemptToken);
  const quiz = findQuizMetadata_(quizId);
  if (!quiz) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
  const currentPassRule = getQuizPassRule_(quiz, phase);
  const passRule = attempt && ['none', 'count', 'percent'].indexOf(attempt.passType) >= 0
    ? {
      passType: attempt.passType,
      passValue: attempt.passType === 'none' ? null : Number(attempt.passValue)
    }
    : currentPassRule;
  const resultsSheet = getOrCreateQuizResultsSheet_();
  const savedAttempt = findQuizAttemptById_(attemptToken);
  if (savedAttempt) {
    if (savedAttempt.quiz_id !== quizId || savedAttempt.student_id !== studentId
      || savedAttempt.phase !== phase) {
      return jsonResponse_({ ok: false, message: 'เซสชันการสอบไม่ถูกต้อง กรุณาเริ่มสอบใหม่' });
    }
    const student = findRegistrationRecord_(studentId);
    const savedPassType = normalizeValue_(savedAttempt.pass_type) || passRule.passType;
    const savedPassValue = savedPassType === 'none'
      ? null
      : (savedAttempt.pass_value === '' ? passRule.passValue : Number(savedAttempt.pass_value));
    const resultPayload = {
      result_id: savedAttempt.attempt_id,
      submitted_at: savedAttempt.submitted_at,
      student_id: studentId,
      quiz_id: quizId,
      phase: phase,
      pass_type: savedPassType,
      pass_value: savedPassValue === null ? '' : savedPassValue,
      passed: savedAttempt.passed === '' ? null : savedAttempt.passed === 'TRUE',
      pre_score: phase === 'pre-test' ? savedAttempt.score : '',
      post_score: phase === 'post-test' ? savedAttempt.score : '',
      score: savedAttempt.score,
      total: savedAttempt.total,
      lookup_id: student ? normalizeLookupId_(student.examInfo.lookupId) : savedAttempt.lookup_id,
      rank_name: student ? student.examInfo.rankName : '',
      affiliation: student ? student.examInfo.affiliation : '',
      email: student ? student.examInfo.email : '',
      episode: student ? student.examInfo.formName : ''
    };
    appendQuizResult_(resultsSheet, resultPayload);
    updateLearningSummaryAfterSourceWrite_(() =>
      refreshLearningSummaryScoresForStudent_(studentId, resultPayload.lookup_id));
    removeQuizAttemptSession_(attemptToken);
    return buildQuizSubmissionResponse_(resultPayload, quiz, student);
  }
  if (!isQuizOpen_(quiz)) return jsonResponse_({ ok: false, message: 'แบบทดสอบยังไม่เปิดหรือปิดแล้ว' });
  if (!attempt || attempt.quizId !== quizId || attempt.studentId !== studentId || attempt.phase !== phase) {
    return jsonResponse_({ ok: false, message: 'เซสชันการสอบไม่ถูกต้อง กรุณาเริ่มสอบใหม่' });
  }
  const attemptsAllowed = Number(quiz.attemptsAllowed || 1);
  const isPostTest = phase === 'post-test';
  const retryPostTestUntilPassed = isPostTest && passRule.passType !== 'none';
  const effectiveAttemptsAllowed = isPostTest && !retryPostTestUntilPassed ? 1 : attemptsAllowed;
  if (retryPostTestUntilPassed && hasPassedPostTest_(studentId, quizId, quiz)) {
    return jsonResponse_({ ok: false, message: 'ท่านสอบหลังเรียนผ่านเกณฑ์แล้ว ไม่สามารถสอบซ้ำได้' });
  }
  if (!retryPostTestUntilPassed && hasQuizAttempt_(studentId, quizId, phase, effectiveAttemptsAllowed)) {
    return jsonResponse_({ ok: false, message: 'ผู้เข้าสอบใช้สิทธิ์ช่วงนี้ครบแล้ว' });
  }
  let answers;
  try {
    answers = JSON.parse(data.answers || '{}');
  } catch (error) {
    return jsonResponse_({ ok: false, message: 'ข้อมูลคำตอบไม่ถูกต้อง กรุณาส่งคำตอบใหม่' });
  }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return jsonResponse_({ ok: false, message: 'ข้อมูลคำตอบไม่ถูกต้อง กรุณาส่งคำตอบใหม่' });
  }
  let score = 0;
  let total;
  if (Array.isArray(attempt.questionAnswers) && attempt.questionAnswers.length > 0) {
    total = attempt.questionAnswers.length;
    attempt.questionAnswers.forEach((item) => {
      if (!Array.isArray(item) || item.length !== 2 || !Number.isInteger(Number(item[0]))) {
        throw new Error('ข้อมูลเซสชันข้อสอบไม่ถูกต้อง กรุณาเริ่มสอบใหม่');
      }
      if (normalizeValue_(answers[String(item[0])]).toLowerCase()
        === normalizeValue_(item[1]).toLowerCase()) score += 1;
    });
  } else {
    const sheet = getRegistrationSpreadsheet_().getSheetByName(quiz.sheetName);
    if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
    const questionIds = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
    const allRows = sheet.getDataRange().getDisplayValues();
    const rows = questionIds.map((id) => ({ id: Number(id), row: allRows[Number(id) - 1] }))
      .filter((item) => item.row && item.row[7] !== 'FALSE');
    total = rows.length;
    rows.forEach((item) => {
      if (normalizeValue_(answers[String(item.id)]).toLowerCase()
        === normalizeValue_(item.row[5]).toLowerCase()) score += 1;
    });
  }
  const student = findRegistrationRecord_(studentId);
  const resultPassType = passRule.passType;
  const resultPassValue = passRule.passValue;
  const passed = resultPassType === 'none' ? null : (resultPassType === 'count'
    ? score >= resultPassValue
    : (total > 0 && (score / total) * 100 >= resultPassValue));
  const resultPayload = {
    result_id: attemptToken,
    submitted_at: new Date(),
    student_id: studentId,
    quiz_id: quizId,
    phase: phase,
    pass_type: resultPassType,
    pass_value: resultPassValue === null ? '' : resultPassValue,
    passed: passed,
    pre_score: phase === 'pre-test' ? score : '',
    post_score: phase === 'post-test' ? score : '',
    score: score,
    total: total,
    lookup_id: student ? normalizeLookupId_(student.examInfo.lookupId) : '',
    rank_name: student ? student.examInfo.rankName : '',
    affiliation: student ? student.examInfo.affiliation : '',
    email: student ? student.examInfo.email : '',
    episode: student ? student.examInfo.formName : ''
  };
  appendQuizAttemptHistory_(resultPayload);
  appendQuizResult_(resultsSheet, resultPayload);
  updateLearningSummaryAfterSourceWrite_(() => syncLearningSummaryQuizResult_(resultPayload));
  removeQuizAttemptSession_(attemptToken);
  return buildQuizSubmissionResponse_(resultPayload, quiz, student);
}

function buildQuizSubmissionResponse_(result, quiz, student) {
  const phase = normalizePhase_(result.phase);
  const retryPostTestUntilPassed = phase === 'post-test' && result.pass_type !== 'none';
  const attemptsAllowed = Number(quiz.attemptsAllowed || 1);
  const effectiveAttemptsAllowed = phase === 'post-test' && !retryPostTestUntilPassed
    ? 1 : attemptsAllowed;
  const attemptsRemaining = retryPostTestUntilPassed
    ? -1 : Math.max(0, effectiveAttemptsAllowed - countQuizAttempts_(result.student_id, result.quiz_id, phase));
  const summary = getQuizPhaseSummary_(result.student_id, result.quiz_id);
  return jsonResponse_({ ok: true, score: result.score, total: result.total, phase: phase,
    passType: result.pass_type, passValue: result.pass_value, passScore: result.pass_value,
    passed: result.passed, remainingAttempts: attemptsRemaining,
    student: student ? student.examInfo : null, phaseSummary: summary,
    message: 'ส่งคำตอบเรียบร้อยแล้ว' });
}

function getQuizPhaseSummary_(studentId, quizId) {
  const sheet = getOrCreateQuizResultsSheet_();
  const headers = getQuizResultHeaders_(sheet);
  const studentIndex = headers.indexOf('student_id');
  const lookupIndex = headers.indexOf('เลขที่กองกัน');
  const quizIndex = headers.indexOf('quiz_id');
  const submittedAtIndex = headers.indexOf('submitted_at');
  const lastRow = sheet.getLastRow();
  const summary = {
    'pre-test': { score: '-', total: '-', submittedAt: '' },
    'post-test': { score: '-', total: '-', submittedAt: '' },
    'score': { score: '-', total: '-', submittedAt: '' }
  };
  if (lastRow < 2 || studentIndex < 0 || lookupIndex < 0 || quizIndex < 0
    || submittedAtIndex < 0) return summary;
  const rowCount = lastRow - 1;
  const resultRows = sheet.getRange(2, 1, rowCount, headers.length).getValues();
  const normalizedStudentId = normalizeValue_(studentId);
  const normalizedLookupId = normalizeLookupId_(studentId);
  let latestRow;
  let latestTimestamp = -Infinity;
  for (let index = 0; index < rowCount; index += 1) {
    const row = resultRows[index];
    const isSameStudent = normalizeValue_(row[studentIndex]) === normalizedStudentId
      || normalizeLookupId_(row[lookupIndex]) === normalizedLookupId;
    if (!isSameStudent || normalizeValue_(row[quizIndex]) !== normalizeValue_(quizId)) continue;
    const timestampValue = row[submittedAtIndex];
    const timestamp = timestampValue instanceof Date
      ? timestampValue.getTime()
      : Date.parse(normalizeValue_(timestampValue));
    if (!latestRow || (Number.isFinite(timestamp) && (!Number.isFinite(latestTimestamp) || timestamp >= latestTimestamp))
      || (!Number.isFinite(timestamp) && !Number.isFinite(latestTimestamp))) {
      latestRow = row;
      latestTimestamp = timestamp;
    }
  }
  if (!latestRow) return summary;
  const preScore = latestRow[headers.indexOf('pre_score')];
  const postScore = latestRow[headers.indexOf('post_score')];
  const score = latestRow[headers.indexOf('score')];
  const total = latestRow[headers.indexOf('total')] || '-';
  const submittedAt = normalizeValue_(latestRow[submittedAtIndex]);
  if (preScore !== '') summary['pre-test'] = { score: preScore, total: total, submittedAt: submittedAt };
  if (postScore !== '') summary['post-test'] = { score: postScore, total: total, submittedAt: submittedAt };
  if (score !== '' && normalizePhase_(latestRow[headers.indexOf('phase')]) === 'score') {
    summary.score = { score: score, total: total, submittedAt: submittedAt };
  }
  return summary;
}

function getCompactQuizResultHeaders_() {
  return [
    'result_id', 'submitted_at', 'student_id', 'pre_score', 'post_score', 'total',
    'เลขที่กองกัน', 'ยศ-ชื่อ-สกุล', 'สังกัด', 'อีเมล', 'ตอนที่', 'score',
    'quiz_id', 'phase', 'pass_type', 'pass_value', 'passed'
  ];
}

function pruneUnusedQuizResultColumns_(sheet) {
  const compactHeaders = getCompactQuizResultHeaders_();
  const compactSet = new Set(compactHeaders);
  const headerValues = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getDisplayValues()[0];
  const extraColumns = [];
  headerValues.forEach((header, index) => {
    if (header && !compactSet.has(normalizeValue_(header))) {
      extraColumns.push(index + 1);
    }
  });
  for (let index = extraColumns.length - 1; index >= 0; index -= 1) {
    sheet.deleteColumn(extraColumns[index]);
  }
}

function getOrCreateQuizResultsSheet_() {
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), 'QuizResults', getCompactQuizResultHeaders_());
  pruneUnusedQuizResultColumns_(sheet);
  return sheet;
}

function getQuizResultHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const required = getCompactQuizResultHeaders_();
  required.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header).setFontWeight('bold');
      headers.push(header);
    }
  });
  return headers;
}

function countQuizAttempts_(studentId, quizId, phase) {
  return getQuizAttemptHistoryRows_(studentId, quizId, phase).length;
}

function getQuizPassRule_(quiz, phase) {
  const passType = quiz.passType || 'percent';
  return {
    passType: passType,
    passValue: passType === 'none' ? null : Number(quiz.passValue ?? quiz.passScore ?? 70)
  };
}

function hasPassedPostTest_(studentId, quizId, quiz) {
  const passRule = getQuizPassRule_(quiz, 'post-test');
  return getQuizAttemptHistoryRows_(studentId, quizId, 'post-test')
    .some((row) => isQuizScorePassed_(row[6], row[7], passRule));
}

function isQuizScorePassed_(scoreValue, totalValue, passRule) {
  const score = Number(scoreValue);
  const total = Number(totalValue);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0 || passRule.passType === 'none') return false;
  return passRule.passType === 'count'
    ? score >= passRule.passValue
    : (score / total) * 100 >= passRule.passValue;
}

function getQuizAttemptHistoryRows_(studentId, quizId, phase) {
  const sheet = getOrCreateQuizAttemptHistorySheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const lastRow = sheet.getLastRow();
  const studentIndex = headers.indexOf('student_id');
  const lookupIndex = headers.indexOf('lookup_id');
  const quizIndex = headers.indexOf('quiz_id');
  const phaseIndex = headers.indexOf('phase');
  if ([studentIndex, lookupIndex, quizIndex, phaseIndex].some((index) => index < 0)) {
    throw new Error('โครงสร้างชีต QuizAttemptHistory ไม่ถูกต้อง');
  }
  if (lastRow < 2) return [];
  const normalizedStudentId = normalizeValue_(studentId);
  const normalizedLookupId = normalizeLookupId_(studentId);
  const matchingRows = new Set();
  const findMatchingRows = (columnIndex, value) => {
    if (!value) return;
    sheet.getRange(2, columnIndex + 1, lastRow - 1, 1)
      .createTextFinder(value)
      .matchEntireCell(true)
      .matchCase(true)
      .findAll()
      .forEach((range) => matchingRows.add(range.getRow()));
  };
  findMatchingRows(studentIndex, normalizedStudentId);
  findMatchingRows(lookupIndex, normalizedLookupId);
  return Array.from(matchingRows).map((rowNumber) =>
    sheet.getRange(rowNumber, 1, 1, headers.length).getDisplayValues()[0]
  ).filter((row) => {
    const rowStudentId = normalizeValue_(row[studentIndex] || '');
    const rowLookupId = normalizeLookupId_(row[lookupIndex] || '');
    return row[quizIndex] === normalizeValue_(quizId)
      && (!phase || row[phaseIndex] === normalizePhase_(phase))
      && (!normalizedStudentId || rowStudentId === normalizedStudentId || rowLookupId === normalizedLookupId);
  });
}

function getOrCreateQuizAttemptHistorySheet_() {
  const headers = [
    'attempt_id', 'submitted_at', 'student_id', 'lookup_id', 'quiz_id',
    'phase', 'score', 'total', 'passed', 'pass_type', 'pass_value'
  ];
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), 'QuizAttemptHistory', headers);
  ensureSheetColumns_(sheet, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (sheet.getLastRow() === 1) {
    const resultSheet = getOrCreateQuizResultsSheet_();
    const resultHeaders = getQuizResultHeaders_(resultSheet);
    const resultRows = resultSheet.getDataRange().getDisplayValues().slice(1);
    const indexOf = (name) => resultHeaders.indexOf(name);
    const legacyRows = resultRows.filter((row) => row[indexOf('quiz_id')] && row[indexOf('phase')])
      .map((row) => [
        row[indexOf('result_id')], row[indexOf('submitted_at')], row[indexOf('student_id')],
        row[indexOf('เลขที่กองกัน')], row[indexOf('quiz_id')], row[indexOf('phase')],
        row[indexOf('score')], row[indexOf('total')], row[indexOf('passed')],
        row[indexOf('pass_type')], row[indexOf('pass_value')]
      ]);
    if (legacyRows.length) sheet.getRange(2, 1, legacyRows.length, headers.length).setValues(legacyRows);
  }
  ensureSheetColumns_(sheet, 25);
  const hasPhaseViewHeaders = getQuizAttemptPhaseViews_().every((view) =>
    sheet.getRange(1, view.column, 1, 4).getDisplayValues()[0]
      .every((header, index) => header === ['lookup_id', 'score', 'total', 'passed'][index])
  );
  if (!hasPhaseViewHeaders) updateQuizAttemptPhaseViews_(sheet);
  return sheet;
}

function appendQuizAttemptHistory_(result) {
  const sheet = getOrCreateQuizAttemptHistorySheet_();
  const lookupId = normalizeLookupId_(result.lookup_id || '');
  const row = [
    result.result_id, result.submitted_at, result.student_id, lookupId, result.quiz_id,
    result.phase, result.score, result.total,
    result.passed === null || result.passed === undefined ? '' : (result.passed ? 'TRUE' : 'FALSE'),
    result.pass_type, result.pass_value
  ];
  const attempt = findQuizAttemptById_(result.result_id);
  const targetRow = attempt ? attempt.rowNumber : sheet.getLastRow() + 1;
  [1, 3, 4, 5].forEach((column) => sheet.getRange(targetRow, column).setNumberFormat('@'));
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
  if (!attempt) appendQuizAttemptPhaseView_(sheet, result, lookupId);
}

function findQuizAttemptById_(attemptId) {
  const normalizedAttemptId = normalizeValue_(attemptId);
  if (!normalizedAttemptId) return null;
  const sheet = getOrCreateQuizAttemptHistorySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const match = sheet.getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(normalizedAttemptId)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  if (!match) return null;
  const values = sheet.getRange(match.getRow(), 1, 1, 11).getValues()[0];
  return {
    rowNumber: match.getRow(),
    attempt_id: normalizeValue_(values[0]),
    submitted_at: values[1],
    student_id: normalizeValue_(values[2]),
    lookup_id: normalizeLookupId_(values[3]),
    quiz_id: normalizeValue_(values[4]),
    phase: normalizePhase_(values[5]),
    score: values[6],
    total: values[7],
    passed: normalizeValue_(values[8]).toUpperCase(),
    pass_type: normalizeValue_(values[9]),
    pass_value: values[10] === null || values[10] === undefined ? '' : values[10]
  };
}

function appendQuizAttemptPhaseView_(sheet, result, lookupId) {
  const view = getQuizAttemptPhaseViews_().find((item) => item.phase === normalizePhase_(result.phase));
  if (!view || !lookupId) return;
  const lastRow = sheet.getLastRow();
  const existingRows = lastRow > 1
    ? sheet.getRange(2, view.column, lastRow - 1, 1).getDisplayValues()
    : [];
  let targetRow = 2;
  for (let index = existingRows.length - 1; index >= 0; index -= 1) {
    if (normalizeValue_(existingRows[index][0])) {
      targetRow = index + 3;
      break;
    }
  }
  sheet.getRange(targetRow, view.column, 1, 4).setValues([[
    lookupId, result.score, result.total,
    result.passed === null || result.passed === undefined ? '' : (result.passed ? 'TRUE' : 'FALSE')
  ]]);
}

function updateQuizAttemptPhaseViews_(sheet) {
  ensureSheetColumns_(sheet, 25);
  const phaseHeaders = ['lookup_id', 'score', 'total', 'passed'];
  getQuizAttemptPhaseViews_().forEach((view) => {
    sheet.getRange(1, view.column, 1, phaseHeaders.length).setValues([phaseHeaders]);
  });

  const lastRow = sheet.getLastRow();
  const existingRows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 11).getValues()
    : [];
  let dataRowCount = existingRows.length;
  while (dataRowCount > 0 && existingRows[dataRowCount - 1].every((value) => !normalizeValue_(value))) {
    dataRowCount -= 1;
  }

  const rows = existingRows.slice(0, dataRowCount);
  if (dataRowCount > 1) {
    rows.sort((left, right) => compareLookupIds_(left[3], right[3]));
    sheet.getRange(2, 1, dataRowCount, 11).setValues(rows);
  }
  const phaseRows = new Map([
    ['pre-test', []],
    ['post-test', []],
    ['score', []]
  ]);
  const passedIndex = 8;
  rows.forEach((row) => {
    const phase = normalizePhase_(row[5]);
    const records = phaseRows.get(phase);
    if (!records || !normalizeValue_(row[3])) return;
    const passedValue = normalizeValue_(row[passedIndex]).toUpperCase();
    const passed = passedValue === 'TRUE' ? 'TRUE' : (passedValue === 'FALSE' ? 'FALSE' : '');
    records.push([
      normalizeLookupId_(row[3]),
      row[6],
      row[7],
      passed
    ]);
  });

  const clearRowCount = Math.max(0, lastRow - 1);
  getQuizAttemptPhaseViews_().forEach((view) => {
    if (clearRowCount > 0) {
      sheet.getRange(2, view.column, clearRowCount, phaseHeaders.length).clearContent();
    }
    const records = phaseRows.get(view.phase);
    if (records.length > 0) {
      sheet.getRange(2, view.column, records.length, phaseHeaders.length).setValues(records);
    }
  });
}

function compareLookupIds_(leftValue, rightValue) {
  const leftId = normalizeLookupId_(leftValue);
  const rightId = normalizeLookupId_(rightValue);
  const leftIsNumeric = /^\d+$/.test(leftId);
  const rightIsNumeric = /^\d+$/.test(rightId);
  if (leftIsNumeric && rightIsNumeric) return Number(leftId) - Number(rightId);
  if (leftIsNumeric) return -1;
  if (rightIsNumeric) return 1;
  return leftId.localeCompare(rightId, 'en', { numeric: true, sensitivity: 'base' });
}

function getQuizAttemptPhaseViews_() {
  return [
    { phase: 'pre-test', column: 12 },
    { phase: 'post-test', column: 17 },
    { phase: 'score', column: 22 }
  ];
}

function hasQuizAttempt_(studentId, quizId, phase, attemptsAllowed) {
  return countQuizAttempts_(studentId, quizId, phase) >= Number(attemptsAllowed || 1);
}

function appendQuizResult_(sheet, result) {
  const headers = getQuizResultHeaders_(sheet);
  const student = findRegistrationRecord_(result.student_id || '');
  const lookupId = student ? normalizeLookupId_(student.examInfo.lookupId) : normalizeLookupId_(result.lookup_id || '');
  const rankName = student ? student.examInfo.rankName : '';
  const affiliation = student ? student.examInfo.affiliation : '';
  const email = student ? student.examInfo.email : '';
  const episode = student ? student.examInfo.formName : '';

  const studentIndex = headers.indexOf('student_id');
  const quizIndex = headers.indexOf('quiz_id');
  const rowCount = sheet.getLastRow() - 1;
  const studentIds = rowCount > 0
    ? sheet.getRange(2, studentIndex + 1, rowCount, 1).getDisplayValues()
    : [];
  const quizIds = rowCount > 0
    ? sheet.getRange(2, quizIndex + 1, rowCount, 1).getDisplayValues()
    : [];
  let existingRowNumber = 0;
  let existingRow = null;
  for (let index = 0; index < rowCount; index += 1) {
    if (normalizeValue_(studentIds[index][0]) === normalizeValue_(result.student_id)
      && normalizeValue_(quizIds[index][0]) === normalizeValue_(result.quiz_id)) {
      existingRowNumber = index + 2;
      existingRow = sheet.getRange(existingRowNumber, 1, 1, headers.length).getDisplayValues()[0];
      break;
    }
  }
  if (existingRow) {
    const submittedAtIndex = headers.indexOf('submitted_at');
    const existingTimestamp = sheet.getRange(existingRowNumber, submittedAtIndex + 1).getValue();
    const existingTime = existingTimestamp instanceof Date
      ? existingTimestamp.getTime()
      : Date.parse(normalizeValue_(existingTimestamp));
    const incomingTime = result.submitted_at instanceof Date
      ? result.submitted_at.getTime()
      : Date.parse(normalizeValue_(result.submitted_at));
    if (Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) {
      return false;
    }
  }

  const row = Array(headers.length).fill('');
  if (existingRow) {
    row.forEach((value, columnIndex) => {
      const existingValue = existingRow[columnIndex] || '';
      if (existingValue !== '') row[columnIndex] = existingValue;
    });
  }

  row[headers.indexOf('result_id')] = result.result_id;
  row[headers.indexOf('submitted_at')] = result.submitted_at;
  row[headers.indexOf('student_id')] = result.student_id;
  row[headers.indexOf('quiz_id')] = result.quiz_id;
  row[headers.indexOf('phase')] = result.phase;
  row[headers.indexOf('pass_type')] = result.pass_type;
  row[headers.indexOf('pass_value')] = result.pass_value;
  row[headers.indexOf('passed')] = result.passed === null || result.passed === undefined
    ? '' : (result.passed ? 'TRUE' : 'FALSE');
  if (result.pre_score !== '' && result.pre_score !== null && result.pre_score !== undefined) {
    row[headers.indexOf('pre_score')] = result.pre_score;
  }
  if (result.post_score !== '' && result.post_score !== null && result.post_score !== undefined) {
    row[headers.indexOf('post_score')] = result.post_score;
  }
  row[headers.indexOf('score')] = result.score ?? row[headers.indexOf('score')] ?? '';
  row[headers.indexOf('total')] = result.total ?? row[headers.indexOf('total')] ?? '';
  row[headers.indexOf('เลขที่กองกัน')] = lookupId || row[headers.indexOf('เลขที่กองกัน')] || '';
  row[headers.indexOf('ยศ-ชื่อ-สกุล')] = rankName || row[headers.indexOf('ยศ-ชื่อ-สกุล')] || '';
  row[headers.indexOf('สังกัด')] = affiliation || row[headers.indexOf('สังกัด')] || '';
  row[headers.indexOf('อีเมล')] = email || row[headers.indexOf('อีเมล')] || '';
  row[headers.indexOf('ตอนที่')] = episode || row[headers.indexOf('ตอนที่')] || '';

  const lookupColumn = headers.indexOf('เลขที่กองกัน') + 1;
  if (existingRowNumber) {
    if (studentIndex >= 0) sheet.getRange(existingRowNumber, studentIndex + 1).setNumberFormat('@');
    if (lookupColumn > 0) sheet.getRange(existingRowNumber, lookupColumn).setNumberFormat('@');
    sheet.getRange(existingRowNumber, 1, 1, headers.length).setValues([row]);
  } else {
    const newRowNumber = sheet.getLastRow() + 1;
    if (studentIndex >= 0) sheet.getRange(newRowNumber, studentIndex + 1).setNumberFormat('@');
    if (lookupColumn > 0) sheet.getRange(newRowNumber, lookupColumn).setNumberFormat('@');
    sheet.getRange(newRowNumber, 1, 1, headers.length).setValues([row]);
    sortQuizResultsSheet_(sheet, headers);
  }
  return true;
}

function sortQuizResultsSheet_(sheet, headers) {
  const lookupColumn = headers.indexOf('เลขที่กองกัน') + 1;
  const rowCount = sheet.getLastRow() - 1;
  if (lookupColumn < 1 || rowCount < 2) return;
  sheet.getRange(2, 1, rowCount, headers.length)
    .sort({ column: lookupColumn, ascending: true });
}

function findQuizMetadata_(quizId) {
  const sheet = getOrCreateQuizIndexSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index][0] !== normalizeValue_(quizId)) continue;
    const passTypeValue = normalizeValue_(rows[index][11]).toLowerCase();
    const passType = passTypeValue === 'none' ? 'none' : (passTypeValue === 'count' ? 'count' : 'percent');
    const passValue = passType === 'none' ? null : Number(rows[index][12] || rows[index][13] || 70);
    return { sheetName: rows[index][2], duration: Number(rows[index][5]) || 30,
      openAt: rows[index][6], closeAt: rows[index][7], questionCount: Number(rows[index][8]) || 1,
      attemptsAllowed: Number(rows[index][9]) || 1, phase: normalizePhase_(rows[index][10]) || 'pre-test',
      passType: passType, passValue: passValue, passScore: passValue,
      locationRestricted: rows[index][15] === 'TRUE',
      locationLatitude: normalizeValue_(rows[index][16]) === '' ? NaN : Number(rows[index][16]),
      locationLongitude: normalizeValue_(rows[index][17]) === '' ? NaN : Number(rows[index][17]),
      locationRadius: Number(rows[index][18]) || 0,
      active: rows[index][14] !== 'FALSE' };
  }
  return null;
}

function findQuizMetadataByTitle_(title, phase) {
  const requestedTitle = normalizeQuizTitle_(title);
  const requestedPhase = normalizePhase_(phase);
  if (!requestedTitle || !requestedPhase) return null;
  const sheet = getOrCreateQuizIndexSheet_();
  const rows = sheet.getDataRange().getDisplayValues();
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const savedPhase = normalizePhase_(rows[index][10]) || 'pre-test';
    const phaseMatches = requestedPhase === 'pre-post'
      ? (savedPhase === 'pre-test' || savedPhase === 'post-test')
      : savedPhase === requestedPhase;
    const passTypeValue = normalizeValue_(rows[index][11]).toLowerCase();
    const passType = passTypeValue === 'none' ? 'none' : (passTypeValue === 'count' ? 'count' : 'percent');
    const passValue = passType === 'none' ? null : Number(rows[index][12] || rows[index][13] || 70);
    if (normalizeQuizTitle_(rows[index][1]) !== requestedTitle || !phaseMatches || rows[index][14] === 'FALSE') continue;
    return { quizId: rows[index][0], title: rows[index][1], sheetName: rows[index][2],
      duration: Number(rows[index][5]) || 30, openAt: rows[index][6], closeAt: rows[index][7],
      questionCount: Number(rows[index][8]) || 1, attemptsAllowed: Number(rows[index][9]) || 1,
      phase: requestedPhase, passType: passType, passValue: passValue, passScore: passValue,
      locationRestricted: rows[index][15] === 'TRUE',
      locationLatitude: normalizeValue_(rows[index][16]) === '' ? NaN : Number(rows[index][16]),
      locationLongitude: normalizeValue_(rows[index][17]) === '' ? NaN : Number(rows[index][17]),
      locationRadius: Number(rows[index][18]) || 0,
      active: true };
  }
  return null;
}

function isQuizOpen_(quiz) {
  const now = new Date().getTime();
  const open = quiz.openAt ? new Date(quiz.openAt).getTime() : 0;
  const close = quiz.closeAt ? new Date(quiz.closeAt).getTime() : Number.MAX_SAFE_INTEGER;
  return quiz.active && !Number.isNaN(open) && !Number.isNaN(close) && now >= open && now <= close;
}

function distanceBetweenCoordinatesMeters_(latitude1, longitude1, latitude2, longitude2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDifference = radians(latitude2 - latitude1);
  const longitudeDifference = radians(longitude2 - longitude1);
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2))
    * Math.sin(longitudeDifference / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function isValidDateRange_(openAt, closeAt) {
  if (!openAt || !closeAt) return false;
  const open = new Date(openAt).getTime();
  const close = new Date(closeAt).getTime();
  return !Number.isNaN(open) && !Number.isNaN(close) && close > open;
}

function normalizePhase_(phase) {
  const value = normalizeValue_(phase).toLowerCase().replace(/\s+/g, '');
  if (value === 'pre-test' || value === 'pretest' || value === 'ก่อนเรียน' || value === 'pre') return 'pre-test';
  if (value === 'post-test' || value === 'posttest' || value === 'หลังเรียน' || value === 'post') return 'post-test';
  if (value === 'pre-post' || value === 'prepost' || value === 'ก่อนเรียนและหลังเรียน' || value === 'beforeafter' || value === 'before-after') return 'pre-post';
  if (value === 'score' || value === 'score-test' || value === 'สอบเก็บคะแนน' || value === 'เก็บคะแนน') return 'score';
  if (value === 'midterm' || value === 'mid-term' || value === 'midtermexam' || value === 'สอบกลางภาค' || value === 'กลางภาค') return 'midterm';
  if (value === 'final' || value === 'finalexam' || value === 'สอบปลายภาค' || value === 'ปลายภาค') return 'final';
  return '';
}

function formatPhaseLabel_(phase) {
  const labels = {
    'pre-test': 'ก่อนเรียน',
    'post-test': 'หลังเรียน',
    'pre-post': 'ก่อนเรียนและหลังเรียน',
    'score': 'สอบเก็บคะแนน',
    'midterm': 'สอบกลางภาค',
    'final': 'สอบปลายภาค'
  };
  return labels[String(phase || '')] || String(phase || '');
}

function normalizeQuizTitle_(title) {
  return normalizeValue_(title)
    .replace(/^เรื่อง\s*/i, '')
    .replace(/\s+/g, '')
    .trim();
}

function shuffleServer_(items) {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function shuffleForSeed_(items, seedText) {
  const shuffled = items.slice();
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  ensureSheetColumns_(sheet, headers.length);
  const headerValues = sheet.getLastRow() === 0
    ? headers.map(() => '')
    : sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  headers.forEach((header, index) => {
    if (normalizeValue_(headerValues[index]) === '') {
      sheet.getRange(1, index + 1).setValue(header).setFontWeight('bold');
    }
  });
  return sheet;
}

function ensureSheetColumns_(sheet, columnCount) {
  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
  }
}

function hashPassword_(password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return bytes.map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0')).join('');
}

function saveAttendance_(data) {
  const registrationId = normalizeValue_(data.registrationId);
  const attendanceFormName = normalizeValue_(data.attendanceFormName);
  const attendanceSubject = normalizeValue_(data.attendanceSubject);

  if (!/^\d{13}$/.test(registrationId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณาระบุหมายเลขประจำตัวให้ครบ 13 หลัก'
    });
  }

  const source = findDataAttendanceStudent_(registrationId);
  if (!source) {
    return jsonResponse_({
      ok: false,
      message: 'ไม่พบหมายเลขประจำตัวในคอลัมน์ F ของชีต Data'
    });
  }
  if (source.ambiguous) {
    return jsonResponse_({
      ok: false,
      message: 'พบหมายเลขประจำตัวซ้ำในคอลัมน์ F ของชีต Data กรุณาแจ้งผู้ดูแลตรวจสอบ'
    });
  }

  const dataSheet = getSourceSheet_();
  const attendanceColumns = ensureDataAttendanceColumns_(dataSheet);
  const existingAttendance = getDataAttendanceRecord_(dataSheet, source.rowNumber, attendanceColumns);
  const attendanceFormulas = dataSheet.getRange(
    source.rowNumber,
    9,
    1,
    CONFIG.dataAttendanceHeaders.length
  ).getFormulas()[0];
  if (existingAttendance.some((value) => value !== '') || attendanceFormulas.some(Boolean)) {
    return jsonResponse_({
      ok: false,
      code: 'DUPLICATE_ATTENDANCE',
      message: 'ท่านได้ลงทะเบียนแล้ว'
    });
  }

  if (!/^ครั้งที่ [1-4]$/.test(attendanceFormName)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณาเลือกครั้งที่ 1-4'
    });
  }
  if (CONFIG.attendanceSubjects.indexOf(attendanceSubject) === -1) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณาเลือกเรื่องจากรายการ'
    });
  }

  const registeredAt = new Date().toISOString();
  appendDataAttendanceRecord_(
    dataSheet,
    source.rowNumber,
    existingAttendance,
    [registeredAt, attendanceSubject, attendanceFormName]
  );
  updateLearningSummaryAfterSourceWrite_(() => {
    syncLearningSummaryAttendance_(CONFIG.registrationHeaders, source.values, registeredAt);
  });
  return jsonResponse_({
    ok: true,
    registrationId: registrationId,
    message: 'บันทึกข้อมูลเรียบร้อยแล้ว'
  });
}

function setupRegistrationSheet() {
  const sheet = getOrCreateRegistrationSheet_();
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, CONFIG.registrationHeaders.length);
  normalizeAllLookupIds();
  sortRegistrationSheet_(sheet);
  return 'Registration sheet is ready.';
}

function migrateRegistrationToData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const registrationSheet = getRegistrationSpreadsheet_().getSheetByName(CONFIG.registrationSheetName);
    if (!registrationSheet) throw new Error('ไม่พบชีต Registration');
    if (registrationSheet.getLastColumn() < 1 || registrationSheet.getLastRow() < 2) {
      return 'ไม่พบข้อมูลสำหรับย้ายในชีต Registration';
    }
    const dataSheet = getSourceSheet_();
    const dataColumns = ensureDataRegistrationColumns_(dataSheet);
    const registrationValues = registrationSheet.getDataRange().getValues();
    const registrationHeaders = registrationSheet.getRange(1, 1, 1, registrationSheet.getLastColumn())
      .getDisplayValues()[0].map((header) => normalizeValue_(header).toLowerCase());
    const registrationIndexes = {
      registrationId: registrationHeaders.indexOf('registration_id'),
      registeredAt: registrationHeaders.indexOf('registered_at'),
      lookupId: registrationHeaders.indexOf('lookup_id'),
      email: registrationHeaders.indexOf('email'),
      episode: registrationHeaders.indexOf('episode')
    };
    if (Object.keys(registrationIndexes).some((key) => registrationIndexes[key] < 0)) {
      throw new Error('หัวคอลัมน์ใน Registration ไม่ครบ กรุณาตรวจสอบก่อนย้ายข้อมูล');
    }

    const dataLastRow = dataSheet.getLastRow();
    const dataWidth = Math.max(4, dataSheet.getLastColumn());
    const dataValues = dataLastRow > 0
      ? dataSheet.getRange(1, 1, dataLastRow, dataWidth).getValues()
      : [];
    const dataLookupIds = dataLastRow > 1
      ? dataSheet.getRange(2, 1, dataLastRow - 1, 1).getDisplayValues()
      : [];
    const dataRowsByLookup = new Map();
    dataLookupIds.forEach((row, index) => {
      const lookupId = normalizeLookupId_(row[0]);
      if (!lookupId) return;
      if (!dataRowsByLookup.has(lookupId)) dataRowsByLookup.set(lookupId, []);
      dataRowsByLookup.get(lookupId).push(index + 2);
    });

    const report = {
      migrated: 0,
      alreadyPresent: 0,
      noDataMatch: 0,
      duplicateRegistrationLookup: 0,
      duplicateDataLookup: 0,
      conflictingData: 0,
      invalidRegistration: 0
    };
    const registrationsByLookup = new Map();
    registrationValues.slice(1).forEach((row) => {
      const lookupId = normalizeLookupId_(row[registrationIndexes.lookupId]);
      const registrationId = normalizeValue_(row[registrationIndexes.registrationId]).replace(/^'/, '');
      const email = normalizeValue_(row[registrationIndexes.email]);
      const episode = normalizeValue_(row[registrationIndexes.episode]);
      if (!lookupId || !registrationId || !isValidEmail_(email)
        || !/^ตอนที่ (?:[1-9]|1[0-8])$/.test(episode)) {
        if (row.some((value) => normalizeValue_(value))) report.invalidRegistration += 1;
        if (lookupId) {
          if (!registrationsByLookup.has(lookupId)) registrationsByLookup.set(lookupId, []);
          registrationsByLookup.get(lookupId).push({ valid: false });
        }
        return;
      }
      if (!registrationsByLookup.has(lookupId)) registrationsByLookup.set(lookupId, []);
      registrationsByLookup.get(lookupId).push({
        valid: true,
        email: email,
        registrationId: registrationId,
        episode: episode,
        registeredAt: row[registrationIndexes.registeredAt]
      });
    });

    const pendingUpdates = [];
    registrationsByLookup.forEach((registrations, lookupId) => {
      if (registrations.length !== 1) {
        report.duplicateRegistrationLookup += registrations.length;
        return;
      }
      const registration = registrations[0];
      if (!registration.valid) return;
      const matches = dataRowsByLookup.get(lookupId) || [];
      if (!matches.length) {
        report.noDataMatch += 1;
        return;
      }
      if (matches.length !== 1) {
        report.duplicateDataLookup += 1;
        return;
      }

      const dataRow = matches[0];
      const sourceValues = [
        registration.email,
        registration.registrationId,
        registration.episode,
        registration.registeredAt
      ];
      const targetColumns = [
        dataColumns.email,
        dataColumns.registrationId,
        dataColumns.episode,
        dataColumns.registeredAt
      ];
      const currentValues = targetColumns.map((column) => dataValues[dataRow - 1][column - 1]);
      const conflicts = sourceValues.some((sourceValue, index) =>
        normalizeValue_(sourceValue) !== ''
        && normalizeValue_(currentValues[index]) !== ''
        && !(index === 0
          ? normalizeValue_(sourceValue).toLowerCase() === normalizeValue_(currentValues[index]).toLowerCase()
          : areRegistrationValuesEqual_(sourceValue, currentValues[index], index === 3)));
      if (conflicts) {
        report.conflictingData += 1;
        return;
      }

      const valuesToWrite = sourceValues.map((sourceValue, index) =>
        normalizeValue_(currentValues[index]) === '' ? sourceValue : currentValues[index]);
      if (valuesToWrite.every((value, index) =>
        normalizeValue_(value) === normalizeValue_(currentValues[index]))) {
        report.alreadyPresent += 1;
        return;
      }
      pendingUpdates.push({ rowNumber: dataRow, values: valuesToWrite });
    });

    if (pendingUpdates.length) {
      const firstRow = Math.min.apply(null, pendingUpdates.map((item) => item.rowNumber));
      const lastRow = Math.max.apply(null, pendingUpdates.map((item) => item.rowNumber));
      const columnGroups = groupContiguousColumns_([
        dataColumns.email,
        dataColumns.registrationId,
        dataColumns.episode,
        dataColumns.registeredAt
      ]);
      const columnWrites = [];
      columnGroups.forEach((group) => {
        const range = dataSheet.getRange(firstRow, group.start, lastRow - firstRow + 1, group.columns.length);
        const existingValues = range.getValues();
        const formulas = range.getFormulas();
        if (formulas.some((row) => row.some(Boolean))) {
          throw new Error('พบสูตรในคอลัมน์ข้อมูลลงทะเบียนของชีต Data กรุณาตรวจสอบก่อนย้ายข้อมูล');
        }
        pendingUpdates.forEach((update) => {
          const rowIndex = update.rowNumber - firstRow;
          group.columns.forEach((column, groupIndex) => {
            const registrationIndex = [
              dataColumns.email,
              dataColumns.registrationId,
              dataColumns.episode,
              dataColumns.registeredAt
            ].indexOf(column);
            const incomingValue = update.values[registrationIndex];
            if (normalizeValue_(existingValues[rowIndex][groupIndex]) === ''
              && normalizeValue_(incomingValue) !== '') {
              existingValues[rowIndex][groupIndex] = incomingValue;
            }
          });
        });
        columnWrites.push({ range: range, values: existingValues });
      });
      columnWrites.forEach((write) => write.range.setValues(write.values));
      report.migrated = pendingUpdates.length;
    }

    const result = [
      'ย้ายข้อมูล Registration ไป Data เสร็จแล้ว',
      'ย้ายใหม่: ' + report.migrated,
      'มีข้อมูลอยู่แล้ว: ' + report.alreadyPresent,
      'ไม่พบเลขที่ใน Data: ' + report.noDataMatch,
      'เลขค้นหาซ้ำใน Registration (ข้าม): ' + report.duplicateRegistrationLookup,
      'เลขค้นหาซ้ำใน Data (ข้าม): ' + report.duplicateDataLookup,
      'ข้อมูลปลายทางขัดแย้ง (ข้าม): ' + report.conflictingData,
      'ข้อมูล Registration ไม่ครบ (ข้าม): ' + report.invalidRegistration
    ].join('\n');
    Logger.log(result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function migrateAttendanceToData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getRegistrationSpreadsheet_();
    const attendanceSheet = spreadsheet.getSheetByName(CONFIG.attendanceSheetName);
    if (!attendanceSheet || attendanceSheet.getLastRow() < 2) {
      return 'ไม่พบข้อมูลสำหรับย้ายในชีต Attendance';
    }

    const dataSheet = getSourceSheet_();
    const dataColumns = getDataRegistrationColumns_(dataSheet);
    if (dataColumns.registrationId !== 6) {
      throw new Error('คอลัมน์ F ของชีต Data ต้องเป็น registration_id ก่อนย้ายข้อมูล Attendance');
    }
    const attendanceColumns = ensureDataAttendanceColumns_(dataSheet);
    const dataLastRow = dataSheet.getLastRow();
    const dataValues = dataSheet.getRange(1, 1, dataLastRow, dataSheet.getLastColumn()).getDisplayValues();
    const dataAttendanceRange = dataLastRow > 1
      ? dataSheet.getRange(2, 9, dataLastRow - 1, CONFIG.dataAttendanceHeaders.length)
      : null;
    const dataAttendanceValues = dataAttendanceRange
      ? dataAttendanceRange.getDisplayValues().map((row) => row.map((value) => normalizeValue_(value)))
      : [];
    const dataAttendanceFormulas = dataAttendanceRange
      ? dataAttendanceRange.getFormulas()
      : [];
    const dataRowsByRegistrationId = new Map();
    dataValues.slice(1).forEach((row, index) => {
      const registrationId = normalizeValue_(row[5]).replace(/^'/, '');
      if (!registrationId) return;
      if (!dataRowsByRegistrationId.has(registrationId)) {
        dataRowsByRegistrationId.set(registrationId, []);
      }
      dataRowsByRegistrationId.get(registrationId).push(index + 2);
    });

    const attendanceValues = attendanceSheet.getDataRange().getDisplayValues();
    const attendanceHeaders = attendanceValues[0].map((header) => normalizeValue_(header).toLowerCase());
    const indexes = {
      registrationId: attendanceHeaders.indexOf('registration_id'),
      registeredAt: attendanceHeaders.indexOf('registered_at'),
      formName: attendanceHeaders.indexOf('form_name'),
      attendanceFormName: attendanceHeaders.indexOf('attendance_form_name')
    };
    if (Object.keys(indexes).some((key) => indexes[key] < 0)) {
      throw new Error('หัวคอลัมน์ใน Attendance ไม่ครบ ต้องมี registration_id, registered_at, form_name และ attendance_form_name');
    }

    const report = {
      migrated: 0,
      alreadyPresent: 0,
      noDataMatch: 0,
      duplicateDataId: 0,
      duplicateAttendance: 0,
      invalidAttendance: 0
    };
    const rowsToUpdate = new Map();
    const seenAttendance = new Set();
    attendanceValues.slice(1).forEach((row) => {
      const registrationId = normalizeValue_(row[indexes.registrationId]).replace(/^'/, '');
      const registeredAt = normalizeValue_(row[indexes.registeredAt]);
      const formName = normalizeValue_(row[indexes.formName]);
      const attendanceFormName = normalizeValue_(row[indexes.attendanceFormName]);
      if (!registrationId && !registeredAt && !formName && !attendanceFormName) return;
      if (!/^\d{13}$/.test(registrationId)
        || !registeredAt
        || CONFIG.attendanceSubjects.indexOf(formName) < 0
        || !/^ครั้งที่ [1-4]$/.test(attendanceFormName)) {
        report.invalidAttendance += 1;
        return;
      }

      const eventKey = registrationId + ':' + formName + ':' + attendanceFormName;
      if (seenAttendance.has(eventKey)) {
        report.duplicateAttendance += 1;
        return;
      }
      seenAttendance.add(eventKey);

      const dataRows = dataRowsByRegistrationId.get(registrationId) || [];
      if (!dataRows.length) {
        report.noDataMatch += 1;
        return;
      }
      if (dataRows.length !== 1) {
        report.duplicateDataId += 1;
        return;
      }
      const rowNumber = dataRows[0];
      if (!rowsToUpdate.has(rowNumber)) {
        const current = CONFIG.dataAttendanceHeaders.map((header) =>
          dataAttendanceValues[rowNumber - 2][attendanceColumns.get(header) - 9]);
        rowsToUpdate.set(rowNumber, {
          current: current,
          records: [],
          seen: getAttendanceRecordKeys_(current)
        });
      }
      const update = rowsToUpdate.get(rowNumber);
      const recordKey = getAttendanceRecordKey_(formName, attendanceFormName);
      if (update.seen.has(recordKey)) {
        report.alreadyPresent += 1;
        return;
      }
      update.seen.add(recordKey);
      update.records.push([registeredAt, formName, attendanceFormName]);
    });

    const changedRows = [];
    rowsToUpdate.forEach((update, rowNumber) => {
      if (!update.records.length) return;
      const rowIndex = rowNumber - 2;
      if (dataAttendanceFormulas[rowIndex].some(Boolean)) {
        throw new Error('พบสูตรในคอลัมน์ I:K ของชีต Data กรุณาตรวจสอบก่อนย้ายข้อมูล');
      }
      let values = update.current;
      update.records.forEach((record) => {
        values = values.map((value, index) =>
          value ? value + '\n' + record[index] : record[index]);
      });
      changedRows.push({ rowNumber: rowNumber, values: values });
      report.migrated += update.records.length;
    });

    changedRows.sort((left, right) => left.rowNumber - right.rowNumber);
    for (let index = 0; index < changedRows.length;) {
      const first = index;
      while (index + 1 < changedRows.length
        && changedRows[index + 1].rowNumber === changedRows[index].rowNumber + 1) {
        index += 1;
      }
      const rows = changedRows.slice(first, index + 1);
      dataSheet.getRange(rows[0].rowNumber, 9, rows.length, CONFIG.dataAttendanceHeaders.length)
        .setNumberFormat('@')
        .setValues(rows.map((row) => row.values));
      index += 1;
    }

    const result = [
      'ย้ายข้อมูล Attendance ไป Data เสร็จแล้ว',
      'ย้ายใหม่: ' + report.migrated,
      'มีข้อมูลอยู่แล้ว: ' + report.alreadyPresent,
      'ไม่พบเลขประจำตัวใน Data: ' + report.noDataMatch,
      'เลขประจำตัวซ้ำใน Data (ข้าม): ' + report.duplicateDataId,
      'รายการ Attendance ซ้ำ (ข้าม): ' + report.duplicateAttendance,
      'ข้อมูล Attendance ไม่ครบหรือไม่ถูกต้อง (ข้าม): ' + report.invalidAttendance
    ].join('\n');
    Logger.log(result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function normalizeAllLookupIds() {
  const spreadsheet = getRegistrationSpreadsheet_();
  normalizeLookupColumnsByName_(spreadsheet.getSheetByName(CONFIG.registrationSheetName));
  normalizeLookupColumnsByName_(spreadsheet.getSheetByName(CONFIG.attendanceSheetName));
  normalizeLookupColumnsByName_(spreadsheet.getSheetByName('QuizResults'));
  return 'Lookup IDs normalized to 4 digits.';
}

function normalizeLookupColumnsByName_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const columns = ['lookup_id', 'data_column_a'].map((name) => headers.indexOf(name) + 1)
    .filter((column) => column > 0);
  columns.forEach((column) => {
    const rowCount = sheet.getLastRow() - 1;
    const range = sheet.getRange(2, column, rowCount, 1);
    range.setNumberFormat('@');
    range.setValues(range.getDisplayValues().map((row) => [normalizeLookupId_(row[0])]));
  });
}

function authorizeMailApp() {
  MailApp.sendEmail(
    CONFIG.approvalEmail,
    'ทดสอบระบบส่งอีเมล Tactical Studies Section',
    'ระบบส่งอีเมลได้รับอนุญาตและพร้อมใช้งานแล้ว'
  );
  return 'Test email sent.';
}

function resendTeacherApprovalEmail(applicationId) {
  const requestedId = normalizeValue_(applicationId);
  if (!requestedId) throw new Error('กรุณาระบุรหัสคำขอ เช่น resendTeacherApprovalEmail("T175...")');
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), CONFIG.teacherApplicationsSheetName, [
    'application_id', 'submitted_at', 'teacher_name', 'email', 'password_hash', 'status', 'approval_token'
  ]);
  const rows = sheet.getDataRange().getDisplayValues();
  const row = rows.slice(1).find((item) => normalizeValue_(item[0]) === requestedId);
  if (!row) throw new Error('ไม่พบคำขอสมัครครู ' + requestedId);
  if (normalizeValue_(row[5]).toUpperCase() !== 'PENDING') throw new Error('คำขอนี้ไม่ได้อยู่ในสถานะ PENDING');
  if (!normalizeValue_(row[6])) throw new Error('คำขอนี้ไม่มี approval token');
  const approvalUrl = CONFIG.webAppUrl + '?action=approve-teacher&token=' + encodeURIComponent(row[6]);
  MailApp.sendEmail(CONFIG.approvalEmail, 'มีคำขอสมัครครูใหม่',
    `มีคำขอสมัครครูใหม่\nรหัส: ${row[0]}\nชื่อ: ${row[2]}\nอีเมล: ${row[3]}\n\nกดลิงก์นี้เพื่ออนุมัติ:\n${approvalUrl}`,
    { htmlBody: buildApprovalEmailHtml_(row[0], row[2], row[3], approvalUrl) });
  return 'Approval email resent: ' + requestedId;
}

function buildApprovalEmailHtml_(applicationId, teacherName, email, approvalUrl) {
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));
  return `
    <div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#172033">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dfe6ef;border-radius:16px;overflow:hidden">
        <div style="background:#123b5d;padding:28px 32px;color:#ffffff">
          <div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.8">Tactical Studies Section</div>
          <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25">คำขอสมัครสมาชิกครู</h1>
        </div>
        <div style="padding:28px 32px">
          <p style="margin:0 0 20px;font-size:16px">มีคำขอสมัครครูใหม่รอการอนุมัติ</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:15px">
            <tr><td style="padding:9px 0;color:#667085">รหัสคำขอ</td><td style="padding:9px 0;font-weight:bold">${escapeHtml(applicationId)}</td></tr>
            <tr><td style="padding:9px 0;color:#667085">ชื่อ</td><td style="padding:9px 0;font-weight:bold">${escapeHtml(teacherName)}</td></tr>
            <tr><td style="padding:9px 0;color:#667085">อีเมล</td><td style="padding:9px 0">${escapeHtml(email)}</td></tr>
          </table>
          <a href="${escapeHtml(approvalUrl)}" style="display:inline-block;padding:13px 24px;border-radius:8px;background:#16845b;color:#ffffff;text-decoration:none;font-weight:bold">อนุมัติคำขอ</a>
          <p style="margin:24px 0 0;color:#667085;font-size:12px;line-height:1.6">หากปุ่มไม่ทำงาน ให้เปิดลิงก์อนุมัติจากข้อความแบบ plain text ในอีเมล</p>
        </div>
      </div>
    </div>`;
}

function setupTacticalScoreSystem() {
  const spreadsheet = getRegistrationSpreadsheet_();
  const sheet = spreadsheet.getSheetByName('ScooreT');
  if (!sheet) throw new Error('ไม่พบชีต ScooreT ใน Spreadsheet ที่ตั้งค่าไว้');
  ensureSheetColumns_(sheet, 30);
  const headers = sheet.getRange(1, 1, 1, 29).getDisplayValues()[0];
  if (headers.every((value) => !normalizeValue_(value))) {
    const scoreHeaders = ['เลขที่', 'ชื่อ', 'สังกัด'];
    for (let index = 1; index <= 25; index += 1) scoreHeaders.push('คะแนน ' + index);
    scoreHeaders.push('รวมคะแนน');
    sheet.getRange(1, 1, 1, scoreHeaders.length).setValues([scoreHeaders]).setFontWeight('bold');
  }

  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'rotateTacticalScoreAccessCode')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('rotateTacticalScoreAccessCode').timeBased().everyDays(1).create();
  writeNewTacticalScoreAccessCode_();
  return 'Tactical score entry is ready.';
}

function rotateTacticalScoreAccessCode() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    writeNewTacticalScoreAccessCode_();
  } finally {
    lock.releaseLock();
  }
}

function getTacticalScoreSheet_() {
  const sheet = getRegistrationSpreadsheet_().getSheetByName('ScooreT');
  if (!sheet) throw new Error('ไม่พบชีต ScooreT ใน Spreadsheet ที่ตั้งค่าไว้');
  ensureSheetColumns_(sheet, 30);
  return sheet;
}

function writeNewTacticalScoreAccessCode_() {
  const sheet = getTacticalScoreSheet_();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  sheet.getRange('AD2').setNumberFormat('@').setValue(code);
  PropertiesService.getScriptProperties().setProperty('TACTICAL_SCORE_CODE_CREATED_AT', String(Date.now()));
  return code;
}

function getCurrentTacticalScoreAccessCode_() {
  const properties = PropertiesService.getScriptProperties();
  const createdAt = Number(properties.getProperty('TACTICAL_SCORE_CODE_CREATED_AT') || 0);
  if (!createdAt || Date.now() - createdAt >= 24 * 60 * 60 * 1000) {
    return writeNewTacticalScoreAccessCode_();
  }

  const code = normalizeValue_(getTacticalScoreSheet_().getRange('AD2').getDisplayValue());
  if (!/^\d{6}$/.test(code)) return writeNewTacticalScoreAccessCode_();
  return code;
}

function validateTacticalScoreCode_(submittedCode) {
  const code = normalizeValue_(submittedCode);
  const currentCode = getCurrentTacticalScoreAccessCode_();
  if (!/^\d{6}$/.test(code) || code !== currentCode) {
    return jsonResponse_({ ok: false, message: 'รหัสการใช้งานไม่ถูกต้อง กรุณาตรวจสอบรหัสแล้วลองอีกครั้ง' });
  }
  return jsonResponse_({ ok: true, message: 'ยืนยันรหัสเรียบร้อยแล้ว' });
}

function submitTacticalScores_(data) {
  const submittedCode = normalizeValue_(data.accessCode);
  const currentCode = getCurrentTacticalScoreAccessCode_();
  if (!/^\d{6}$/.test(submittedCode) || submittedCode !== currentCode) {
    return jsonResponse_({ ok: false, message: 'รหัสการใช้งานไม่ถูกต้องหรือหมดอายุ กรุณาเริ่มใหม่' });
  }

  let entries;
  try {
    entries = JSON.parse(data.entries || '[]');
  } catch (error) {
    entries = null;
  }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 12) {
    return jsonResponse_({ ok: false, message: 'กรุณากรอกข้อมูลตั้งแต่ 1 ถึง 12 คน' });
  }

  const sheet = getTacticalScoreSheet_();
  const lastSheetRow = sheet.getLastRow();
  const studentRows = new Map();
  if (lastSheetRow > 1) {
    sheet.getRange(2, 1, lastSheetRow - 1, 29).getDisplayValues().forEach((row, index) => {
      const existingId = normalizeValue_(row[0]);
      if (existingId) {
        const existing = studentRows.get(existingId);
        const hasScores = row.slice(3, 29).some((value) => normalizeValue_(value) !== '');
        if (existing) {
          existing.hasScores = existing.hasScores || hasScores;
        } else {
          studentRows.set(existingId, {
            rowNumber: index + 2,
            hasScores: hasScores
          });
        }
      }
    });
  }

  const seenIds = new Set();
  const rows = [];
  for (const entry of entries) {
    const lookupId = normalizeValue_(entry && entry.lookupId);
    if (!/^\d{4}$/.test(lookupId) || seenIds.has(lookupId)) {
      return jsonResponse_({ ok: false, message: 'เลขที่ต้องเป็นตัวเลข 4 หลักและห้ามซ้ำกัน' });
    }
    const existing = studentRows.get(lookupId);
    if (!existing) {
      return jsonResponse_({ ok: false, message: 'ไม่พบเลขที่ ' + lookupId + ' ในชีต ScooreT' });
    }
    if (existing.hasScores) {
      return jsonResponse_({ ok: false, message: 'เลขที่ ' + lookupId + ' มีบันทึกคะแนนแล้ว ไม่สามารถบันทึกซ้ำได้' });
    }
    seenIds.add(lookupId);

    const student = findStudentRecord_(lookupId);
    if (!student) return jsonResponse_({ ok: false, message: 'ไม่พบเลขที่ ' + lookupId + ' ในชีต Data' });
    if (student.ambiguous) return jsonResponse_({ ok: false, message: 'พบเลขที่ ' + lookupId + ' ซ้ำในชีต Data กรุณาแจ้งผู้ดูแล' });
    if (!Array.isArray(entry.scores) || entry.scores.length !== 25) {
      return jsonResponse_({ ok: false, message: 'ข้อมูลคะแนนต้องมี 25 ช่องต่อคน' });
    }

    let total = 0;
    const scores = [];
    for (const rawScore of entry.scores) {
      if (normalizeValue_(rawScore) === '') {
        scores.push('');
        continue;
      }
      const score = Number(rawScore);
      if (!Number.isFinite(score) || score < 0) {
        return jsonResponse_({ ok: false, message: 'คะแนนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' });
      }
      total += score;
      scores.push(score);
    }
    if (scores.filter((score) => score !== '').length < 24) {
      return jsonResponse_({
        ok: false,
        message: 'กรุณากรอกคะแนนอย่างน้อย 24 จาก 25 ช่อง สำหรับเลขที่ ' + lookupId
      });
    }
    if (total > 200) {
      return jsonResponse_({ ok: false, message: 'คะแนนรวมของเลขที่ ' + lookupId + ' ต้องไม่เกิน 200 คะแนน' });
    }

    rows.push({ existingRow: existing.rowNumber, lookupId: lookupId, scores: scores.concat([total]) });
  }

  rows.forEach((entry) => {
    sheet.getRange(entry.existingRow, 4, 1, 26).setValues([entry.scores]);
  });
  updateLearningSummaryAfterSourceWrite_(() => {
    rows.forEach((entry) => syncLearningSummaryScoresByLookupId_(entry.lookupId, {
      specialTask: entry.scores[25]
    }));
  });
  return jsonResponse_({ ok: true, saved: rows.length, message: 'บันทึกคะแนนเรียบร้อยแล้ว' });
}

function getSpecialAssessmentHeaders_() {
  return [
    'assessment_id', 'created_at', 'title', 'sheet_name', 'record_count',
    'score_count', 'max_total', 'requires_code', 'access_code', 'created_by', 'active'
  ];
}

function getOrCreateSpecialAssessmentIndex_() {
  return getOrCreateSheet_(
    getRegistrationSpreadsheet_(),
    CONFIG.specialAssessmentIndexSheetName,
    getSpecialAssessmentHeaders_()
  );
}

function listSpecialAssessments_() {
  const rows = getOrCreateSpecialAssessmentIndex_().getDataRange().getDisplayValues().slice(1)
    .filter((row) => row[10] !== 'FALSE')
    .map((row) => ({
      assessmentId: row[0],
      title: row[2],
      recordCount: Number(row[4]),
      scoreCount: Number(row[5]),
      maxTotal: Number(row[6]),
      requiresCode: row[7] === 'TRUE'
    }));
  return jsonResponse_({ ok: true, assessments: rows });
}

function listAnnouncementGalleryImages_() {
  const files = DriveApp.getFolderById(CONFIG.announcementGalleryFolderId).getFiles();
  const images = [];

  while (files.hasNext()) {
    const file = files.next();
    if (!file.getMimeType().startsWith('image/')) continue;
    images.push({
      id: file.getId(),
      name: file.getName()
    });
  }

  images.sort((left, right) => left.name.localeCompare(right.name, 'th', {
    numeric: true,
    sensitivity: 'base'
  }));

  return jsonResponse_({ ok: true, images });
}

function getOrCreateAnnouncementsSheet_() {
  return getOrCreateSheet_(
    getRegistrationSpreadsheet_(),
    CONFIG.announcementsSheetName,
    CONFIG.announcementHeaders
  );
}

function listAnnouncements_() {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(30000);
    locked = true;
    const sheet = getOrCreateAnnouncementsSheet_();
    deleteExpiredAnnouncementsFromSheet_(sheet, new Date());
    if (sheet.getLastRow() < 2) return jsonResponse_({ ok: true, announcements: [] });

    const now = new Date();
    const announcements = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.announcementHeaders.length)
      .getValues()
      .map((row) => ({
        id: normalizeValue_(row[0]),
        title: normalizeValue_(row[1]),
        startAt: row[2] instanceof Date ? row[2] : new Date(row[2]),
        endAt: row[3] instanceof Date ? row[3] : new Date(row[3]),
        content: normalizeValue_(row[4]),
        icon: normalizeValue_(row[5]) || '📢',
        createdAt: row[6] instanceof Date ? row[6] : new Date(row[6])
      }))
      .filter((item) => item.id && item.title && item.content
        && !isNaN(item.startAt.getTime()) && !isNaN(item.endAt.getTime())
        && item.startAt <= now && item.endAt > now)
      .sort((left, right) => right.startAt - left.startAt || right.createdAt - left.createdAt)
      .map((item) => ({
        id: item.id,
        title: item.title,
        startAt: item.startAt.toISOString(),
        endAt: item.endAt.toISOString(),
        content: item.content,
        icon: item.icon,
        isNew: now.getTime() - item.startAt.getTime() < 7 * 24 * 60 * 60 * 1000
      }));

    return jsonResponse_({ ok: true, announcements: announcements });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function createAnnouncement_(data) {
  const teacherEmail = CacheService.getScriptCache().get('teacher:' + normalizeValue_(data.token));
  if (!teacherEmail) return jsonResponse_({ ok: false, message: 'กรุณาเข้าสู่ระบบครูใหม่' });

  const title = normalizeValue_(data.title);
  const content = normalizeValue_(data.content);
  const icon = normalizeValue_(data.icon) || '📢';
  const startAt = parseAnnouncementDate_(data.startAt);
  const endAt = parseAnnouncementDate_(data.endAt);
  if (!title || title.length > 150 || !content || content.length > 5000
    || icon.length > 12 || !startAt || !endAt || endAt <= startAt
    || startAt.getTime() < Date.now() - 60000) {
    return jsonResponse_({ ok: false, message: 'กรุณาตรวจสอบชื่อเรื่อง วันเริ่ม/สิ้นสุด และเนื้อหาประกาศ' });
  }

  const teachersSheet = getRegistrationSpreadsheet_().getSheetByName(CONFIG.teachersSheetName);
  const activeTeacher = teachersSheet && teachersSheet.getLastRow() > 1
    && teachersSheet.getDataRange().getDisplayValues().slice(1).some((row) =>
      normalizeValue_(row[3]).toLowerCase() === teacherEmail.toLowerCase()
      && normalizeValue_(row[5]).toUpperCase() === 'ACTIVE');
  if (!activeTeacher) return jsonResponse_({ ok: false, message: 'บัญชีครูนี้ไม่ได้รับอนุมัติหรือปิดใช้งานแล้ว' });

  ensureAnnouncementCleanupTrigger_();
  const sheet = getOrCreateAnnouncementsSheet_();
  deleteExpiredAnnouncementsFromSheet_(sheet, new Date());
  const nextRow = sheet.getLastRow() + 1;
  [2, 5, 6, 8].forEach((column) => sheet.getRange(nextRow, column).setNumberFormat('@'));
  sheet.getRange(nextRow, 1, 1, CONFIG.announcementHeaders.length).setValues([[
    'A' + Utilities.getUuid(),
    title,
    startAt,
    endAt,
    content,
    icon,
    new Date(),
    teacherEmail
  ]]);
  return jsonResponse_({ ok: true, message: 'บันทึกประกาศเรียบร้อยแล้ว' });
}

function parseAnnouncementDate_(value) {
  const dateText = normalizeValue_(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dateText)) return null;
  const date = new Date(dateText + ':00+07:00');
  if (isNaN(date.getTime())
    || Utilities.formatDate(date, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm") !== dateText) return null;
  return date;
}

function deleteExpiredAnnouncementsFromSheet_(sheet, now) {
  if (sheet.getLastRow() < 2) return 0;
  const endDates = sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getValues();
  let deleted = 0;
  for (let index = endDates.length - 1; index >= 0; index -= 1) {
    const endAt = endDates[index][0] instanceof Date ? endDates[index][0] : new Date(endDates[index][0]);
    if (isNaN(endAt.getTime())) throw new Error('พบวันสิ้นสุดประกาศที่ไม่ถูกต้องในชีต');
    if (endAt <= now) {
      sheet.deleteRow(index + 2);
      deleted += 1;
    }
  }
  return deleted;
}

function cleanupExpiredAnnouncements_() {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(30000);
    locked = true;
    return deleteExpiredAnnouncementsFromSheet_(getOrCreateAnnouncementsSheet_(), new Date());
  } finally {
    if (locked) lock.releaseLock();
  }
}

function ensureAnnouncementCleanupTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some((trigger) =>
    trigger.getHandlerFunction() === 'cleanupExpiredAnnouncements_');
  if (!exists) {
    ScriptApp.newTrigger('cleanupExpiredAnnouncements_').timeBased().everyHours(1).create();
  }
}

function setupAnnouncementCleanup() {
  ensureAnnouncementCleanupTrigger_();
  return 'ตั้งค่างานลบประกาศที่หมดอายุเรียบร้อยแล้ว';
}

function getTeacherDashboard_(token) {
  const email = CacheService.getScriptCache().get('teacher:' + normalizeValue_(token));
  if (!email) return jsonResponse_({ ok: false, message: 'กรุณาเข้าสู่ระบบครูใหม่' });

  const spreadsheet = getRegistrationSpreadsheet_();
  const teachersSheet = spreadsheet.getSheetByName(CONFIG.teachersSheetName);
  const teacherRows = teachersSheet && teachersSheet.getLastRow() > 1
    ? teachersSheet.getDataRange().getDisplayValues().slice(1)
    : [];
  const teacher = teacherRows.find((row) => normalizeValue_(row[3]).toLowerCase() === email.toLowerCase()
    && normalizeValue_(row[5]).toUpperCase() === 'ACTIVE');
  if (!teacher) return jsonResponse_({ ok: false, message: 'ไม่พบบัญชีครูที่ใช้งานอยู่ กรุณาเข้าสู่ระบบใหม่' });

  const quizIndex = getOrCreateQuizIndexSheet_();
  const quizzes = quizIndex.getDataRange().getDisplayValues().slice(1)
    .filter((row) => normalizeValue_(row[4]).toLowerCase() === email.toLowerCase())
    .map((row) => ({
      quizId: normalizeValue_(row[0]),
      title: normalizeValue_(row[1]),
      phase: normalizePhase_(row[10]) || 'pre-test'
    }))
    .filter((quiz) => quiz.quizId && quiz.title);
  const historySheet = getOrCreateQuizAttemptHistorySheet_();
  const historyRows = historySheet.getDataRange().getDisplayValues();
  const historyHeaders = historyRows[0] || [];
  const studentIndex = historyHeaders.indexOf('student_id');
  const lookupIndex = historyHeaders.indexOf('lookup_id');
  const quizIndexColumn = historyHeaders.indexOf('quiz_id');
  const phaseIndex = historyHeaders.indexOf('phase');
  const passedIndex = historyHeaders.indexOf('passed');
  const quizParticipants = new Map();
  const quizById = new Map();
  quizzes.forEach((quiz) => {
    quizParticipants.set(quiz.quizId, new Set());
    quizById.set(quiz.quizId, quiz);
  });
  const courseLearners = {
    preTest: new Set(),
    postTest: new Set(),
    passedPostTest: new Set(),
    score: new Set()
  };
  historyRows.slice(1).forEach((row) => {
    const quizId = normalizeValue_(row[quizIndexColumn]);
    const participants = quizParticipants.get(quizId);
    if (!participants) return;
    const studentId = normalizeValue_(row[studentIndex]) || normalizeLookupId_(row[lookupIndex]);
    if (!studentId) return;
    participants.add(studentId);

    const quiz = quizById.get(quizId);
    if (!isDaytimeAttackQuizTitle_(quiz.title)) return;
    const attemptPhase = phaseIndex >= 0
      ? normalizePhase_(row[phaseIndex])
      : quiz.phase;
    if (attemptPhase === 'pre-test') courseLearners.preTest.add(studentId);
    if (attemptPhase === 'post-test') {
      courseLearners.postTest.add(studentId);
      if (normalizeValue_(row[passedIndex]).toUpperCase() === 'TRUE') {
        courseLearners.passedPostTest.add(studentId);
      }
    }
    if (attemptPhase === 'score') courseLearners.score.add(studentId);
  });
  quizzes.forEach((quiz) => {
    quiz.participantCount = quizParticipants.get(quiz.quizId).size;
  });

  const assessmentIndex = getOrCreateSpecialAssessmentIndex_();
  const assessmentRows = assessmentIndex.getDataRange().getDisplayValues().slice(1)
    .filter((row) => row[10] !== 'FALSE' && row[0] && row[3]
      && normalizeValue_(row[9]).toLowerCase() === email.toLowerCase());
  const assessmentParticipants = new Set();
  const assessments = assessmentRows.map((row) => {
    const assessmentSheet = spreadsheet.getSheetByName(row[3]);
    const studentIds = assessmentSheet && assessmentSheet.getLastRow() > 1
      ? assessmentSheet.getRange(2, 2, assessmentSheet.getLastRow() - 1, 1).getDisplayValues().flat()
        .map(normalizeLookupId_).filter(Boolean)
      : [];
    studentIds.forEach((studentId) => assessmentParticipants.add(studentId));
    return {
      assessmentId: row[0],
      title: row[2],
      participantCount: new Set(studentIds).size
    };
  });
  Object.keys(CONFIG.legacyAssessmentOwners).forEach((title) => {
    const ownerEmail = normalizeValue_(CONFIG.legacyAssessmentOwners[title]).toLowerCase();
    if (ownerEmail !== email.toLowerCase()
      || assessments.some((assessment) => assessment.title.toLowerCase() === title.toLowerCase())) return;
    const legacySheet = spreadsheet.getSheetByName('ScooreT');
    const legacyRows = legacySheet && legacySheet.getLastRow() > 1
      ? legacySheet.getRange(2, 1, legacySheet.getLastRow() - 1, 29).getDisplayValues()
      : [];
    const participants = new Set(legacyRows
      .filter((row) => normalizeValue_(row[0]) && row.slice(3, 29).some((value) => normalizeValue_(value)))
      .map((row) => normalizeLookupId_(row[0]))
      .filter(Boolean));
    participants.forEach((studentId) => assessmentParticipants.add(studentId));
    assessments.push({ assessmentId: 'legacy-tactical-score', title: title, participantCount: participants.size });
  });

  const tacticalScoreSheet = spreadsheet.getSheetByName('ScooreT');
  if (!tacticalScoreSheet) throw new Error('ไม่พบชีต ScooreT ใน Spreadsheet ที่ตั้งค่าไว้');
  const tacticalScoreRows = tacticalScoreSheet.getLastRow() > 1
    ? tacticalScoreSheet.getRange(2, 1, tacticalScoreSheet.getLastRow() - 1, 29).getDisplayValues()
    : [];
  const tacticalScoreParticipants = new Set(tacticalScoreRows
    .filter((row) => normalizeValue_(row[0]) && row.slice(3, 29).some((value) => normalizeValue_(value)))
    .map((row) => normalizeLookupId_(row[0]))
    .filter(Boolean));
  const tacticalScoreCode = getCurrentTacticalScoreAccessCode_();

  const registrationCount = countUniqueRegistrationLearners_(spreadsheet);
  const attendanceSheet = spreadsheet.getSheetByName(CONFIG.attendanceSheetName);
  const dataSheet = spreadsheet.getSheetByName(CONFIG.sourceSheetName);
  const attendanceCount = countUniqueAttendanceLearners_(
    attendanceSheet,
    dataSheet,
    'รบด้วยวิธีรุก-ตีกลางวัน'
  );
  const attendanceByEpisode = countUniqueLearnersByEpisode_(
    attendanceSheet,
    'รบด้วยวิธีรุก-ตีกลางวัน',
    spreadsheet.getSheetByName(CONFIG.registrationSheetName),
    dataSheet
  );

  return jsonResponse_({
    ok: true,
    teacher: { name: normalizeValue_(teacher[2]), email: email },
    summary: {
      quizCount: quizzes.length,
      assessmentCount: assessments.length,
      assessmentParticipantCount: assessmentParticipants.size,
      tacticalScoreParticipantCount: tacticalScoreParticipants.size,
      tacticalScoreAccessCode: tacticalScoreCode,
      daytimeAttack: {
        preTestCount: courseLearners.preTest.size,
        postTestCount: courseLearners.postTest.size,
        passedPostTestCount: courseLearners.passedPostTest.size,
        scoreCount: courseLearners.score.size,
        departmentRegistrationCount: registrationCount,
        topicAttendanceCount: attendanceCount,
        topicAttendanceByEpisode: attendanceByEpisode
      }
    },
    quizzes: quizzes,
    assessments: assessments,
    updatedAt: new Date().toISOString()
  });
}

function isDaytimeAttackQuizTitle_(title) {
  const normalizedTitle = normalizeValue_(title);
  return (normalizedTitle.indexOf('กลางวัน') >= 0 || normalizedTitle.indexOf('กางวัน') >= 0)
    && (normalizedTitle.indexOf('รบด้วยวิธีรุก') >= 0 || normalizedTitle.indexOf('เข้าตี') >= 0);
}

function countUniqueLearnersInSheet_(sheet, filterHeader, filterValue) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map((header) => normalizeValue_(header).toLowerCase());
  const learnerIndex = headers.indexOf('lookup_id');
  const filterIndex = filterHeader ? headers.indexOf(filterHeader.toLowerCase()) : -1;
  if (learnerIndex < 0 || (filterHeader && filterIndex < 0)) return 0;

  const learners = new Set();
  values.slice(1).forEach((row) => {
    const learnerId = normalizeLookupId_(row[learnerIndex]);
    if (!learnerId) return;
    if (filterHeader && normalizeValue_(row[filterIndex]) !== filterValue) return;
    learners.add(learnerId);
  });
  return learners.size;
}

function countUniqueAttendanceLearners_(attendanceSheet, dataSheet, subject) {
  const learners = new Set();
  if (attendanceSheet && attendanceSheet.getLastRow() > 1) {
    const values = attendanceSheet.getDataRange().getDisplayValues();
    const headers = values[0].map((header) => normalizeValue_(header).toLowerCase());
    const learnerIndex = headers.indexOf('lookup_id');
    const subjectIndex = headers.indexOf('subject');
    if (learnerIndex >= 0 && subjectIndex >= 0) {
      values.slice(1).forEach((row) => {
        const learnerId = normalizeLookupId_(row[learnerIndex]);
        if (learnerId && normalizeValue_(row[subjectIndex]) === subject) learners.add(learnerId);
      });
    }
  }

  if (dataSheet && dataSheet.getLastRow() > 1) {
    const dataRows = dataSheet.getDataRange().getDisplayValues();
    const headers = dataRows[0].map((header) => normalizeValue_(header));
    const lookupIds = dataRows.slice(1).map((row) => normalizeLookupId_(row[0]));
    const formNameIndex = headers.indexOf('form_name');
    const attendanceFormNameIndex = headers.indexOf('attendance_form_name');
    if (formNameIndex >= 0 && attendanceFormNameIndex >= 0) {
      dataRows.slice(1).forEach((row, index) => {
        if (dataHasAttendanceForm_(row, formNameIndex, attendanceFormNameIndex, subject)) {
          learners.add(lookupIds[index]);
        }
      });
    }
  }
  learners.delete('');
  return learners.size;
}

function dataHasAttendanceForm_(row, formNameIndex, attendanceFormNameIndex, subject) {
  const formNames = normalizeValue_(row[formNameIndex]).split(/\r?\n/).filter(Boolean);
  const attendanceFormNames = normalizeValue_(row[attendanceFormNameIndex]).split(/\r?\n/).filter(Boolean);
  if (formNames.length !== attendanceFormNames.length) {
    throw new Error('ข้อมูล Attendance ในคอลัมน์ J:K ไม่ตรงจำนวนรายการ กรุณาตรวจสอบ');
  }
  return formNames.some((formName, index) =>
    formName === subject && /^ครั้งที่ [1-4]$/.test(attendanceFormNames[index]));
}

function countUniqueRegistrationLearners_(spreadsheet) {
  const learners = new Set();
  const dataSheet = spreadsheet.getSheetByName(CONFIG.sourceSheetName);
  if (dataSheet && dataSheet.getLastRow() > 1) {
    const columns = getDataRegistrationColumns_(dataSheet);
    if (columns.registrationId > 0) {
      const lookupIds = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 1).getDisplayValues();
      const personalIds = dataSheet.getRange(2, columns.registrationId, dataSheet.getLastRow() - 1, 1)
        .getDisplayValues();
      lookupIds.forEach((row, index) => {
        const personalId = normalizeValue_(personalIds[index][0]).replace(/^'/, '');
        const lookupId = normalizeLookupId_(row[0]);
        if (personalId && lookupId) learners.add(lookupId);
      });
    }
  }
  const registrationSheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
  if (registrationSheet && registrationSheet.getLastRow() > 1) {
    registrationSheet.getRange(2, 1, registrationSheet.getLastRow() - 1, 3).getDisplayValues()
      .forEach((row) => {
        const personalId = normalizeValue_(row[0]).replace(/^'/, '');
        const lookupId = normalizeLookupId_(row[2]);
        if (personalId && lookupId) learners.add(lookupId);
      });
  }
  return learners.size;
}

function countUniqueLearnersByEpisode_(sheet, subject, registrationSheet, dataSheet) {
  const episodeLearners = Array.from({ length: 18 }, (_, index) => ({
    episode: 'ตอนที่ ' + (index + 1),
    learners: new Set()
  }));

  const registrationEpisodes = new Map();
  let dataRows = [];
  let dataHeaders = [];
  if (dataSheet && dataSheet.getLastRow() > 1) {
    const dataColumns = getDataRegistrationColumns_(dataSheet);
    if (dataColumns.episode > 0) {
      dataRows = dataSheet.getDataRange().getDisplayValues();
      dataHeaders = dataRows[0].map((header) => normalizeValue_(header));
      dataRows.slice(1).forEach((row) => {
        const learnerId = normalizeLookupId_(row[0]);
        const episode = normalizeValue_(row[dataColumns.episode - 1]);
        if (learnerId && episode && !registrationEpisodes.has(learnerId)) {
          registrationEpisodes.set(learnerId, episode);
        }
      });
    }
  }
  if (registrationSheet && registrationSheet.getLastRow() > 1) {
    const registrationRows = registrationSheet.getDataRange().getDisplayValues();
    const registrationHeaders = registrationRows[0].map((header) => normalizeValue_(header).toLowerCase());
    const registrationLearnerIndex = registrationHeaders.indexOf('lookup_id');
    const registrationEpisodeIndex = registrationHeaders.indexOf('episode');
    if (registrationLearnerIndex >= 0 && registrationEpisodeIndex >= 0) {
      registrationRows.slice(1).forEach((row) => {
        const learnerId = normalizeLookupId_(row[registrationLearnerIndex]);
        const episode = normalizeValue_(row[registrationEpisodeIndex]);
        if (learnerId && episode && !registrationEpisodes.has(learnerId)) {
          registrationEpisodes.set(learnerId, episode);
        }
      });
    }
  }

  const learnersByEpisode = new Map(episodeLearners.map((item) => [item.episode, item.learners]));
  if (sheet && sheet.getLastRow() > 1) {
    const values = sheet.getDataRange().getDisplayValues();
    const headers = values[0].map((header) => normalizeValue_(header).toLowerCase());
    const learnerIndex = headers.indexOf('lookup_id');
    const subjectIndex = headers.indexOf('subject');
    const episodeIndex = headers.indexOf('episode');
    if (learnerIndex >= 0 && subjectIndex >= 0) {
      values.slice(1).forEach((row) => {
        if (normalizeValue_(row[subjectIndex]) !== subject) return;
        const learnerId = normalizeLookupId_(row[learnerIndex]);
        const attendanceEpisode = episodeIndex >= 0 ? normalizeValue_(row[episodeIndex]) : '';
        const episode = attendanceEpisode || registrationEpisodes.get(learnerId) || '';
        const learners = learnersByEpisode.get(episode);
        if (learners && learnerId) learners.add(learnerId);
      });
    }
  }

  if (dataRows.length > 1) {
    const dataColumns = getDataRegistrationColumns_(dataSheet);
    const formNameIndex = dataHeaders.indexOf('form_name');
    const attendanceFormNameIndex = dataHeaders.indexOf('attendance_form_name');
    if (formNameIndex >= 0 && attendanceFormNameIndex >= 0) {
      dataRows.slice(1).forEach((row) => {
        if (dataHasAttendanceForm_(row, formNameIndex, attendanceFormNameIndex, subject)) {
          const learnerId = normalizeLookupId_(row[0]);
          const episode = normalizeValue_(row[dataColumns.episode - 1]);
          const learners = learnersByEpisode.get(episode);
          if (learners && learnerId) learners.add(learnerId);
        }
      });
    }
  }

  return episodeLearners.map((item) => ({ episode: item.episode, count: item.learners.size }));
}

function findSpecialAssessment_(assessmentId) {
  const rows = getOrCreateSpecialAssessmentIndex_().getDataRange().getDisplayValues();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row[0] !== normalizeValue_(assessmentId) || row[10] === 'FALSE') continue;
    return {
      assessmentId: row[0],
      title: row[2],
      sheetName: row[3],
      recordCount: Number(row[4]),
      scoreCount: Number(row[5]),
      maxTotal: Number(row[6]),
      requiresCode: row[7] === 'TRUE',
      accessCode: row[8]
    };
  }
  return null;
}

function createSpecialAssessment_(data) {
  const teacherEmail = CacheService.getScriptCache().get('teacher:' + normalizeValue_(data.token));
  if (!teacherEmail) return jsonResponse_({ ok: false, message: 'กรุณาเข้าสู่ระบบครูใหม่' });

  const title = normalizeValue_(data.title);
  const recordCount = Number(data.recordCount);
  const scoreCount = Number(data.scoreCount);
  const maxTotal = Number(data.maxTotal);
  const requiresCode = normalizeValue_(data.requiresCode).toLowerCase() === 'true';
  if (!title || title.length > 100
    || !Number.isInteger(recordCount) || recordCount < 1 || recordCount > 100
    || !Number.isInteger(scoreCount) || scoreCount < 1 || scoreCount > 50
    || !Number.isFinite(maxTotal) || maxTotal <= 0 || maxTotal > 100000) {
    return jsonResponse_({ ok: false, message: 'กรุณาตรวจสอบชื่อเรื่อง จำนวนแถว จำนวนช่องคะแนน และคะแนนรวมสูงสุด' });
  }

  const indexSheet = getOrCreateSpecialAssessmentIndex_();
  const existingTitles = indexSheet.getDataRange().getDisplayValues().slice(1)
    .filter((row) => row[10] !== 'FALSE')
    .map((row) => normalizeValue_(row[2]).toLowerCase());
  if (existingTitles.includes(title.toLowerCase())) {
    return jsonResponse_({ ok: false, message: 'มีแบบประเมินชื่อนี้อยู่แล้ว' });
  }

  const assessmentId = 'A' + String(Date.now());
  const sheetName = 'Assessment_' + assessmentId;
  const accessCode = requiresCode
    ? String(Math.floor(100000 + Math.random() * 900000))
    : '';
  const spreadsheet = getRegistrationSpreadsheet_();
  const sheet = spreadsheet.insertSheet(sheetName);
  const headers = ['recorded_at', 'lookup_id', 'student_name', 'affiliation'];
  for (let index = 1; index <= scoreCount; index += 1) headers.push('score_' + index);
  headers.push('total');
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat('@');
  sheet.setFrozenRows(1);

  indexSheet.appendRow([
    assessmentId, new Date(), title, sheetName, recordCount, scoreCount,
    maxTotal, requiresCode ? 'TRUE' : 'FALSE', accessCode, teacherEmail, 'TRUE'
  ]);
  return jsonResponse_({
    ok: true,
    assessmentId: assessmentId,
    title: title,
    accessCode: accessCode,
    message: 'สร้างแบบประเมินและชีตรองรับข้อมูลเรียบร้อยแล้ว'
  });
}

function validateSpecialAssessmentCode_(data) {
  const assessment = findSpecialAssessment_(data.assessmentId);
  if (!assessment) return jsonResponse_({ ok: false, message: 'ไม่พบแบบประเมินนี้' });
  if (assessment.requiresCode && normalizeValue_(data.accessCode) !== assessment.accessCode) {
    return jsonResponse_({ ok: false, message: 'รหัสแบบประเมินไม่ถูกต้อง' });
  }
  return jsonResponse_({ ok: true, message: 'ยืนยันรหัสเรียบร้อยแล้ว' });
}

function submitSpecialAssessment_(data) {
  const assessment = findSpecialAssessment_(data.assessmentId);
  if (!assessment) return jsonResponse_({ ok: false, message: 'ไม่พบแบบประเมินนี้' });
  if (assessment.requiresCode && normalizeValue_(data.accessCode) !== assessment.accessCode) {
    return jsonResponse_({ ok: false, message: 'รหัสแบบประเมินไม่ถูกต้อง กรุณาเริ่มใหม่' });
  }

  let entries;
  try {
    entries = JSON.parse(data.entries || '[]');
  } catch (error) {
    entries = null;
  }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > assessment.recordCount) {
    return jsonResponse_({ ok: false, message: 'จำนวนรายการที่บันทึกไม่ถูกต้อง' });
  }

  const spreadsheet = getRegistrationSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(assessment.sheetName);
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบชีตรองรับแบบประเมิน' });
  const existingIds = sheet.getLastRow() > 1
    ? new Set(sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getDisplayValues().flat())
    : new Set();
  const seenIds = new Set();
  const rows = [];

  for (const entry of entries) {
    const lookupId = normalizeValue_(entry && entry.lookupId);
    if (!/^\d{4}$/.test(lookupId) || seenIds.has(lookupId)) {
      return jsonResponse_({ ok: false, message: 'เลขที่ต้องเป็นตัวเลข 4 หลักและห้ามซ้ำกัน' });
    }
    if (existingIds.has(lookupId)) {
      return jsonResponse_({ ok: false, message: 'เลขที่ ' + lookupId + ' มีบันทึกในแบบประเมินนี้แล้ว' });
    }
    if (!Array.isArray(entry.scores) || entry.scores.length !== assessment.scoreCount) {
      return jsonResponse_({ ok: false, message: 'จำนวนช่องคะแนนไม่ตรงกับแบบประเมิน' });
    }
    const student = findStudentRecord_(lookupId);
    if (!student) return jsonResponse_({ ok: false, message: 'ไม่พบเลขที่ ' + lookupId + ' ในชีต Data' });
    if (student.ambiguous) return jsonResponse_({ ok: false, message: 'พบเลขที่ ' + lookupId + ' ซ้ำในชีต Data กรุณาแจ้งผู้ดูแล' });

    let total = 0;
    const scores = entry.scores.map((rawScore) => {
      if (rawScore === '' || rawScore === null || rawScore === undefined) return '';
      const score = Number(rawScore);
      if (!Number.isFinite(score) || score < 0) throw new Error('คะแนนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      total += score;
      return score;
    });
    if (total > assessment.maxTotal) {
      return jsonResponse_({ ok: false, message: 'คะแนนรวมของเลขที่ ' + lookupId + ' ต้องไม่เกิน ' + assessment.maxTotal });
    }

    seenIds.add(lookupId);
    rows.push([
      new Date(), lookupId, student.columns[1].value, student.columns[2].value,
      ...scores, total
    ]);
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  updateLearningSummaryAfterSourceWrite_(() => {
    rows.forEach((row) => syncLearningSummarySpecialAssessment_(row[1], {
      assessmentId: assessment.assessmentId,
      title: assessment.title,
      score: row[row.length - 1],
      total: assessment.maxTotal,
      recordedAt: row[0]
    }));
  });
  return jsonResponse_({ ok: true, saved: rows.length, message: 'บันทึกผลแบบประเมินเรียบร้อยแล้ว' });
}

function lookupStudent_(studentId) {
  const requestedId = normalizeLookupId_(studentId);
  if (!/^\d{4}$/.test(requestedId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณากรอกเลขค้นหา 1-4 หลัก'
    });
  }

  const student = findStudentRecord_(requestedId);
  if (!student) {
    return jsonResponse_({
      ok: false,
      message: 'ไม่พบหมายเลขประจำตัวในชีต Data'
    });
  }
  if (student.ambiguous) {
    return jsonResponse_({
      ok: false,
      message: 'พบเลขค้นหานี้ซ้ำในชีต Data กรุณาแจ้งผู้ดูแลตรวจสอบ'
    });
  }

  return jsonResponse_({
    ok: true,
    data: {
      columns: student.columns
    }
  });
}

function lookupScoreStudents_(formName, data) {
  let lookupIds;
  try {
    lookupIds = JSON.parse(data.lookupIds || '[]');
  } catch (error) {
    lookupIds = null;
  }
  if (!Array.isArray(lookupIds) || lookupIds.length < 1) {
    return jsonResponse_({ ok: false, message: 'กรุณาระบุรายการเลขที่เพื่อค้นหา' });
  }

  let maximumCount = 12;
  if (formName === 'tactical-score-student-lookup-many') {
    const submittedCode = normalizeValue_(data.accessCode);
    const currentCode = getCurrentTacticalScoreAccessCode_();
    if (!/^\d{6}$/.test(submittedCode) || submittedCode !== currentCode) {
      return jsonResponse_({ ok: false, message: 'รหัสการใช้งานไม่ถูกต้องหรือหมดอายุ กรุณาเริ่มใหม่' });
    }
  } else {
    const assessment = findSpecialAssessment_(data.assessmentId);
    if (!assessment) return jsonResponse_({ ok: false, message: 'ไม่พบแบบประเมินนี้' });
    if (!assessment.requiresCode || normalizeValue_(data.accessCode) !== assessment.accessCode) {
      return jsonResponse_({ ok: false, message: 'การค้นหาหลายรายการต้องใช้รหัสแบบประเมินที่ถูกต้อง' });
    }
    maximumCount = Math.min(100, assessment.recordCount);
  }
  if (lookupIds.length > maximumCount) {
    return jsonResponse_({ ok: false, message: 'จำนวนรายการค้นหาเกินขีดจำกัด' });
  }

  const sheet = getSourceSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 0 ? sheet.getRange(1, 1, lastRow, 4).getDisplayValues() : [];
  const headers = rows[0] || [];
  const studentsById = new Map();
  const duplicateIds = new Set();
  rows.slice(1).forEach((row) => {
    const id = normalizeLookupId_(row[0]);
    if (!id) return;
    if (studentsById.has(id)) {
      duplicateIds.add(id);
      return;
    }
    studentsById.set(id, {
      columns: row.map((value, columnIndex) => ({
        label: normalizeValue_(headers[columnIndex]) || `คอลัมน์ ${String.fromCharCode(65 + columnIndex)}`,
        value: normalizeValue_(value)
      }))
    });
  });

  const results = lookupIds.map((rawId) => {
    const lookupId = normalizeValue_(rawId);
    if (!/^\d{4}$/.test(lookupId)) {
      return { lookupId: lookupId, ok: false, message: 'กรุณากรอกเลขค้นหาให้ครบ 4 หลัก' };
    }
    const normalizedLookupId = normalizeLookupId_(lookupId);
    if (duplicateIds.has(normalizedLookupId)) {
      return { lookupId: lookupId, ok: false, message: 'พบเลขค้นหาซ้ำในชีต Data กรุณาแจ้งผู้ดูแลตรวจสอบ' };
    }
    const student = studentsById.get(normalizedLookupId);
    if (!student) {
      return { lookupId: lookupId, ok: false, message: 'ไม่พบหมายเลขประจำตัวในชีต Data' };
    }
    return { lookupId: lookupId, ok: true, data: { columns: student.columns } };
  });
  return jsonResponse_({ ok: true, results: results });
}

function lookupAttendance_(registrationId) {
  const requestedId = normalizeValue_(registrationId);
  if (!/^\d{13}$/.test(requestedId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณากรอกเลขประจำตัวให้ครบ 13 หลัก'
    });
  }

  const record = findDataAttendanceStudent_(requestedId);
  if (!record) {
    return jsonResponse_({
      ok: false,
      message: 'ไม่พบหมายเลขประจำตัวในคอลัมน์ F ของชีต Data'
    });
  }
  if (record.ambiguous) {
    return jsonResponse_({
      ok: false,
      message: 'พบหมายเลขประจำตัวซ้ำในคอลัมน์ F ของชีต Data กรุณาแจ้งผู้ดูแลตรวจสอบ'
    });
  }

  return jsonResponse_({
    ok: true,
    data: { columns: record.columns }
  });
}

function attendanceStudentLogin_(data) {
  const email = normalizeValue_(data.email).toLowerCase();
  const password = normalizeValue_(data.password).replace(/^'/, '');
  if (!isValidEmail_(email) || !/^\d{13}$/.test(password)) {
    return jsonResponse_({ ok: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }

  ensureLearningSummaryInitialized_();
  const sheet = getOrCreateLearningSummarySheet_();
  const summaryRow = findLearningSummaryRowByPersonalId_(sheet, password);
  if (!summaryRow) {
    return jsonResponse_({ ok: false, message: 'ไม่พบข้อมูลสำหรับเข้าสู่ระบบ' });
  }
  const derivedHeaders = ['total_score', 'total_score_ratio', 'email'];
  const headers = getLearningSummaryHeaders_().concat(derivedHeaders);
  const row = sheet.getRange(summaryRow, 1, 1, headers.length).getDisplayValues()[0];
  const value = (name) => {
    const index = name === 'email' ? headers.lastIndexOf(name) : headers.indexOf(name);
    return normalizeValue_(row[index]);
  };
  if (!value('email') || value('email').toLowerCase() !== email) {
    return jsonResponse_({ ok: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  let assessments;
  try {
    assessments = JSON.parse(value('assessments') || '[]');
  } catch (error) {
    throw new Error('ข้อมูลแบบประเมินในชีต LearningSummary ไม่ถูกต้อง กรุณาสร้างชีตสรุปใหม่');
  }

  return jsonResponse_({
    ok: true,
    data: {
      student: {
        personalId: value('personal_id'),
        attendanceDate: value('attendance_date'),
        battalionNumber: value('battalion_number'),
        fullName: value('full_name'),
        email: value('email'),
        episode: value('episode')
      },
      scores: {
        attitude: value('attitude'),
        preTest: value('pre_test'),
        postTest: value('post_test'),
        knowledgeAssessment: value('knowledge_assessment'),
        specialTask: value('special_task'),
        totalScore: value('total_score'),
        netScore: value('total_score_ratio'),
        assessments: assessments
      }
    }
  });
}

function getLearningSummaryHeaders_() {
  return [
    'personal_id', 'lookup_id', 'attendance_date', 'battalion_number', 'full_name',
    'email', 'episode', 'attitude', 'pre_test', 'post_test', 'knowledge_assessment',
    'special_task', 'assessments', 'updated_at'
  ];
}

function ensureLearningSummaryDerivedColumns_(sheet) {
  const totalColumn = 15;
  const ratioColumn = 16;
  const emailColumn = 17;
  ensureSheetColumns_(sheet, emailColumn);
  sheet.getRange(1, totalColumn).setValue('total_score').setFontWeight('bold');
  sheet.getRange(1, ratioColumn).setValue('total_score_ratio').setFontWeight('bold');

  const totalFormula = '=ARRAYFORMULA(IF(A2:A="","",IFERROR(VALUE(H2:H),0)+IFERROR(VALUE(I2:I),0)+IFERROR(VALUE(J2:J),0)+IFERROR(VALUE(K2:K),0)+IFERROR(VALUE(L2:L),0)))';
  const totalFormulaCell = sheet.getRange(2, totalColumn);
  if (totalFormulaCell.getFormula() !== totalFormula) {
    sheet.getRange(2, totalColumn, sheet.getMaxRows() - 1, 1).clearContent();
    totalFormulaCell.setFormula(totalFormula);
  }
  sheet.getRange(2, totalColumn, sheet.getMaxRows() - 1, 1).setNumberFormat('0.##');

  const ratioFormula = '=ARRAYFORMULA(IF(A2:A="","",IFERROR(VALUE(O2:O)/100,0)))';
  const ratioFormulaCell = sheet.getRange(2, ratioColumn);
  if (ratioFormulaCell.getFormula() !== ratioFormula) {
    sheet.getRange(2, ratioColumn, sheet.getMaxRows() - 1, 1).clearContent();
    ratioFormulaCell.setFormula(ratioFormula);
  }
  sheet.getRange(2, ratioColumn, sheet.getMaxRows() - 1, 1).setNumberFormat('0.##');

  const emailHeader = sheet.getRange(1, emailColumn).getDisplayValue();
  const emailFormula = '=ARRAYFORMULA(IF(A2:A="","",F2:F))';
  const emailFormulaCell = sheet.getRange(2, emailColumn);
  const existingEmailFormula = emailFormulaCell.getFormula();
  const previousTotalFormula = totalFormula;
  const hasUnlabeledEmailValues = !emailHeader && !existingEmailFormula && sheet.getLastRow() > 1
    && sheet.getRange(2, emailColumn, sheet.getLastRow() - 1, 1)
      .getDisplayValues().some((row) => normalizeValue_(row[0]));
  if (hasUnlabeledEmailValues) {
    throw new Error('พบข้อมูลในคอลัมน์ Q ที่ไม่มีหัวข้อ กรุณาตรวจสอบก่อนติดตั้งคอลัมน์ email');
  }
  if (emailHeader && emailHeader !== 'email'
    && !(emailHeader === 'total_score' && existingEmailFormula === previousTotalFormula)) {
    throw new Error('คอลัมน์ Q ใน LearningSummary มีข้อมูลหรือหัวข้อที่ไม่คาดหมาย กรุณาตรวจสอบก่อนติดตั้งคอลัมน์ email');
  }
  if (existingEmailFormula && existingEmailFormula !== emailFormula
    && existingEmailFormula !== previousTotalFormula) {
    throw new Error('พบสูตรที่ไม่รู้จักในคอลัมน์ Q ของ LearningSummary กรุณาตรวจสอบก่อนติดตั้งคอลัมน์ email');
  }
  sheet.getRange(1, emailColumn).setValue('email').setFontWeight('bold');
  if (existingEmailFormula !== emailFormula) {
    sheet.getRange(2, emailColumn, sheet.getMaxRows() - 1, 1).clearContent();
    emailFormulaCell.setFormula(emailFormula);
  }
}

function getAttendanceHeaders_() {
  const headers = CONFIG.registrationHeaders.slice();
  headers.splice(headers.indexOf('email') + 1, 0, 'subject');
  headers.push('attendance_form_name');
  return headers;
}

function ensureDataAttendanceColumns_(sheet) {
  ensureSheetColumns_(sheet, 11);
  const headers = sheet.getRange(1, 1, 1, Math.max(11, sheet.getLastColumn())).getDisplayValues()[0]
    .map((header) => normalizeValue_(header));
  const expectedHeaders = CONFIG.dataAttendanceHeaders;
  const expectedIndexes = expectedHeaders.map((header) => headers.indexOf(header));
  const targetIndexes = expectedHeaders.map((_, index) => 8 + index);
  if (expectedIndexes.every((index, offset) => index === targetIndexes[offset])) {
    return new Map(expectedHeaders.map((header, index) => [header, index + 9]));
  }
  throw new Error('หัวคอลัมน์ I:K ของชีต Data ต้องเป็น registered_at, form_name และ attendance_form_name ตามลำดับ');
}

function getDataAttendanceRecord_(sheet, rowNumber, columns) {
  const values = sheet.getRange(rowNumber, 9, 1, CONFIG.dataAttendanceHeaders.length)
    .getDisplayValues()[0]
    .map((value) => normalizeValue_(value));
  return CONFIG.dataAttendanceHeaders.map((header) => values[columns.get(header) - 9]);
}

function getAttendanceRecordKey_(formName, attendanceFormName) {
  return normalizeValue_(formName) + '\u001f' + normalizeValue_(attendanceFormName);
}

function getAttendanceRecordKeys_(record) {
  const formNames = normalizeValue_(record[1]).split(/\r?\n/).filter(Boolean);
  const formRounds = normalizeValue_(record[2]).split(/\r?\n/).filter(Boolean);
  if (formNames.length !== formRounds.length) {
    throw new Error('ข้อมูล Attendance ในคอลัมน์ J:K ไม่ตรงจำนวนรายการ กรุณาตรวจสอบก่อนบันทึก');
  }
  return new Set(formNames.map((formName, index) =>
    getAttendanceRecordKey_(formName, formRounds[index])));
}

function appendDataAttendanceRecord_(sheet, rowNumber, current, record) {
  const range = sheet.getRange(rowNumber, 9, 1, CONFIG.dataAttendanceHeaders.length);
  if (range.getFormulas()[0].some(Boolean)) {
    throw new Error('พบสูตรในคอลัมน์ I:K ของชีต Data กรุณาตรวจสอบก่อนบันทึก');
  }
  const values = current.map((value, index) =>
    value ? value + '\n' + record[index] : record[index]);
  range.setNumberFormat('@').setValues([values]);
}

function getOrCreateLearningSummarySheet_() {
  return getOrCreateSheet_(
    getRegistrationSpreadsheet_(),
    'LearningSummary',
    getLearningSummaryHeaders_()
  );
}

function ensureLearningSummaryInitialized_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getRegistrationSpreadsheet_().getSheetByName('LearningSummary');
    const expectedHeaders = getLearningSummaryHeaders_();
    const currentHeaders = sheet && sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0]
      : [];
    const initialized = PropertiesService.getScriptProperties()
      .getProperty('LEARNING_SUMMARY_VERSION') === LEARNING_SUMMARY_VERSION;
    if (!initialized || currentHeaders.join('\u001f') !== expectedHeaders.join('\u001f')) {
      rebuildLearningSummary_();
    }
  } finally {
    lock.releaseLock();
  }
}

function rebuildLearningSummary() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    rebuildLearningSummary_();
    return 'LearningSummary has been rebuilt from the source sheets.';
  } finally {
    lock.releaseLock();
  }
}

function rebuildLearningSummary_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  const attendanceSheet = spreadsheet.getSheetByName(CONFIG.attendanceSheetName);

  const summaries = new Map();
  const lookupToPersonalId = new Map();
  const getRecord = (personalId, lookupId) => {
    const id = normalizeValue_(personalId).replace(/^'/, '');
    const lookup = normalizeLookupId_(lookupId);
    if (!id) return null;
    if (!summaries.has(id)) {
      summaries.set(id, {
        personal_id: id,
        lookup_id: lookup,
        attendance_date: '',
        battalion_number: lookup,
        full_name: '',
        email: '',
        episode: '',
        attitude: '',
        pre_test: '',
        post_test: '',
        knowledge_assessment: '',
        special_task: '',
        assessments: '[]',
        updated_at: new Date()
      });
    }
    const record = summaries.get(id);
    if (!record.lookup_id && lookup) record.lookup_id = lookup;
    if (lookup && !lookupToPersonalId.has(lookup)) lookupToPersonalId.set(lookup, id);
    return record;
  };

  const attendanceRows = attendanceSheet && attendanceSheet.getLastRow() > 0
    ? attendanceSheet.getDataRange().getDisplayValues()
    : [];
  const attendanceHeaders = (attendanceRows[0] || []).map(normalizeValue_);
  const attendanceIndex = (name, fallback) => {
    const index = attendanceHeaders.indexOf(name);
    return index >= 0 ? index : fallback;
  };
  const attendanceIdIndex = attendanceIndex('registration_id', 0);
  const attendanceLookupIndex = attendanceIndex('lookup_id', 2);
  const attendanceEmailIndex = attendanceIndex('email', 7);
  const attendanceDateIndex = attendanceIndex('registered_at', 1);
  const attendanceDates = attendanceSheet && attendanceRows.length > 1
    ? attendanceSheet.getRange(2, attendanceDateIndex + 1, attendanceRows.length - 1, 1).getValues()
      .map((row) => row[0])
    : [];
  const latestAttendance = new Map();
  attendanceRows.slice(1).forEach((row, offset) => {
    const personalId = normalizeValue_(row[attendanceIdIndex]).replace(/^'/, '');
    if (!personalId) return;
    const lookupId = normalizeLookupId_(row[attendanceLookupIndex]);
    const record = getRecord(personalId, lookupId);
    const registeredAt = attendanceDates[offset];
    const timestamp = registeredAt instanceof Date
      ? registeredAt.getTime()
      : Date.parse(normalizeValue_(row[attendanceDateIndex]));
    const previous = latestAttendance.get(personalId);
    const isLatest = !previous
      || (Number.isFinite(timestamp) && (!Number.isFinite(previous.timestamp) || timestamp >= previous.timestamp))
      || (!Number.isFinite(timestamp) && !Number.isFinite(previous.timestamp) && offset >= previous.offset);
    if (!isLatest) return;
    record.attendance_date = normalizeValue_(row[attendanceIndex('registered_at', 1)]);
    record.battalion_number = normalizeValue_(row[attendanceLookupIndex]);
    record.full_name = normalizeValue_(row[attendanceIndex('data_column_b', 4)]);
    record.email = normalizeValue_(row[attendanceEmailIndex]).toLowerCase();
    record.episode = normalizeValue_(row[attendanceIndex('episode', 9)]);
    latestAttendance.set(personalId, { timestamp: timestamp, offset: offset });
  });

  const sourceSheet = spreadsheet.getSheetByName(CONFIG.sourceSheetName);
  if (sourceSheet && sourceSheet.getLastRow() > 1) {
    const dataRegistrationColumns = getDataRegistrationColumns_(sourceSheet);
    if (dataRegistrationColumns.registrationId > 0) {
      const sourceRows = sourceSheet.getDataRange().getDisplayValues();
      const sourceHeaders = sourceRows[0].map((header) => normalizeValue_(header));
      const attendanceDateIndex = sourceHeaders.indexOf('registered_at');
      sourceRows.slice(1).forEach((row) => {
        const personalId = normalizeValue_(row[dataRegistrationColumns.registrationId - 1]).replace(/^'/, '');
        const lookupId = normalizeLookupId_(row[0]);
        if (!personalId || !lookupId) return;
        const record = getRecord(personalId, lookupId);
        const attendanceDates = attendanceDateIndex >= 0
          ? normalizeValue_(row[attendanceDateIndex]).split(/\r?\n/).filter(Boolean)
          : [];
        const registeredAt = attendanceDates.length
          ? attendanceDates[attendanceDates.length - 1]
          : normalizeValue_(row[dataRegistrationColumns.registeredAt - 1]);
        const timestamp = Date.parse(registeredAt);
        const previous = latestAttendance.get(personalId);
        const isLatest = !previous
          || (Number.isFinite(timestamp)
            && (!Number.isFinite(previous.timestamp) || timestamp >= previous.timestamp));
        if (!isLatest) return;
        record.attendance_date = registeredAt;
        record.battalion_number = lookupId;
        record.full_name = normalizeValue_(row[1]);
        record.email = normalizeValue_(row[dataRegistrationColumns.email - 1]).toLowerCase();
        record.episode = normalizeValue_(row[dataRegistrationColumns.episode - 1]);
        latestAttendance.set(personalId, { timestamp: timestamp, offset: -1 });
      });
    }
  }

  const registrationSheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
  if (registrationSheet && registrationSheet.getLastRow() > 1) {
    registrationSheet.getRange(2, 1, registrationSheet.getLastRow() - 1, 3).getDisplayValues()
      .forEach((row) => {
        const personalId = normalizeValue_(row[0]).replace(/^'/, '');
        const lookupId = normalizeLookupId_(row[2]);
        if (personalId && lookupId && !lookupToPersonalId.has(lookupId)) {
          lookupToPersonalId.set(lookupId, personalId);
        }
      });
  }

  const attitudeSheet = spreadsheet.getSheetByName('เจตคติ');
  if (attitudeSheet && attitudeSheet.getLastRow() > 1) {
    attitudeSheet.getRange(2, 1, attitudeSheet.getLastRow() - 1, 7).getDisplayValues()
      .forEach((row) => {
        const record = summaries.get(lookupToPersonalId.get(normalizeLookupId_(row[0])));
        if (record && record.attitude === '') record.attitude = normalizeValue_(row[6]);
      });
  }

  const quizSheet = spreadsheet.getSheetByName('QuizResults');
  if (quizSheet && quizSheet.getLastRow() > 1) {
    const values = quizSheet.getDataRange().getValues();
    const headers = values[0].map(normalizeValue_);
    const indexes = {
      personalId: headers.indexOf('student_id'),
      lookupId: headers.indexOf('เลขที่กองกัน'),
      submittedAt: headers.indexOf('submitted_at'),
      phase: headers.indexOf('phase'),
      pre: headers.indexOf('pre_score'),
      post: headers.indexOf('post_score'),
      score: headers.indexOf('score')
    };
    const latest = new Map();
    values.slice(1).forEach((row, offset) => {
      const lookupId = indexes.lookupId >= 0 ? normalizeLookupId_(row[indexes.lookupId]) : '';
      const personalId = (indexes.personalId >= 0
        ? normalizeValue_(row[indexes.personalId]).replace(/^'/, '')
        : '') || lookupToPersonalId.get(lookupId);
      const record = summaries.get(personalId);
      if (!record) return;
      const phase = indexes.phase >= 0 ? normalizePhase_(row[indexes.phase]) : '';
      const submittedAt = indexes.submittedAt >= 0 ? row[indexes.submittedAt] : '';
      const timestamp = submittedAt instanceof Date
        ? submittedAt.getTime()
        : Date.parse(normalizeValue_(submittedAt));
      const order = offset;
      const updateLatest = (key, field, value) => {
        if (indexes[key] < 0 || normalizeValue_(value) === '') return;
        const previous = latest.get(personalId + ':' + field);
        const isNewer = !previous
          || (Number.isFinite(timestamp) && (!Number.isFinite(previous.timestamp) || timestamp >= previous.timestamp))
          || (!Number.isFinite(timestamp) && !Number.isFinite(previous.timestamp) && order >= previous.order);
        if (!isNewer) return;
        record[field] = normalizeValue_(value);
        latest.set(personalId + ':' + field, { timestamp: timestamp, order: order });
      };
      updateLatest('pre', 'pre_test', indexes.pre >= 0 ? row[indexes.pre] : '');
      updateLatest('post', 'post_test', indexes.post >= 0 ? row[indexes.post] : '');
      if (phase === 'score') {
        updateLatest('score', 'knowledge_assessment', indexes.score >= 0 ? row[indexes.score] : '');
      }
    });
  }

  const tacticalSheet = spreadsheet.getSheetByName('ScooreT');
  if (tacticalSheet && tacticalSheet.getLastRow() > 1) {
    tacticalSheet.getRange(2, 1, tacticalSheet.getLastRow() - 1, 29).getDisplayValues()
      .forEach((row) => {
        const record = summaries.get(lookupToPersonalId.get(normalizeLookupId_(row[0])));
        if (record && record.special_task === ''
          && row.slice(3, 29).some((value) => normalizeValue_(value) !== '')) {
          record.special_task = normalizeValue_(row[28]);
        }
      });
  }

  const assessmentIndex = spreadsheet.getSheetByName(CONFIG.specialAssessmentIndexSheetName);
  if (assessmentIndex && assessmentIndex.getLastRow() > 1) {
    assessmentIndex.getRange(2, 1, assessmentIndex.getLastRow() - 1, 7).getDisplayValues()
      .forEach((row) => {
        const assessmentSheet = spreadsheet.getSheetByName(normalizeValue_(row[3]));
        if (!assessmentSheet || assessmentSheet.getLastRow() < 2) return;
        const assessmentRows = assessmentSheet.getDataRange().getDisplayValues();
        assessmentRows.slice(1).forEach((assessmentRow) => {
          const lookupId = normalizeLookupId_(assessmentRow[1]);
          const record = summaries.get(lookupToPersonalId.get(lookupId));
          if (!record) return;
          const assessments = JSON.parse(record.assessments);
          assessments.push({
            assessmentId: normalizeValue_(row[0]),
            title: normalizeValue_(row[2]),
            score: normalizeValue_(assessmentRow[assessmentRow.length - 1]),
            total: normalizeValue_(row[6]),
            recordedAt: normalizeValue_(assessmentRow[0])
          });
          record.assessments = JSON.stringify(assessments);
        });
      });
  }

  const sheet = getOrCreateLearningSummarySheet_();
  const headers = getLearningSummaryHeaders_();
  const outputRows = Array.from(summaries.values()).map((record) =>
    headers.map((header) => record[header] === undefined ? '' : record[header]));
  const previousLastRow = sheet.getLastRow();
  const requiredRows = outputRows.length + 1;
  if (sheet.getMaxRows() < requiredRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  }
  PropertiesService.getScriptProperties().setProperty('LEARNING_SUMMARY_VERSION', 'rebuilding');
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (outputRows.length) {
    sheet.getRange(2, 1, outputRows.length, 2).setNumberFormat('@');
    sheet.getRange(2, 1, outputRows.length, headers.length).setValues(outputRows);
  }
  if (previousLastRow > requiredRows) {
    sheet.getRange(requiredRows + 1, 1, previousLastRow - requiredRows, headers.length).clearContent();
  }
  sheet.setFrozenRows(1);
  ensureLearningSummaryDerivedColumns_(sheet);
  PropertiesService.getScriptProperties().setProperty('LEARNING_SUMMARY_VERSION', LEARNING_SUMMARY_VERSION);
}

function findLearningSummaryRowByPersonalId_(sheet, personalId) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(normalizeValue_(personalId).replace(/^'/, ''))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function findLearningSummaryRowByLookupId_(sheet, lookupId) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const match = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(normalizeLookupId_(lookupId))
    .matchEntireCell(true)
    .matchCase(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function writeLearningSummaryPatch_(personalId, lookupId, patch) {
  const id = normalizeValue_(personalId).replace(/^'/, '');
  if (!id) return;
  const sheet = getOrCreateLearningSummarySheet_();
  const headers = getLearningSummaryHeaders_();
  let rowNumber = findLearningSummaryRowByPersonalId_(sheet, id);
  let row;
  if (rowNumber) {
    row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  } else {
    rowNumber = sheet.getLastRow() + 1;
    row = headers.map(() => '');
    row[headers.indexOf('personal_id')] = id;
    row[headers.indexOf('assessments')] = '[]';
  }
  if (lookupId) patch.lookup_id = normalizeLookupId_(lookupId);
  Object.keys(patch).forEach((key) => {
    const index = headers.indexOf(key);
    if (index >= 0) row[index] = patch[key];
  });
  row[headers.indexOf('updated_at')] = new Date();
  sheet.getRange(rowNumber, 1, 1, 2).setNumberFormat('@');
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function updateLearningSummaryAfterSourceWrite_(update) {
  try {
    update();
  } catch (error) {
    throw new Error('บันทึกข้อมูลต้นทางแล้ว แต่ปรับปรุง LearningSummary ไม่สำเร็จ กรุณาแจ้งผู้ดูแลให้เรียก rebuildLearningSummary และอย่าส่งข้อมูลซ้ำ: '
      + getErrorMessage_(error));
  }
}

function syncLearningSummaryAttendance_(headers, values, attendanceRegisteredAt) {
  const index = (name) => headers.indexOf(name);
  const personalId = normalizeValue_(values[index('registration_id')]).replace(/^'/, '');
  const lookupId = normalizeLookupId_(values[index('lookup_id')]);
  if (!personalId) throw new Error('ไม่พบเลขประจำตัวในข้อมูล Attendance ที่เพิ่งบันทึก');
  const sheet = getOrCreateLearningSummarySheet_();
  const existingRow = findLearningSummaryRowByPersonalId_(sheet, personalId);
  const patch = {
    attendance_date: attendanceRegisteredAt || values[index('registered_at')] || '',
    battalion_number: normalizeValue_(values[index('lookup_id')]),
    full_name: values[index('data_column_b')] || '',
    email: normalizeValue_(values[index('email')]).toLowerCase(),
    episode: values[index('episode')] || ''
  };
  writeLearningSummaryPatch_(personalId, lookupId, patch);
  if (!existingRow) refreshLearningSummaryScoresForStudent_(personalId, lookupId);
}

function syncLearningSummaryScoresByLookupId_(lookupId, patch) {
  const normalizedLookupId = normalizeLookupId_(lookupId);
  let summarySheet = getOrCreateLearningSummarySheet_();
  let summaryRow = findLearningSummaryRowByLookupId_(summarySheet, normalizedLookupId);
  if (!summaryRow) {
    rebuildLearningSummary_();
    summarySheet = getOrCreateLearningSummarySheet_();
    summaryRow = findLearningSummaryRowByLookupId_(summarySheet, normalizedLookupId);
  }
  if (!summaryRow) {
    throw new Error('ไม่พบเลขที่ ' + normalizedLookupId
      + ' ใน LearningSummary หลังสร้างสรุปใหม่ กรุณาตรวจสอบเลขประจำตัวใน Data หรือ Registration');
  }
  const personalId = normalizeValue_(summarySheet.getRange(summaryRow, 1).getDisplayValue()).replace(/^'/, '');
  if (!personalId) {
    throw new Error('ไม่พบเลขประจำตัวสำหรับเลขที่ ' + normalizedLookupId + ' ใน LearningSummary');
  }
  writeLearningSummaryPatch_(personalId, normalizedLookupId, patch);
}

function syncLearningSummaryQuizResult_(result) {
  const phase = normalizePhase_(result.phase);
  const patch = {};
  if (phase === 'pre-test') patch.pre_test = result.pre_score;
  if (phase === 'post-test') patch.post_test = result.post_score;
  if (phase === 'score') patch.knowledge_assessment = result.score;
  syncLearningSummaryScoresByLookupId_(result.lookup_id, patch);
}

function syncLearningSummarySpecialAssessment_(lookupId, assessmentResult) {
  const normalizedLookupId = normalizeLookupId_(lookupId);
  const summarySheet = getOrCreateLearningSummarySheet_();
  const summaryRow = findLearningSummaryRowByLookupId_(summarySheet, normalizedLookupId);
  if (!summaryRow) return;
  const personalId = normalizeValue_(summarySheet.getRange(summaryRow, 1).getDisplayValue()).replace(/^'/, '');
  const headers = getLearningSummaryHeaders_();
  const current = summarySheet.getRange(summaryRow, headers.indexOf('assessments') + 1).getDisplayValue();
  let assessments;
  try {
    assessments = JSON.parse(current || '[]');
  } catch (error) {
    throw new Error('ข้อมูลแบบประเมินในชีต LearningSummary ไม่ถูกต้อง');
  }
  const index = assessments.findIndex((item) => item.assessmentId === assessmentResult.assessmentId);
  if (index >= 0) assessments[index] = assessmentResult;
  else assessments.push(assessmentResult);
  writeLearningSummaryPatch_(personalId, normalizedLookupId, {
    assessments: JSON.stringify(assessments)
  });
}

function refreshLearningSummaryScoresForStudent_(personalId, lookupId) {
  const spreadsheet = getRegistrationSpreadsheet_();
  const record = {
    attitude: '',
    pre_test: '',
    post_test: '',
    knowledge_assessment: '',
    special_task: '',
    assessments: '[]'
  };
  const normalizedId = normalizeValue_(personalId).replace(/^'/, '');
  const normalizedLookup = normalizeLookupId_(lookupId);
  const attitudeSheet = spreadsheet.getSheetByName('เจตคติ');
  if (attitudeSheet && attitudeSheet.getLastRow() > 1) {
    const match = attitudeSheet.getRange(2, 1, attitudeSheet.getLastRow() - 1, 7).getDisplayValues()
      .find((row) => normalizeLookupId_(row[0]) === normalizedLookup);
    if (match) record.attitude = normalizeValue_(match[6]);
  }
  const quizSheet = spreadsheet.getSheetByName('QuizResults');
  if (quizSheet && quizSheet.getLastRow() > 1) {
    const values = quizSheet.getDataRange().getValues();
    const headers = values[0].map(normalizeValue_);
    const latest = new Map();
    values.slice(1).forEach((row, offset) => {
      const rowId = headers.indexOf('student_id') >= 0
        ? normalizeValue_(row[headers.indexOf('student_id')]).replace(/^'/, '')
        : '';
      const rowLookup = headers.indexOf('เลขที่กองกัน') >= 0
        ? normalizeLookupId_(row[headers.indexOf('เลขที่กองกัน')])
        : '';
      if (rowId !== normalizedId && rowLookup !== normalizedLookup) return;
      const timestampValue = headers.indexOf('submitted_at') >= 0
        ? row[headers.indexOf('submitted_at')]
        : '';
      const timestamp = timestampValue instanceof Date
        ? timestampValue.getTime()
        : Date.parse(normalizeValue_(timestampValue));
      const phase = headers.indexOf('phase') >= 0
        ? normalizePhase_(row[headers.indexOf('phase')])
        : '';
      const update = (field, value) => {
        if (normalizeValue_(value) === '') return;
        const previous = latest.get(field);
        if (previous && Number.isFinite(previous.timestamp) && Number.isFinite(timestamp)
          && timestamp < previous.timestamp) return;
        if (previous && Number.isFinite(previous.timestamp) && !Number.isFinite(timestamp)) return;
        if (previous && !Number.isFinite(previous.timestamp) && !Number.isFinite(timestamp)
          && offset < previous.offset) return;
        record[field] = normalizeValue_(value);
        latest.set(field, { timestamp: timestamp, offset: offset });
      };
      if (headers.indexOf('pre_score') >= 0) update('pre_test', row[headers.indexOf('pre_score')]);
      if (headers.indexOf('post_score') >= 0) update('post_test', row[headers.indexOf('post_score')]);
      if (phase === 'score' && headers.indexOf('score') >= 0) {
        update('knowledge_assessment', row[headers.indexOf('score')]);
      }
    });
  }
  const tacticalSheet = spreadsheet.getSheetByName('ScooreT');
  if (tacticalSheet && tacticalSheet.getLastRow() > 1) {
    const match = tacticalSheet.getRange(2, 1, tacticalSheet.getLastRow() - 1, 29).getDisplayValues()
      .find((row) => normalizeLookupId_(row[0]) === normalizedLookup
        && row.slice(3, 29).some((value) => normalizeValue_(value) !== ''));
    if (match) record.special_task = normalizeValue_(match[28]);
  }
  const assessmentIndex = spreadsheet.getSheetByName(CONFIG.specialAssessmentIndexSheetName);
  if (assessmentIndex && assessmentIndex.getLastRow() > 1) {
    assessmentIndex.getRange(2, 1, assessmentIndex.getLastRow() - 1, 7).getDisplayValues()
      .forEach((row) => {
        const assessmentSheet = spreadsheet.getSheetByName(normalizeValue_(row[3]));
        if (!assessmentSheet || assessmentSheet.getLastRow() < 2) return;
        const match = assessmentSheet.getDataRange().getDisplayValues().slice(1)
          .find((assessmentRow) => normalizeLookupId_(assessmentRow[1]) === normalizedLookup);
        if (!match) return;
        const assessments = JSON.parse(record.assessments);
        assessments.push({
          assessmentId: normalizeValue_(row[0]),
          title: normalizeValue_(row[2]),
          score: normalizeValue_(match[match.length - 1]),
          total: normalizeValue_(row[6]),
          recordedAt: normalizeValue_(match[0])
        });
        record.assessments = JSON.stringify(assessments);
      });
  }
  writeLearningSummaryPatch_(normalizedId, normalizedLookup, record);
}

function findRegistrationRecord_(registrationId) {
  const requestedId = normalizeValue_(registrationId).replace(/^'/, '');
  const spreadsheet = getRegistrationSpreadsheet_();
  const dataSheet = spreadsheet.getSheetByName(CONFIG.sourceSheetName);
  if (dataSheet && dataSheet.getLastRow() > 1) {
    const dataColumns = getDataRegistrationColumns_(dataSheet);
    if (dataColumns.registrationId > 0 && dataColumns.email > 0
      && dataColumns.episode > 0 && dataColumns.registeredAt > 0) {
      const width = Math.max(4, dataSheet.getLastColumn());
      const dataRows = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, width).getDisplayValues();
      const matches = dataRows.filter((row) =>
        normalizeValue_(row[dataColumns.registrationId - 1]).replace(/^'/, '') === requestedId);
      if (matches.length === 1) {
        const row = matches[0];
        const values = [
          row[dataColumns.registrationId - 1],
          row[dataColumns.registeredAt - 1],
          row[0],
          row[0],
          row[1],
          row[2],
          row[3],
          row[dataColumns.email - 1],
          row[dataColumns.episode - 1],
          'class-registration'
        ];
        return buildRegistrationRecord_(values);
      }
      if (matches.length > 1) return null;
    }
  }

  const sheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const width = Math.max(sheet.getLastColumn(), CONFIG.registrationHeaders.length);
  const rows = sheet.getRange(1, 1, sheet.getLastRow(), width).getDisplayValues();
  const headers = rows[0].map((header) => normalizeValue_(header));
  const registrationIdColumn = headers.indexOf('registration_id');
  if (registrationIdColumn < 0) return null;
  const match = rows.slice(1).find((row) =>
    normalizeValue_(row[registrationIdColumn]).replace(/^'/, '') === requestedId);
  return match ? buildRegistrationRecord_(match.slice(0, CONFIG.registrationHeaders.length), headers) : null;
}

function findDataAttendanceStudent_(registrationId) {
  const sheet = getSourceSheet_();
  const columns = getDataRegistrationColumns_(sheet);
  if (columns.registrationId !== 6) {
    throw new Error('คอลัมน์ F ของชีต Data ต้องเป็น registration_id ก่อนใช้ระบบเข้าเรียน');
  }
  if ([columns.email, columns.episode, columns.registeredAt].some((column) => column < 1)) {
    throw new Error('ไม่พบคอลัมน์ข้อมูลลงทะเบียนที่จำเป็นในชีต Data');
  }
  if (sheet.getLastRow() < 2) return null;

  const width = Math.max(4, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues();
  const requestedId = normalizeValue_(registrationId).replace(/^'/, '');
  const matches = [];
  rows.forEach((row, index) => {
    if (normalizeValue_(row[5]).replace(/^'/, '') === requestedId) {
      matches.push({ rowNumber: index + 2, values: row });
    }
  });
  if (matches.length > 1) return { ambiguous: true };
  if (!matches.length) return null;

  const match = matches[0];
  const values = [
    match.values[5],
    match.values[columns.registeredAt - 1],
    match.values[0],
    match.values[0],
    match.values[1],
    match.values[2],
    match.values[3],
    match.values[columns.email - 1],
    match.values[columns.episode - 1],
    'class-registration'
  ];
  const record = buildRegistrationRecord_(values);
  record.rowNumber = match.rowNumber;
  return record;
}

function buildRegistrationRecord_(values, headers) {
  const registrationHeaders = headers || CONFIG.registrationHeaders;
  return {
    values: values.slice(0, CONFIG.registrationHeaders.length),
    examInfo: {
      registrationId: normalizeValue_(values[0]),
      lookupId: normalizeLookupId_(values[2]),
      rankName: normalizeValue_(values[4]),
      affiliation: normalizeValue_(values[5]),
      email: normalizeValue_(values[7]),
      formName: normalizeValue_(values[8])
    },
    columns: values.slice(0, CONFIG.registrationHeaders.length).map((value, index) => ({
      label: normalizeValue_(registrationHeaders[index]) || `คอลัมน์ ${String.fromCharCode(65 + index)}`,
      value: normalizeValue_(value)
    }))
  };
}

function findStudentRecord_(studentId) {
  const sheet = getSourceSheet_();
  const requestedId = normalizeLookupId_(studentId);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const lookupIds = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const rowOffsets = [];
  lookupIds.forEach((row, index) => {
    if (normalizeLookupId_(row[0]) === requestedId) rowOffsets.push(index);
  });
  if (!rowOffsets.length) return null;
  if (rowOffsets.length > 1) return { ambiguous: true };
  const rowOffset = rowOffsets[0];
  const row = sheet.getRange(rowOffset + 2, 1, 1, 4).getDisplayValues()[0];
  const headers = sheet.getRange(1, 1, 1, 4).getDisplayValues()[0];
  const columns = row.map((value, columnIndex) => ({
    label: normalizeValue_(headers[columnIndex]) || `คอลัมน์ ${String.fromCharCode(65 + columnIndex)}`,
    value: normalizeValue_(value)
  }));
  return { columns: columns, rowNumber: rowOffset + 2 };
}

function ensureDataRegistrationColumns_(sheet) {
  ensureSheetColumns_(sheet, 8);
  const headers = sheet.getRange(1, 1, 1, Math.max(8, sheet.getLastColumn())).getDisplayValues()[0]
    .map((header) => normalizeValue_(header).toLowerCase());
  const columns = CONFIG.dataRegistrationHeaders.map((header, index) => ({
    header: header,
    column: index + 5
  }));
  columns.forEach(({ header, column }) => {
    if (headers[column - 1] !== header) {
      throw new Error('หัวคอลัมน์ E:H ของชีต Data ต้องเป็น registration_email, registration_id, registration_episode และ registration_registered_at ตามลำดับ');
    }
  });
  sheet.getRange(1, 6, sheet.getMaxRows(), 1).setNumberFormat('@');
  return {
    email: 5,
    registrationId: 6,
    episode: 7,
    registeredAt: 8
  };
}

function getDataRegistrationColumns_(sheet) {
  const width = Math.max(4, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0]
    .map((header) => normalizeValue_(header).toLowerCase());
  const columns = {};
  CONFIG.dataRegistrationHeaders.forEach((header) => {
    columns[header] = headers.indexOf(header) + 1;
  });
  return {
    email: columns.registration_email,
    registrationId: columns.registration_id,
    episode: columns.registration_episode,
    registeredAt: columns.registration_registered_at
  };
}

function findDataRegistrationDuplicates_(sheet, columns, email, registrationId) {
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount < 1) return { email: false, registrationId: false };
  const emails = sheet.getRange(2, columns.email, rowCount, 1).getDisplayValues();
  const registrationIds = sheet.getRange(2, columns.registrationId, rowCount, 1).getDisplayValues();
  const requestedEmail = normalizeValue_(email).toLowerCase();
  const requestedRegistrationId = normalizeValue_(registrationId).replace(/^'/, '');
  return {
    email: emails.some((row) => normalizeValue_(row[0]).toLowerCase() === requestedEmail),
    registrationId: registrationIds.some((row) =>
      normalizeValue_(row[0]).replace(/^'/, '') === requestedRegistrationId)
  };
}

function areRegistrationValuesEqual_(left, right, compareDates) {
  if (!compareDates) return normalizeValue_(left) === normalizeValue_(right);
  const leftTimestamp = left instanceof Date ? left.getTime() : Date.parse(normalizeValue_(left));
  const rightTimestamp = right instanceof Date ? right.getTime() : Date.parse(normalizeValue_(right));
  return Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)
    ? leftTimestamp === rightTimestamp
    : normalizeValue_(left) === normalizeValue_(right);
}

function groupContiguousColumns_(columns) {
  const sorted = columns.slice().sort((left, right) => left - right);
  const groups = [];
  sorted.forEach((column) => {
    const current = groups[groups.length - 1];
    if (!current || column !== current.start + current.columns.length) {
      groups.push({ start: column, columns: [column] });
    } else {
      current.columns.push(column);
    }
  });
  return groups;
}

function writeDataRegistrationFields_(sheet, rowNumber, columns, values) {
  const columnFields = [
    { column: columns.email, value: values[0] },
    { column: columns.registrationId, value: values[1] },
    { column: columns.episode, value: values[2] },
    { column: columns.registeredAt, value: values[3] }
  ].sort((left, right) => left.column - right.column);
  const groups = [];
  columnFields.forEach((field) => {
    const group = groups[groups.length - 1];
    if (!group || field.column !== group.start + group.fields.length) {
      groups.push({ start: field.column, fields: [field] });
    } else {
      group.fields.push(field);
    }
  });
  groups.forEach((group) => {
    sheet.getRange(rowNumber, group.start, 1, group.fields.length)
      .setValues([group.fields.map((field) => field.value)]);
  });
}

function getSourceSheet_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  if (!spreadsheet) {
    throw new Error('ไม่พบ Spreadsheet ต้นทาง');
  }

  const sheet = spreadsheet.getSheetByName(CONFIG.sourceSheetName);
  if (!sheet) {
    throw new Error('ไม่พบชีตชื่อ Data');
  }
  return sheet;
}

function getOrCreateRegistrationSheet_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  if (!spreadsheet) {
    throw new Error('ไม่พบ Spreadsheet ต้นทาง');
  }

  let sheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.registrationSheetName);
  }

  const headerRange = sheet.getRange(1, 1, 1, CONFIG.registrationHeaders.length);
  if (headerRange.getValues()[0].every((value) => normalizeValue_(value) === '')) {
    headerRange.setValues([CONFIG.registrationHeaders]).setFontWeight('bold');
  }
  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(normalizeValue_);
  if (existingHeaders.indexOf('subject') >= 0) removeRegistrationSubjectColumn_(sheet);
  return sheet;
}

function removeRegistrationSubjectColumn_(sheet) {
  if (!sheet || sheet.getLastColumn() === 0) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(normalizeValue_);
  const subjectIndex = headers.indexOf('subject');
  if (subjectIndex >= 0) sheet.deleteColumn(subjectIndex + 1);
}

function getRegistrationSpreadsheet_() {
  try {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSpreadsheet && activeSpreadsheet.getId() === CONFIG.spreadsheetId) {
      return activeSpreadsheet;
    }
    return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  } catch (error) {
    throw new Error('ไม่สามารถเปิด Spreadsheet ต้นทางได้ กรุณาตรวจสอบสิทธิ์การเข้าถึง');
  }
}

// TODO: Confirm no legacy registration flow needs this helper before removing it.
function createUniqueRegistrationId_(sheet) {
  const existingIds = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat()
    : [];
  let id;
  do {
    id = String(Date.now()).slice(-13);
  } while (existingIds.indexOf(id) !== -1);
  return id;
}

function findRegistrationDuplicates_(sheet, email, registrationId) {
  if (!sheet) return { email: false, registrationId: false };
  const dataRowCount = sheet.getLastRow() - 1;
  if (dataRowCount < 1) return { email: false, registrationId: false };
  const emailColumn = CONFIG.registrationHeaders.indexOf('email') + 1;
  const existing = sheet.getRange(2, 1, dataRowCount, emailColumn).getDisplayValues();
  const requestedEmail = normalizeValue_(email).toLowerCase();
  const requestedRegistrationId = normalizeValue_(registrationId).replace(/^'/, '');
  return existing.reduce((duplicates, row) => {
    duplicates.email = duplicates.email
      || normalizeValue_(row[emailColumn - 1]).toLowerCase() === requestedEmail;
    duplicates.registrationId = duplicates.registrationId
      || normalizeValue_(row[0]).replace(/^'/, '') === requestedRegistrationId;
    return duplicates;
  }, { email: false, registrationId: false });
}

// TODO: Confirm no legacy migration depends on this helper before removing it.
function normalizeRegistrationLookupColumns_(sheet) {
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount < 1) {
    return;
  }

  const range = sheet.getRange(2, CONFIG.lookupIdColumn, rowCount, 2);
  const values = range.getDisplayValues().map((row) => [
    normalizeLookupId_(row[0]),
    normalizeLookupId_(row[1])
  ]);
  range.setValues(values);
}

function sortRegistrationSheet_(sheet) {
  const dataRowCount = sheet.getLastRow() - 1;
  if (dataRowCount < 2) {
    return;
  }

  sheet.getRange(2, 1, dataRowCount, CONFIG.registrationHeaders.length)
    .sort({ column: CONFIG.lookupIdColumn, ascending: true });
}

function getRegistrationSheet_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
  if (!sheet) {
    throw new Error('ไม่พบชีต Registration');
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), CONFIG.registrationHeaders.length)).getDisplayValues()[0]
    .map(normalizeValue_);
  if (headers.indexOf('subject') >= 0) removeRegistrationSubjectColumn_(sheet);
  return sheet;
}

function getOrCreateAttendanceSheet_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.attendanceSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.attendanceSheetName);
  }

  ensureAttendanceSubjectSchema_(sheet);
  return sheet;
}

function ensureAttendanceSubjectSchema_(sheet) {
  const headers = CONFIG.registrationHeaders.slice();
  headers.splice(headers.indexOf('email') + 1, 0, 'subject');
  headers.push('attendance_form_name');
  ensureSheetColumns_(sheet, headers.length);
  const readWidth = Math.max(sheet.getLastColumn(), headers.length);
  const existingHeaders = sheet.getRange(1, 1, 1, readWidth).getDisplayValues()[0]
    .map(normalizeValue_);
  const hasChangedHeaders = headers.some((header, index) => existingHeaders[index] !== header)
    || existingHeaders.length !== headers.length;
  let hasMissingData = false;
  const existingRowCount = sheet.getLastRow() - 1;
  if (!hasChangedHeaders && existingRowCount < 1) return;
  if (!hasChangedHeaders) {
    const existingSubjectIndex = headers.indexOf('subject');
    const existingFormNameIndex = headers.indexOf('form_name');
    const firstColumn = Math.min(existingSubjectIndex, existingFormNameIndex) + 1;
    const lastColumn = Math.max(existingSubjectIndex, existingFormNameIndex) + 1;
    const subjectAndFormNames = sheet.getRange(
      2,
      firstColumn,
      existingRowCount,
      lastColumn - firstColumn + 1
    ).getDisplayValues();
    const subjectsMatch = subjectAndFormNames.every((row) => {
      const subject = normalizeValue_(row[existingSubjectIndex + 1 - firstColumn]);
      const formName = normalizeValue_(row[existingFormNameIndex + 1 - firstColumn]);
      return subject && subject === formName;
    });
    hasMissingData = !subjectsMatch;
    if (subjectsMatch) return;
  }

  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, readWidth).getValues()
    : [];
  const sourceIndexes = new Map(existingHeaders.map((header, index) => [header, index]));
  const subjectIndex = headers.indexOf('subject');
  const legacyRoundIndex = sourceIndexes.get('form_name');
  const legacySubjectIndex = sourceIndexes.get('subject');
  const selectedSubjectIndex = sourceIndexes.get('attendance_subject');
  const migratedRows = rows.map((row) => headers.map((header) => {
    if (header === 'subject') {
      const selectedSubject = selectedSubjectIndex === undefined ? '' : normalizeValue_(row[selectedSubjectIndex]);
      const existingSubject = legacySubjectIndex === undefined ? '' : normalizeValue_(row[legacySubjectIndex]);
      return selectedSubject || existingSubject || 'รบด้วยวิธีรุก-ตีกลางวัน';
    }
    if (header === 'form_name') {
      const selectedSubject = selectedSubjectIndex === undefined ? '' : normalizeValue_(row[selectedSubjectIndex]);
      const existingSubject = legacySubjectIndex === undefined ? '' : normalizeValue_(row[legacySubjectIndex]);
      return selectedSubject || existingSubject || 'รบด้วยวิธีรุก-ตีกลางวัน';
    }
    if (header === 'attendance_form_name') {
      const savedRoundIndex = sourceIndexes.get('attendance_form_name');
      const savedRound = savedRoundIndex === undefined ? '' : normalizeValue_(row[savedRoundIndex]);
      const legacyRound = legacyRoundIndex === undefined ? '' : normalizeValue_(row[legacyRoundIndex]);
      return savedRound || (/^ครั้งที่ [1-4]$/.test(legacyRound) ? legacyRound : '');
    }
    if (header === 'form_name' && legacyRoundIndex !== undefined
      && /^ครั้งที่ [1-4]$/.test(normalizeValue_(row[legacyRoundIndex]))) return '';
    const index = sourceIndexes.get(header);
    return index === undefined ? '' : row[index];
  }));
  if (!hasChangedHeaders && !hasMissingData) return;

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (migratedRows.length) sheet.getRange(2, 1, migratedRows.length, headers.length).setValues(migratedRows);
  const extraColumns = sheet.getLastColumn() - headers.length;
  if (extraColumns > 0) sheet.deleteColumns(headers.length + 1, extraColumns);
  normalizeAttendanceLookupColumns_(sheet);
  sortAttendanceSheet_(sheet);
}

function normalizeAttendanceLookupColumns_(sheet) {
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount < 1) {
    return;
  }

  const range = sheet.getRange(2, CONFIG.lookupIdColumn, rowCount, 2);
  range.setNumberFormat('@');
  range.setValues(range.getDisplayValues().map((row) => [
    normalizeLookupId_(row[0]),
    normalizeLookupId_(row[1])
  ]));
}

function attendanceDuplicateExists_(sheet, registrationId, formName, subject) {
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount < 1) return false;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(normalizeValue_);
  const roundIndex = headers.indexOf('attendance_form_name');
  const subjectIndex = headers.indexOf('subject');
  if (roundIndex < 0 || subjectIndex < 0) throw new Error('โครงสร้างชีต Attendance ไม่ถูกต้อง');
  const firstColumn = Math.min(subjectIndex + 1, roundIndex + 1);
  const lastColumn = Math.max(subjectIndex + 1, roundIndex + 1);
  const personalIds = sheet.getRange(2, 1, rowCount, 1).getDisplayValues();
  const subjectAndRound = sheet.getRange(2, firstColumn, rowCount, lastColumn - firstColumn + 1).getDisplayValues();
  return personalIds.some((row, index) =>
    normalizeValue_(row[0]).replace(/^'/, '') === normalizeValue_(registrationId).replace(/^'/, '')
    && normalizeValue_(subjectAndRound[index][subjectIndex + 1 - firstColumn]) === normalizeValue_(subject)
    && normalizeValue_(subjectAndRound[index][roundIndex + 1 - firstColumn]) === normalizeValue_(formName)
  );
}

function sortAttendanceSheet_(sheet) {
  const dataRowCount = sheet.getLastRow() - 1;
  if (dataRowCount < 2) {
    return;
  }
  sheet.getRange(2, 1, dataRowCount, sheet.getLastColumn())
    .sort({ column: 3, ascending: true });
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeValue_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeLookupId_(value) {
  const normalized = normalizeValue_(value).replace(/\s+/g, '');
  return /^\d{1,4}$/.test(normalized)
    ? normalized.padStart(4, '0')
    : normalized;
}

function getErrorMessage_(error) {
  return error && error.message ? error.message : String(error);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
