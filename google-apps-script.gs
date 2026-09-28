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
    if (String(params.action || '').toLowerCase() === 'student-score-results') {
      return lookupStudentQuizResults_(params.studentId || '');
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
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    const data = (e && e.parameter) || {};
    const lookupId = normalizeValue_(data.lookupId);
    const registrationId = normalizeValue_(data.registrationId);
    const email = normalizeValue_(data.email);
    const episode = normalizeValue_(data.episode);
    const formName = normalizeValue_(data.formName);

    if (formName === 'teacher-application') {
      return submitTeacherApplication_(data);
    }
    if (formName === 'teacher-login') {
      return teacherLogin_(data);
    }
    if (formName === 'create-quiz') {
      return createQuiz_(data);
    }
    if (formName === 'submit-quiz') {
      return submitQuiz_(data);
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
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), CONFIG.teachersSheetName, [
    'teacher_id', 'approved_at', 'teacher_name', 'email', 'password_hash', 'status'
  ]);
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

function createQuiz_(data) {
  const email = CacheService.getScriptCache().get('teacher:' + normalizeValue_(data.token));
  if (!email) return jsonResponse_({ ok: false, message: 'กรุณาเข้าสู่ระบบครูใหม่' });
  const title = normalizeValue_(data.title);
  const duration = Number(data.duration || 30);
  const questionCount = Number(data.questionCount || 0);
  const attemptsAllowed = Number(data.attemptsAllowed || 1);
  const phase = normalizePhase_(data.phase);
  const passType = normalizeValue_(data.passType) === 'count' ? 'count' : 'percent';
  const passValue = Number(data.passValue ?? data.passScore ?? 0);
  const openAt = normalizeValue_(data.openAt);
  const closeAt = normalizeValue_(data.closeAt);
  let rows;
  try { rows = JSON.parse(data.questions || '[]'); } catch (error) { rows = []; }
  const validRows = Array.isArray(rows) && rows.length > 0 && rows.every((row) =>
    normalizeValue_(row.question) && normalizeValue_(row.choice1) && normalizeValue_(row.choice2)
    && normalizeValue_(row.choice3) && normalizeValue_(row.choice4) && /^[1-4]$/.test(normalizeValue_(row.answer)));
  if (!title || !validRows || !Number.isInteger(duration) || duration < 1
    || !Number.isInteger(questionCount) || questionCount < 1 || questionCount > rows.length
    || !Number.isInteger(attemptsAllowed) || attemptsAllowed < 1
    || !isValidDateRange_(openAt, closeAt) || !phase
    || !Number.isFinite(passValue) || passValue < 0
    || (passType === 'percent' && (passValue < 0 || passValue > 100))
    || (passType === 'count' && (passValue < 1 || passValue > questionCount))) {
    return jsonResponse_({ ok: false, message: 'ตรวจสอบชื่อเรื่อง ตัวเลือกทั้ง 4 ช่อง เฉลย 1-4 เกณฑ์ผ่าน และค่าการสอบให้ครบถ้วน' });
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
  const indexSheet = getOrCreateSheet_(spreadsheet, CONFIG.quizIndexSheetName, [
    'quiz_id', 'title', 'sheet_name', 'created_at', 'created_by', 'duration_minutes',
    'open_at', 'close_at', 'question_count', 'attempts_allowed', 'phase', 'pass_type', 'pass_value', 'pass_score', 'active'
  ]);
  indexSheet.appendRow([quizId, title, sheetName, new Date(), email, duration, openAt, closeAt,
    questionCount, attemptsAllowed, phase, passType, String(passValue), String(passValue), 'TRUE']);
  return jsonResponse_({ ok: true, quizId: quizId, message: 'สร้างข้อสอบเรียบร้อยแล้ว' });
}

function listQuizzes_() {
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), CONFIG.quizIndexSheetName, [
    'quiz_id', 'title', 'sheet_name', 'created_at', 'created_by', 'duration_minutes',
    'open_at', 'close_at', 'question_count', 'attempts_allowed', 'phase', 'pass_type', 'pass_value', 'pass_score', 'active'
  ]);
  const rows = sheet.getDataRange().getDisplayValues().slice(1)
    .filter((row) => row[15] !== 'FALSE')
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
  const attemptsRemaining = Math.max(0, Number(quiz.attemptsAllowed || 1) - quizAttemptCount);
  if (hasQuizAttempt_(studentId, quiz.quizId || normalizeValue_(quizId), requestedPhase, quiz.attemptsAllowed)) {
    return jsonResponse_({ ok: false, message: `คุณได้ใช้สิทธิ์สอบ${formatPhaseLabel_(requestedPhase)}ครบแล้ว ไม่สามารถสอบซ้ำได้`, remainingAttempts: 0, attemptsAllowed: quiz.attemptsAllowed, attemptsUsed: quizAttemptCount });
  }
  const sheet = getRegistrationSpreadsheet_().getSheetByName(quiz.sheetName);
  if (!sheet) return jsonResponse_({ ok: false, message: 'ไม่พบแบบทดสอบ' });
  const rows = sheet.getDataRange().getDisplayValues().slice(1)
    .map((row, index) => ({ rowNumber: index + 2, row: row }))
    .filter((item) => item.row[7] !== 'FALSE');
  const selected = shuffleServer_(rows).slice(0, Math.min(quiz.questionCount, rows.length));
  const attemptToken = Utilities.getUuid();
  CacheService.getScriptCache().put('quiz-attempt:' + attemptToken, JSON.stringify({
    quizId: normalizeValue_(quizId), studentId: normalizeValue_(studentId), phase: requestedPhase,
    questionIds: selected.map((item) => item.rowNumber)
  }), Math.max(300, quiz.duration * 60 + 300));
  return jsonResponse_({ ok: true, quizId: quiz.quizId || normalizeValue_(quizId), attemptToken: attemptToken, duration: quiz.duration,
    attemptsAllowed: quiz.attemptsAllowed, attemptsUsed: quizAttemptCount, remainingAttempts: attemptsRemaining, student: student.examInfo,
    passType: quiz.passType || 'percent', passValue: Number(quiz.passValue ?? quiz.passScore ?? 70), passScore: Number(quiz.passValue ?? quiz.passScore ?? 70),
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
  if (hasQuizAttempt_(studentId, quizId, phase, quiz.attemptsAllowed)) {
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
  const resultPayload = {
    result_id: 'R' + String(Date.now()),
    submitted_at: new Date(),
    student_id: studentId,
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
  appendQuizResult_(resultsSheet, resultPayload);
  CacheService.getScriptCache().remove('quiz-attempt:' + attemptToken);
  const summary = getQuizPhaseSummary_(studentId, quizId);
  return jsonResponse_({ ok: true, score: score, total: rows.length, phase: phase,
    student: student ? student.examInfo : null, phaseSummary: summary, message: 'ส่งคำตอบเรียบร้อยแล้ว' });
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
    'เลขที่กองกัน', 'ยศ-ชื่อ-สกุล', 'สังกัด', 'อีเมล', 'ตอนที่', 'score'
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
  const sheet = getOrCreateQuizResultsSheet_();
  const headers = getQuizResultHeaders_(sheet);
  const rows = sheet.getDataRange().getDisplayValues().slice(1);
  const studentIndex = headers.indexOf('student_id');
  const lookupIndex = headers.indexOf('เลขที่กองกัน');
  const normalizedStudentId = normalizeValue_(studentId);
  const normalizedLookupId = normalizeLookupId_(studentId);
  const phaseColumnMap = {
    'pre-test': 'pre_score',
    'post-test': 'post_score',
    'score': 'score',
    'midterm': 'score',
    'final': 'score'
  };
  const targetColumn = phaseColumnMap[phase] || 'score';

  let count = 0;
  rows.forEach((row) => {
    const rowStudentId = normalizeValue_(row[studentIndex] || '');
    const rowLookupId = normalizeLookupId_(row[lookupIndex] || '');
    const matchesStudent = !normalizedStudentId || rowStudentId === normalizedStudentId || rowLookupId === normalizedLookupId;
    if (!matchesStudent) return;
    const cellValue = normalizeValue_(row[headers.indexOf(targetColumn)] || '');
    if (cellValue !== '') count += 1;
  });

  return count;
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
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), CONFIG.quizIndexSheetName, [
    'quiz_id', 'title', 'sheet_name', 'created_at', 'created_by', 'duration_minutes',
    'open_at', 'close_at', 'question_count', 'attempts_allowed', 'phase', 'pass_type', 'pass_value', 'pass_score', 'active'
  ]);
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
  const sheet = getOrCreateSheet_(getRegistrationSpreadsheet_(), CONFIG.quizIndexSheetName, [
    'quiz_id', 'title', 'sheet_name', 'created_at', 'created_by', 'duration_minutes',
    'open_at', 'close_at', 'question_count', 'attempts_allowed', 'phase', 'pass_type', 'pass_value', 'pass_score', 'active'
  ]);
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

function lookupStudentQuizResults_(studentId) {
  const requestedId = normalizeValue_(studentId);
  if (!/^\d{13}$/.test(requestedId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณากรอกเลขประจำตัวประชาชนให้ครบ 13 หลัก'
    });
  }

  const sheet = getOrCreateQuizResultsSheet_();
  const headers = getQuizResultHeaders_(sheet);
  const rows = sheet.getDataRange().getDisplayValues();
  const studentIndex = headers.indexOf('student_id');
  if (studentIndex === -1) {
    return jsonResponse_({ ok: false, message: 'ยังไม่มีข้อมูลผลสอบใน QuizResults' });
  }

  const match = rows.slice(1).reverse().find((row) => normalizeValue_(row[studentIndex]) === requestedId);
  if (!match) {
    return jsonResponse_({ ok: false, message: 'ไม่พบข้อมูลผลสอบของเลขประจำตัวนี้ใน QuizResults' });
  }

  const student = {
    student_id: normalizeValue_(match[studentIndex] || ''),
    lookup_id: normalizeValue_(match[headers.indexOf('เลขที่กองกัน')] || ''),
    rank_name: normalizeValue_(match[headers.indexOf('ยศ-ชื่อ-สกุล')] || ''),
    affiliation: normalizeValue_(match[headers.indexOf('สังกัด')] || ''),
    email: normalizeValue_(match[headers.indexOf('อีเมล')] || ''),
    episode: normalizeValue_(match[headers.indexOf('ตอนที่')] || ''),
    pre_score: normalizeValue_(match[headers.indexOf('pre_score')] || ''),
    post_score: normalizeValue_(match[headers.indexOf('post_score')] || ''),
    score: normalizeValue_(match[headers.indexOf('score')] || ''),
    total: normalizeValue_(match[headers.indexOf('total')] || '')
  };

  return jsonResponse_({
    ok: true,
    data: {
      student: student,
      summary: [{ label: 'ก่อนเรียน', value: student.pre_score || '-', column: 'D' },
        { label: 'หลังเรียน', value: student.post_score || '-', column: 'E' },
        { label: 'คะแนนเก็บ', value: student.score || '-', column: 'L' }]
    }
  });
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
