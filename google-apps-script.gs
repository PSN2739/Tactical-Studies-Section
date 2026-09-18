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
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    const data = (e && e.parameter) || {};
    const lookupId = normalizeValue_(data.lookupId);
    const registrationId = normalizeValue_(data.registrationId);
    const email = normalizeValue_(data.email);
    const episode = normalizeValue_(data.episode);
    const formName = normalizeValue_(data.formName);

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
}

function setupRegistrationSheet() {
  const sheet = getOrCreateRegistrationSheet_();
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, CONFIG.registrationHeaders.length);
  return 'Registration sheet is ready.';
}

function lookupStudent_(studentId) {
  const requestedId = normalizeValue_(studentId);
  if (!/^\d{4}$/.test(requestedId)) {
    return jsonResponse_({
      ok: false,
      message: 'กรุณากรอกเลขค้นหาให้ครบ 4 หลัก'
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
        columns: row.slice(0, 9).map((value, index) => ({
          label: normalizeValue_(headers[index]) || `คอลัมน์ ${String.fromCharCode(65 + index)}`,
          value: normalizeValue_(value)
        }))
      };
    }
    return null;
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
    return sheet;
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

  sheet
    .getRange(2, 1, dataRowCount, CONFIG.registrationHeaders.length)
    .sort({ column: CONFIG.lookupIdColumn, ascending: true });
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
