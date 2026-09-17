/**
 * Tactical Studies Section - Google Sheets API
 *
 * ใช้กับ Google Spreadsheet ที่มีชีต Data เป็นข้อมูลต้นทาง
 * ระบบจะสร้างชีต Registration ให้เองเมื่อยังไม่มี
 *
 * วิธีติดตั้ง:
 * 1. เปิด Google Sheet > Extensions > Apps Script
 * 2. วางโค้ดนี้แทนโค้ดเดิม แล้วกด Save
 * 3. รันฟังก์ชัน setupRegistrationSheet หนึ่งครั้ง และอนุญาตสิทธิ์
 * 4. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. ใช้ URL /exec ที่ได้กับหน้าเว็บไซต์
 */

const CONFIG = {
  sourceSheetName: 'Data',
  registrationSheetName: 'Registration',
  registrationIdLength: 13,
  registrationHeaders: [
    'registration_id',
    'registered_at',
    'student_id',
    'student_name',
    'student_department',
    'student_quota',
    'full_name',
    'email',
    'phone',
    'department',
    'note',
    'form_name'
  ]
};

/**
 * GET /exec
 * - ?action=lookup&studentId=0001 ค้นหาข้อมูลจาก Data
 * - ?action=all แสดงข้อมูล Data ทั้งหมด (ควรใช้เฉพาะผู้ดูแล)
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || '').trim().toLowerCase();

    if (action === 'lookup') {
      return lookupStudent(params.studentId || params.studentCode || '');
    }

    if (action === 'all') {
      return jsonResponse({
        ok: true,
        data: readDataSheetRows_()
      });
    }

    return jsonResponse({
      ok: true,
      message: 'Tactical Studies Section API is running.'
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: getErrorMessage_(error)
    });
  }
}

/**
 * POST /exec
 * รับข้อมูลลงทะเบียนและบันทึกลงชีต Registration
 */
function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const data = parseRequestData_(e);
    const studentId = normalizeValue_(data.studentId || data.studentCode);

    if (!studentId) {
      return jsonResponse({
        ok: false,
        message: 'กรุณาระบุเลขประจำตัว'
      });
    }

    const student = findStudentRecord_(studentId);
    if (!student) {
      return jsonResponse({
        ok: false,
        message: 'ไม่พบเลขประจำตัวในชีต Data'
      });
    }

    const sheet = getOrCreateRegistrationSheet_();
    const registrationId = createUniqueRegistrationId_(sheet);
    const registeredAt = new Date();

    sheet.appendRow([
      registrationId,
      registeredAt,
      studentId,
      student.name,
      student.department,
      student.quota,
      normalizeValue_(data.fullName) || student.name,
      normalizeValue_(data.email),
      normalizeValue_(data.phone),
      normalizeValue_(data.department) || student.department,
      normalizeValue_(data.note),
      normalizeValue_(data.formName) || 'registration'
    ]);

    return jsonResponse({
      ok: true,
      registrationId: registrationId,
      message: 'บันทึกข้อมูลเรียบร้อยแล้ว'
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      message: getErrorMessage_(error)
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * รันฟังก์ชันนี้หนึ่งครั้งหลังวางโค้ด เพื่อสร้างหัวตาราง Registration
 */
function setupRegistrationSheet() {
  const sheet = getOrCreateRegistrationSheet_();
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, CONFIG.registrationHeaders.length);
  return 'Registration sheet is ready.';
}

function parseRequestData_(e) {
  if (!e) {
    return {};
  }

  if (e.parameter && Object.keys(e.parameter).length > 0) {
    return e.parameter;
  }

  const body = e.postData && e.postData.contents;
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error('รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง');
  }
}

function getOrCreateRegistrationSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('ไม่พบ Spreadsheet ที่เชื่อมกับ Apps Script นี้');
  }

  let sheet = spreadsheet.getSheetByName(CONFIG.registrationSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.registrationSheetName);
  }

  const headerRange = sheet.getRange(1, 1, 1, CONFIG.registrationHeaders.length);
  const currentHeaders = headerRange.getValues()[0];
  const hasHeaders = currentHeaders.some((value) => normalizeValue_(value) !== '');

  if (!hasHeaders) {
    headerRange.setValues([CONFIG.registrationHeaders]);
    headerRange.setFontWeight('bold');
  }

  return sheet;
}

function readDataSheetRows_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(CONFIG.sourceSheetName);

  if (!sheet) {
    throw new Error('ไม่พบชีตชื่อ Data');
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(normalizeHeader_);
  return values.slice(1)
    .filter((row) => row.some((value) => normalizeValue_(value) !== ''))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) {
          record[header] = normalizeValue_(row[index]);
        }
      });
      return record;
    });
}

function findStudentRecord_(studentId) {
  const requestedId = normalizeStudentId_(studentId);
  if (!requestedId) {
    return null;
  }

  const rows = readDataSheetRows_();
  const match = rows.find((row) => {
    const value = firstValue_(row, [
      'หมายเลขประจำตัว',
      'student_id',
      'studentid',
      'id',
      'รหัสนักเรียน'
    ]);
    return normalizeStudentId_(value) === requestedId;
  });

  if (!match) {
    return null;
  }

  return {
    name: firstValue_(match, ['ยศ - ชื่อ- สกุล', 'ยศ-ชื่อ-สกุล', 'ชื่อ-นามสกุล', 'name']),
    department: firstValue_(match, ['สังกัด', 'department', 'หน่วย']),
    quota: firstValue_(match, ['โควตา', 'quota'])
  };
}

function lookupStudent(studentId) {
  const requestedId = normalizeStudentId_(studentId);
  const student = findStudentRecord_(requestedId);

  if (!student) {
    return jsonResponse({
      ok: false,
      message: 'ไม่พบข้อมูลในชีต Data'
    });
  }

  return jsonResponse({
    ok: true,
    data: {
      studentId: requestedId,
      name: student.name,
      department: student.department,
      quota: student.quota
    }
  });
}

function createUniqueRegistrationId_(sheet) {
  const lastRow = sheet.getLastRow();
  const existingIds = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat()
    : [];

  let id;
  do {
    id = String(Date.now()).slice(-CONFIG.registrationIdLength);
  } while (existingIds.indexOf(id) !== -1);

  return id;
}

function firstValue_(record, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = record[normalizeHeader_(keys[i])];
    if (normalizeValue_(value) !== '') {
      return normalizeValue_(value);
    }
  }
  return '';
}

function normalizeHeader_(value) {
  return normalizeValue_(value)
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeStudentId_(value) {
  return normalizeValue_(value).replace(/\s+/g, '');
}

function normalizeValue_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function getErrorMessage_(error) {
  return error && error.message ? error.message : String(error);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
