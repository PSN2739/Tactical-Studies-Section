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
  announcementGalleryFolderId: '1mYtAuD15F6zD9TD-dzFAUsm4GZ7KBunQ',
  approvalEmail: 'nu2739@gmail.com',
  webAppUrl: 'https://script.google.com/macros/s/AKfycbylfNRFHqfE5QztOXuICj-NCqVD5U2zPfXUu16Z3-aqUm0D2u4mNEFojzk-6vKQxFQ/exec',
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
  ]
};

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
    if (String(params.action || '').toLowerCase() === 'get-quiz') {
      return getQuiz_(params.quizId || '', params.studentId || '', params.phase || 'pre-test', params.title || '');
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

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    const lookupId = normalizeValue_(data.lookupId);
    const registrationId = normalizeValue_(data.registrationId);
    const email = normalizeValue_(data.email);
    const episode = normalizeValue_(data.episode);

    if (formName === 'teacher-application') {
      return submitTeacherApplication_(data);
    }
    if (formName === 'teacher-login') {
      return teacherLogin_(data);
    }
    if (formName === 'teacher-dashboard') {
      return getTeacherDashboard_(data.token);
    }
    if (formName === 'create-quiz') {
      return createQuiz_(data);
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
        message: 'กรุณาระบุเลขค้นหาให้ครบ 4 หลัก'
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

    const student = findStudentRecord_(lookupId);
    if (!student) {
      return jsonResponse_({
        ok: false,
        message: 'ไม่พบหมายเลขประจำตัวในชีต Data'
      });
    }

    const sheet = getOrCreateRegistrationSheet_();
    if (registrationDataColumnBExists_(sheet, student.columns[1].value)) {
      return jsonResponse_({
        ok: false,
        code: 'DUPLICATE_REGISTRATION',
        message: 'ข้อมูลนี้ลงทะเบียนไว้แล้ว'
      });
    }

    sheet.appendRow([
      registrationId,
      new Date(),
      lookupId,
      lookupId,
      student.columns[1].value,
      student.columns[2].value,
      student.columns[3].value,
      email,
      episode,
      normalizeValue_(data.formName) || 'class-registration'
    ]);
    sortRegistrationSheet_(sheet);

    return jsonResponse_({
      ok: true,
      registrationId: registrationId,
      message: 'บันทึกข้อมูลเรียบร้อยแล้ว'
    });
  } catch (error) {
    return jsonResponse_({ ok: false, message: getErrorMessage_(error) });
  } finally {
    lock.releaseLock();
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

function getQuizIndexHeaders_() {
  return [
    'quiz_id', 'title', 'sheet_name', 'created_at', 'created_by', 'duration_minutes',
    'open_at', 'close_at', 'question_count', 'attempts_allowed', 'phase', 'pass_type',
    'pass_value', 'pass_score', 'active'
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
  const attemptsAllowed = Number(data.attemptsAllowed || 1);
  const phase = normalizePhase_(data.phase);
  const questionType = normalizeValue_(data.questionType) === 'yes-no' ? 'yes-no' : 'multiple-choice';
  const passType = normalizeValue_(data.passType) === 'count' ? 'count' : 'percent';
  const passValue = Number(data.passValue ?? data.passScore ?? 0);
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
    || !Number.isInteger(attemptsAllowed) || attemptsAllowed < 1
    || !isValidDateRange_(openAt, closeAt) || !phase
    || !Number.isFinite(passValue) || passValue < 0
    || (passType === 'percent' && (passValue < 0 || passValue > 100))
    || (passType === 'count' && (passValue < 1 || passValue > questionCount))) {
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
    questionCount, attemptsAllowed, phase, passType, String(passValue), String(passValue), 'TRUE']);
  return jsonResponse_({ ok: true, quizId: quizId, message: 'สร้างข้อสอบเรียบร้อยแล้ว' });
}

function listQuizzes_() {
  const sheet = getOrCreateQuizIndexSheet_();
  const rows = sheet.getDataRange().getDisplayValues().slice(1)
    .filter((row) => row[14] !== 'FALSE')
    .map((row) => ({ quizId: row[0], title: row[1], duration: row[5], openAt: row[6], closeAt: row[7],
      questionCount: row[8], attemptsAllowed: row[9], phase: normalizePhase_(row[10]) || 'pre-test',
      passType: normalizeValue_(row[11]) === 'count' ? 'count' : 'percent', passValue: Number(row[12] || row[13] || 70) }));
  return jsonResponse_({ ok: true, quizzes: rows });
}

function getQuiz_(quizId, studentId, phase, title) {
  const quiz = quizId ? findQuizMetadata_(quizId) : findQuizMetadataByTitle_(title, phase);
  if (!quiz) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
  const requestedPhase = normalizePhase_(phase);
  if (!requestedPhase) return jsonResponse_({ ok: false, message: 'ไม่พบช่วงสอบที่ถูกต้อง' });
  if (!isQuizOpen_(quiz)) return jsonResponse_({ ok: false, message: 'แบบทดสอบยังไม่เปิดหรือปิดแล้ว' });
  const student = findRegistrationRecord_(normalizeValue_(studentId));
  if (!student) return jsonResponse_({ ok: false, message: 'ไม่พบข้อมูลผู้เข้าสอบในชีต Registration' });
  const quizAttemptCount = countQuizAttempts_(studentId, quiz.quizId || normalizeValue_(quizId), requestedPhase);
  const unlimitedUntilPass = requestedPhase === 'post-test';
  const attemptsRemaining = unlimitedUntilPass ? -1 : Math.max(0, Number(quiz.attemptsAllowed || 1) - quizAttemptCount);
  if (unlimitedUntilPass && hasPassedPostTest_(studentId, quiz.quizId || normalizeValue_(quizId))) {
    return jsonResponse_({ ok: false, message: 'ท่านสอบหลังเรียนผ่านเกณฑ์ 80% แล้ว ไม่สามารถสอบซ้ำได้', remainingAttempts: 0, attemptsUsed: quizAttemptCount });
  }
  if (!unlimitedUntilPass && hasQuizAttempt_(studentId, quiz.quizId || normalizeValue_(quizId), requestedPhase, quiz.attemptsAllowed)) {
    return jsonResponse_({ ok: false, message: `คุณได้ใช้สิทธิ์สอบ${formatPhaseLabel_(requestedPhase)}ครบแล้ว ไม่สามารถสอบซ้ำได้`, remainingAttempts: 0, attemptsAllowed: quiz.attemptsAllowed, attemptsUsed: quizAttemptCount });
  }
  const sheet = getRegistrationSpreadsheet_().getSheetByName(quiz.sheetName);
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
  const rows = sheet.getDataRange().getDisplayValues().slice(1)
    .map((row, index) => ({ rowNumber: index + 2, row: row }))
    .filter((item) => item.row[7] !== 'FALSE');
  const resolvedQuizId = quiz.quizId || normalizeValue_(quizId);
  const questionCount = Math.min(quiz.questionCount, rows.length);
  let selected;
  if (requestedPhase === 'pre-test' || requestedPhase === 'post-test') {
    const stableQuestionSet = shuffleForSeed_(
      rows,
      `${resolvedQuizId}:${normalizeValue_(studentId)}:pre-post`
    ).slice(0, questionCount);
    selected = requestedPhase === 'post-test'
      ? shuffleForSeed_(stableQuestionSet, Utilities.getUuid())
      : stableQuestionSet;
  } else {
    selected = shuffleServer_(rows).slice(0, questionCount);
  }
  const attemptToken = Utilities.getUuid();
  CacheService.getScriptCache().put('quiz-attempt:' + attemptToken, JSON.stringify({
    quizId: resolvedQuizId, studentId: normalizeValue_(studentId), phase: requestedPhase,
    questionIds: selected.map((item) => item.rowNumber)
  }), Math.max(300, quiz.duration * 60 + 300));
  const passType = unlimitedUntilPass ? 'percent' : (quiz.passType || 'percent');
  const passValue = unlimitedUntilPass ? 80 : Number(quiz.passValue ?? quiz.passScore ?? 70);
  return jsonResponse_({ ok: true, quizId: resolvedQuizId, attemptToken: attemptToken, duration: quiz.duration,
    attemptsAllowed: unlimitedUntilPass ? 0 : quiz.attemptsAllowed, attemptsUsed: quizAttemptCount, remainingAttempts: attemptsRemaining, student: student.examInfo,
    passType: passType, passValue: passValue, passScore: passValue,
    questions: selected.map((item) => ({ id: item.rowNumber, question: item.row[0], choices: item.row.slice(1, 5) })) });
}

function submitQuiz_(data) {
  const quizId = normalizeValue_(data.quizId);
  const studentId = normalizeValue_(data.studentId);
  const phase = normalizePhase_(data.phase);
  const attemptToken = normalizeValue_(data.attemptToken);
  let attempt;
  try { attempt = JSON.parse(CacheService.getScriptCache().get('quiz-attempt:' + attemptToken) || 'null'); } catch (error) { attempt = null; }
  if (!attempt || attempt.quizId !== quizId || attempt.studentId !== studentId || attempt.phase !== phase) {
    return jsonResponse_({ ok: false, message: 'เซสชันการสอบไม่ถูกต้อง กรุณาเริ่มสอบใหม่' });
  }
  const quiz = findQuizMetadata_(quizId);
  if (!quiz || !isQuizOpen_(quiz)) return jsonResponse_({ ok: false, message: 'แบบทดสอบยังไม่เปิดหรือปิดแล้ว' });
  if (!studentId) return jsonResponse_({ ok: false, message: 'กรุณาระบุเลขประจำตัว' });
  const resultsSheet = getOrCreateQuizResultsSheet_();
  const unlimitedUntilPass = phase === 'post-test';
  if (unlimitedUntilPass && hasPassedPostTest_(studentId, quizId)) {
    return jsonResponse_({ ok: false, message: 'ท่านสอบหลังเรียนผ่านเกณฑ์ 80% แล้ว ไม่สามารถสอบซ้ำได้' });
  }
  if (!unlimitedUntilPass && hasQuizAttempt_(studentId, quizId, phase, quiz.attemptsAllowed)) {
    return jsonResponse_({ ok: false, message: 'ผู้เข้าสอบใช้สิทธิ์ช่วงนี้ครบแล้ว' });
  }
  let answers;
  try { answers = JSON.parse(data.answers || '{}'); } catch (error) { answers = {}; }
  const sheet = getRegistrationSpreadsheet_().getSheetByName(quiz.sheetName);
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
  const questionIds = attempt.questionIds;
  const allRows = sheet.getDataRange().getDisplayValues();
  const rows = questionIds.map((id) => ({ id: Number(id), row: allRows[Number(id) - 1] }))
    .filter((item) => item.row && item.row[7] !== 'FALSE');
  let score = 0;
  rows.forEach((item) => {
    if (normalizeValue_(answers[String(item.id)]).toLowerCase() === normalizeValue_(item.row[5]).toLowerCase()) score += 1;
  });
  const student = findRegistrationRecord_(studentId);
  const resultPassType = unlimitedUntilPass ? 'percent' : (quiz.passType || 'percent');
  const resultPassValue = unlimitedUntilPass ? 80 : Number(quiz.passValue ?? quiz.passScore ?? 70);
  const resultPayload = {
    result_id: 'R' + String(Date.now()),
    submitted_at: new Date(),
    student_id: studentId,
    quiz_id: quizId,
    phase: phase,
    pass_type: resultPassType,
    pass_value: resultPassValue,
    passed: resultPassType === 'count'
      ? score >= resultPassValue
      : (rows.length > 0 && (score / rows.length) * 100 >= resultPassValue),
    pre_score: phase === 'pre-test' ? score : '',
    post_score: phase === 'post-test' ? score : '',
    score: score,
    total: rows.length,
    lookup_id: student ? normalizeLookupId_(student.examInfo.lookupId) : '',
    rank_name: student ? student.examInfo.rankName : '',
    affiliation: student ? student.examInfo.affiliation : '',
    email: student ? student.examInfo.email : '',
    episode: student ? student.examInfo.formName : ''
  };
  appendQuizAttemptHistory_(resultPayload);
  appendQuizResult_(resultsSheet, resultPayload);
  CacheService.getScriptCache().remove('quiz-attempt:' + attemptToken);
  const summary = getQuizPhaseSummary_(studentId, quizId);
  return jsonResponse_({ ok: true, score: score, total: rows.length, phase: phase,
    passType: resultPayload.pass_type, passValue: resultPayload.pass_value, passScore: resultPayload.pass_value,
    passed: resultPayload.passed,
    student: student ? student.examInfo : null, phaseSummary: summary,
    message: unlimitedUntilPass && !resultPayload.passed
      ? 'ท่านไม่ผ่านเกณฑ์ 80% สามารถเข้าสอบใหม่ได้'
      : 'ส่งคำตอบเรียบร้อยแล้ว' });
}

function getQuizPhaseSummary_(studentId, quizId) {
  const sheet = getOrCreateQuizResultsSheet_();
  const headers = getQuizResultHeaders_(sheet);
  const rows = sheet.getDataRange().getDisplayValues().slice(1);
  const studentIndex = headers.indexOf('student_id');
  const lookupIndex = headers.indexOf('เลขที่กองกัน');
  const summary = {
    'pre-test': { score: '-', total: '-', submittedAt: '' },
    'post-test': { score: '-', total: '-', submittedAt: '' },
    'score': { score: '-', total: '-', submittedAt: '' }
  };
  rows.forEach((row) => {
    const rowStudentId = normalizeValue_(row[studentIndex] || '');
    const rowLookupId = normalizeLookupId_(row[lookupIndex] || '');
    const normalizedStudentId = normalizeValue_(studentId);
    const normalizedLookupId = normalizeLookupId_(studentId);
    const matchesStudent = !normalizedStudentId || rowStudentId === normalizedStudentId || rowLookupId === normalizedLookupId;
    if (!matchesStudent) return;
    const preScore = row[headers.indexOf('pre_score')] || '';
    const postScore = row[headers.indexOf('post_score')] || '';
    const score = row[headers.indexOf('score')] || '';
    if (preScore !== '') summary['pre-test'] = { score: preScore, total: row[headers.indexOf('total')] || '-', submittedAt: row[headers.indexOf('submitted_at')] || '' };
    if (postScore !== '') summary['post-test'] = { score: postScore, total: row[headers.indexOf('total')] || '-', submittedAt: row[headers.indexOf('submitted_at')] || '' };
    if (score !== '') summary['score'] = { score: score, total: row[headers.indexOf('total')] || '-', submittedAt: row[headers.indexOf('submitted_at')] || '' };
  });
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
  const headers = getQuizResultHeaders_(sheet);
  const lookupColumn = headers.indexOf('เลขที่กองกัน') + 1;
  if (lookupColumn > 0) {
    sheet.getRange(1, lookupColumn, sheet.getMaxRows(), 1).setNumberFormat('@');
    const rowCount = sheet.getLastRow() - 1;
    if (rowCount > 0) {
      const lookupValues = sheet.getRange(2, lookupColumn, rowCount, 1).getDisplayValues()
        .map((row) => [normalizeLookupId_(row[0])]);
      sheet.getRange(2, lookupColumn, rowCount, 1).setValues(lookupValues);
    }
  }
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

function hasPassedPostTest_(studentId, quizId) {
  return getQuizAttemptHistoryRows_(studentId, quizId, 'post-test').some((row) => {
    const score = Number(row.score);
    const total = Number(row.total);
    return total > 0 && score / total >= 0.8;
  });
}

function getQuizAttemptHistoryRows_(studentId, quizId, phase) {
  const sheet = getOrCreateQuizAttemptHistorySheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const rows = sheet.getDataRange().getDisplayValues().slice(1);
  const studentIndex = headers.indexOf('student_id');
  const lookupIndex = headers.indexOf('lookup_id');
  const quizIndex = headers.indexOf('quiz_id');
  const phaseIndex = headers.indexOf('phase');
  const normalizedStudentId = normalizeValue_(studentId);
  const normalizedLookupId = normalizeLookupId_(studentId);
  return rows.filter((row) => {
    const rowStudentId = normalizeValue_(row[studentIndex] || '');
    const rowLookupId = normalizeLookupId_(row[lookupIndex] || '');
    return row[quizIndex] === normalizeValue_(quizId)
      && row[phaseIndex] === normalizePhase_(phase)
      && (!normalizedStudentId || rowStudentId === normalizedStudentId || rowLookupId === normalizedLookupId);
  });
}

function getOrCreateQuizAttemptHistorySheet_() {
  const headers = ['attempt_id', 'submitted_at', 'student_id', 'lookup_id', 'quiz_id', 'phase', 'score', 'total', 'passed'];
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), 'QuizAttemptHistory', headers);
  if (sheet.getLastRow() === 1) {
    const resultSheet = getOrCreateQuizResultsSheet_();
    const resultHeaders = getQuizResultHeaders_(resultSheet);
    const resultRows = resultSheet.getDataRange().getDisplayValues().slice(1);
    const indexOf = (name) => resultHeaders.indexOf(name);
    const legacyRows = resultRows.filter((row) => row[indexOf('quiz_id')] && row[indexOf('phase')])
      .map((row) => [
        row[indexOf('result_id')], row[indexOf('submitted_at')], row[indexOf('student_id')],
        row[indexOf('เลขที่กองกัน')], row[indexOf('quiz_id')], row[indexOf('phase')],
        row[indexOf('score')], row[indexOf('total')], row[indexOf('passed')]
      ]);
    if (legacyRows.length) sheet.getRange(2, 1, legacyRows.length, headers.length).setValues(legacyRows);
  }
  return sheet;
}

function appendQuizAttemptHistory_(result) {
  const sheet = getOrCreateQuizAttemptHistorySheet_();
  const student = findRegistrationRecord_(result.student_id || '');
  const lookupId = student ? normalizeLookupId_(student.examInfo.lookupId) : normalizeLookupId_(result.lookup_id || '');
  sheet.appendRow([
    result.result_id, result.submitted_at, result.student_id, lookupId, result.quiz_id,
    result.phase, result.score, result.total, result.passed ? 'TRUE' : 'FALSE'
  ]);
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

  const values = sheet.getDataRange().getDisplayValues();
  const studentIndex = headers.indexOf('student_id');
  let existingRowIndex = -1;
  for (let index = 1; index < values.length; index += 1) {
    if (normalizeValue_(values[index][studentIndex]) === normalizeValue_(result.student_id)) {
      existingRowIndex = index;
      break;
    }
  }

  const row = Array(headers.length).fill('');
  if (existingRowIndex >= 0) {
    const existingRow = values[existingRowIndex];
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
  row[headers.indexOf('passed')] = result.passed ? 'TRUE' : 'FALSE';
  row[headers.indexOf('pre_score')] = result.pre_score || row[headers.indexOf('pre_score')] || '';
  row[headers.indexOf('post_score')] = result.post_score || row[headers.indexOf('post_score')] || '';
  row[headers.indexOf('score')] = result.score ?? row[headers.indexOf('score')] ?? '';
  row[headers.indexOf('total')] = result.total || row[headers.indexOf('total')] || '';
  row[headers.indexOf('เลขที่กองกัน')] = lookupId || row[headers.indexOf('เลขที่กองกัน')] || '';
  row[headers.indexOf('ยศ-ชื่อ-สกุล')] = rankName || row[headers.indexOf('ยศ-ชื่อ-สกุล')] || '';
  row[headers.indexOf('สังกัด')] = affiliation || row[headers.indexOf('สังกัด')] || '';
  row[headers.indexOf('อีเมล')] = email || row[headers.indexOf('อีเมล')] || '';
  row[headers.indexOf('ตอนที่')] = episode || row[headers.indexOf('ตอนที่')] || '';

  if (existingRowIndex >= 0) {
    const range = sheet.getRange(existingRowIndex + 1, 1, 1, headers.length);
    range.setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  sortQuizResultsSheet_(sheet, headers);
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
    const passType = normalizeValue_(rows[index][11]) === 'count' ? 'count' : 'percent';
    const passValue = Number(rows[index][12] || rows[index][13] || 70);
    return { sheetName: rows[index][2], duration: Number(rows[index][5]) || 30,
      openAt: rows[index][6], closeAt: rows[index][7], questionCount: Number(rows[index][8]) || 1,
      attemptsAllowed: Number(rows[index][9]) || 1, phase: normalizePhase_(rows[index][10]) || 'pre-test',
      passType: passType, passValue: passValue, passScore: passValue,
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
    const passType = normalizeValue_(rows[index][11]) === 'count' ? 'count' : 'percent';
    const passValue = Number(rows[index][12] || rows[index][13] || 70);
    if (normalizeQuizTitle_(rows[index][1]) !== requestedTitle || !phaseMatches || rows[index][14] === 'FALSE') continue;
    return { quizId: rows[index][0], title: rows[index][1], sheetName: rows[index][2],
      duration: Number(rows[index][5]) || 30, openAt: rows[index][6], closeAt: rows[index][7],
      questionCount: Number(rows[index][8]) || 1, attemptsAllowed: Number(rows[index][9]) || 1,
      phase: requestedPhase, passType: passType, passValue: passValue, passScore: passValue,
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
  return items.sort(() => Math.random() - 0.5);
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

  if (!/^\d{13}$/.test(registrationId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณาระบุหมายเลขประจำตัวให้ครบ 13 หลัก'
    });
  }

  if (!/^ครั้งที่ [1-4]$/.test(attendanceFormName)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณาเลือกครั้งที่ 1-4'
    });
  }

  const source = findRegistrationRecord_(registrationId);
  if (!source) {
    return jsonResponse_({
      ok: false,
      message: 'ไม่พบหมายเลขประจำตัวในชีต Registration'
    });
  }

  const sheet = getOrCreateAttendanceSheet_();
  if (attendanceDuplicateExists_(sheet, source.values[4], attendanceFormName)) {
    return jsonResponse_({
      ok: false,
      code: 'DUPLICATE_ATTENDANCE',
      message: 'ข้อมูลนี้ลงทะเบียนไว้แล้ว'
    });
  }

  sheet.appendRow(source.values.concat([attendanceFormName]));
  sortAttendanceSheet_(sheet);
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
  return 'Registration sheet is ready.';
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
    if (!Array.isArray(entry.scores) || entry.scores.length !== 25) {
      return jsonResponse_({ ok: false, message: 'ข้อมูลคะแนนต้องมี 25 ช่องต่อคน' });
    }

    let total = 0;
    const scores = [];
    for (const rawScore of entry.scores) {
      if (rawScore === '' || rawScore === null || rawScore === undefined) {
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
    if (total > 200) {
      return jsonResponse_({ ok: false, message: 'คะแนนรวมของเลขที่ ' + lookupId + ' ต้องไม่เกิน 200 คะแนน' });
    }

    rows.push({ existingRow: existing.rowNumber, scores: scores.concat([total]) });
  }

  rows.forEach((entry) => {
    sheet.getRange(entry.existingRow, 4, 1, 26).setValues([entry.scores]);
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
  const quizParticipants = new Map();
  quizzes.forEach((quiz) => quizParticipants.set(quiz.quizId, new Set()));
  historyRows.slice(1).forEach((row) => {
    const participants = quizParticipants.get(normalizeValue_(row[quizIndexColumn]));
    if (!participants) return;
    const studentId = normalizeValue_(row[studentIndex]) || normalizeLookupId_(row[lookupIndex]);
    if (studentId) participants.add(studentId);
  });
  quizzes.forEach((quiz) => {
    quiz.participantCount = quizParticipants.get(quiz.quizId).size;
  });

  const assessmentIndex = getOrCreateSpecialAssessmentIndex_();
  const assessmentRows = assessmentIndex.getDataRange().getDisplayValues().slice(1)
    .filter((row) => row[10] !== 'FALSE' && row[0] && row[3]
      && normalizeValue_(row[9]).toLowerCase() === email.toLowerCase());
  const assessments = assessmentRows.map((row) => {
    const assessmentSheet = spreadsheet.getSheetByName(row[3]);
    const studentIds = assessmentSheet && assessmentSheet.getLastRow() > 1
      ? assessmentSheet.getRange(2, 2, assessmentSheet.getLastRow() - 1, 1).getDisplayValues().flat()
        .map(normalizeValue_).filter(Boolean)
      : [];
    return {
      assessmentId: row[0],
      title: row[2],
      participantCount: new Set(studentIds).size
    };
  });

  return jsonResponse_({
    ok: true,
    teacher: { name: normalizeValue_(teacher[2]), email: email },
    summary: {
      quizCount: quizzes.length,
      assessmentCount: assessments.length
    },
    quizzes: quizzes,
    assessments: assessments,
    updatedAt: new Date().toISOString()
  });
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
  return jsonResponse_({ ok: true, saved: rows.length, message: 'บันทึกผลแบบประเมินเรียบร้อยแล้ว' });
}

function lookupStudent_(studentId) {
  const requestedId = normalizeValue_(studentId);
  if (!/^\d{4}$/.test(requestedId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณากรอกเลขค้นหาให้ครบ 4 หลัก'
    });
  }

  const student = findStudentRecord_(requestedId);
  if (!student) {
    return jsonResponse_({
      ok: false,
      message: 'ไม่พบหมายเลขประจำตัวในชีต Data'
    });
  }

  return jsonResponse_({
    ok: true,
    data: {
      columns: student.columns
    }
  });
}

function lookupAttendance_(registrationId) {
  const requestedId = normalizeValue_(registrationId);
  if (!/^\d{13}$/.test(requestedId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณากรอกเลขประจำตัวให้ครบ 13 หลัก'
    });
  }

  const record = findRegistrationRecord_(requestedId);
  if (!record) {
    return jsonResponse_({
      ok: false,
      message: 'ไม่พบหมายเลขประจำตัวในชีต Registration'
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

  const spreadsheet = getRegistrationSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.attendanceSheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse_({ ok: false, message: 'ไม่พบข้อมูลสำหรับเข้าสู่ระบบ' });
  }

  const rows = sheet.getDataRange().getDisplayValues();
  const row = rows.slice(1).find((record) => normalizeValue_(record[0]).replace(/^'/, '') === password
    && normalizeValue_(record[7]).toLowerCase() === email);
  if (!row) return jsonResponse_({ ok: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });

  return jsonResponse_({
    ok: true,
    data: {
      student: {
        personalId: normalizeValue_(row[0]).replace(/^'/, ''),
        attendanceDate: normalizeValue_(row[1]),
        battalionNumber: normalizeValue_(row[2]),
        fullName: normalizeValue_(row[4]),
        email: normalizeValue_(row[7]),
        episode: normalizeValue_(row[8])
      },
      scores: getTeachingScores_(spreadsheet, row[0], row[2])
    }
  });
}

function getTeachingScores_(spreadsheet, personalId, lookupId) {
  const scores = { attitude: '', preTest: '', postTest: '', knowledgeAssessment: '', specialTask: '' };
  const resultsSheet = spreadsheet.getSheetByName('QuizResults');
  if (resultsSheet && resultsSheet.getLastRow() > 1) {
    const rows = resultsSheet.getDataRange().getDisplayValues();
    const headers = rows[0].map(normalizeValue_);
    const indexOf = (name) => headers.indexOf(name);
    const studentIndex = indexOf('student_id');
    const preIndex = indexOf('pre_score');
    const postIndex = indexOf('post_score');
    const scoreIndex = indexOf('score');
    const phaseIndex = indexOf('phase');

    rows.slice(1).reverse().forEach((row) => {
      if (studentIndex < 0 || normalizeValue_(row[studentIndex]).replace(/^'/, '') !== normalizeValue_(personalId).replace(/^'/, '')) return;
      if (!scores.preTest && preIndex >= 0) scores.preTest = normalizeValue_(row[preIndex]);
      if (!scores.postTest && postIndex >= 0) scores.postTest = normalizeValue_(row[postIndex]);
      const phase = phaseIndex >= 0 ? normalizePhase_(row[phaseIndex]) : '';
      if (!scores.knowledgeAssessment && scoreIndex >= 0 && phase === 'score') {
        scores.knowledgeAssessment = normalizeValue_(row[scoreIndex]);
      }
    });
  }

  const scoreSheet = spreadsheet.getSheetByName('ScooreT');
  if (scoreSheet && scoreSheet.getLastRow() > 1) {
    const rows = scoreSheet.getRange(2, 1, scoreSheet.getLastRow() - 1, 29).getDisplayValues();
    const wantedLookupId = normalizeLookupId_(lookupId);
    const match = rows.find((row) => normalizeLookupId_(row[0]) === wantedLookupId
      && row.slice(3, 29).some((value) => normalizeValue_(value) !== ''));
    if (match) scores.specialTask = normalizeValue_(match[28]);
  }
  return scores;
}

function findRegistrationRecord_(registrationId) {
  const sheet = getRegistrationSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.length > 0 ? values[0] : [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (normalizeValue_(row[0]) !== registrationId) {
      continue;
    }

    return {
      values: row.slice(0, 9),
      examInfo: {
        registrationId: normalizeValue_(row[0]),
        lookupId: normalizeLookupId_(row[2]),
        rankName: normalizeValue_(row[4]),
        affiliation: normalizeValue_(row[5]),
        email: normalizeValue_(row[7]),
        formName: normalizeValue_(row[8])
      },
      columns: row.slice(0, 9).map((value, index) => ({
        label: normalizeValue_(headers[index]) || `คอลัมน์ ${String.fromCharCode(65 + index)}`,
        value: normalizeValue_(value)
      }))
    };
  }
  return null;
}

function findStudentRecord_(studentId) {
  const sheet = getSourceSheet_();
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.length > 0 ? values[0] : [];
  const requestedId = normalizeLookupId_(studentId);

  for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    if (normalizeLookupId_(row[0]) !== requestedId) {
      continue;
    }

    const columns = [];
    for (let columnIndex = 0; columnIndex < 4; columnIndex += 1) {
      columns.push({
        label: normalizeValue_(headers[columnIndex]) || `คอลัมน์ ${String.fromCharCode(65 + columnIndex)}`,
        value: normalizeValue_(row[columnIndex])
      });
    }
    return { columns: columns };
  }

  return null;
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
    headerRange.setValues([CONFIG.registrationHeaders]);
    headerRange.setFontWeight('bold');
  }
  sheet.getRange(1, CONFIG.lookupIdColumn, sheet.getMaxRows(), 2).setNumberFormat('@');
  normalizeRegistrationLookupColumns_(sheet);
  return sheet;
}

function getRegistrationSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(CONFIG.spreadsheetId);
  } catch (error) {
    throw new Error('ไม่สามารถเปิด Spreadsheet ต้นทางได้ กรุณาตรวจสอบสิทธิ์การเข้าถึง');
  }
}

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

function registrationDataColumnBExists_(sheet, dataColumnB) {
  if (sheet.getLastRow() < 2) {
    return false;
  }

  const existingValues = sheet
    .getRange(2, 5, sheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .flat();
  return existingValues.indexOf(normalizeValue_(dataColumnB)) !== -1;
}

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

  sheet
    .getRange(2, 1, dataRowCount, CONFIG.registrationHeaders.length)
    .sort({ column: CONFIG.lookupIdColumn, ascending: true });
}

function getRegistrationSheet_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
  if (!sheet) {
    throw new Error('ไม่พบชีต Registration');
  }
  return sheet;
}

function getOrCreateAttendanceSheet_() {
  const spreadsheet = getRegistrationSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.attendanceSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.attendanceSheetName);
  }

  const headers = CONFIG.registrationHeaders;
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  if (headerRange.getValues()[0].every((value) => normalizeValue_(value) === '')) {
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
  }
  normalizeAttendanceLookupColumns_(sheet);
  return sheet;
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

function attendanceDuplicateExists_(sheet, dataColumnB, formName) {
  if (sheet.getLastRow() < 2) {
    return false;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getDisplayValues();
  return values.some((row) =>
    normalizeValue_(row[4]) === normalizeValue_(dataColumnB)
    && normalizeValue_(row[9]) === normalizeValue_(formName)
  );
}

function sortAttendanceSheet_(sheet) {
  const dataRowCount = sheet.getLastRow() - 1;
  if (dataRowCount < 2) {
    return;
  }
  sheet.getRange(2, 1, dataRowCount, 10).sort({ column: 1, ascending: true });
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
