(function () {
  'use strict';

  const modal = document.getElementById('quiz-builder');
  if (!modal) return;

  const api = document.querySelector('#registration-form')?.getAttribute('action');
  const authPanel = document.getElementById('quiz-auth-panel');
  const uploadForm = document.getElementById('quiz-upload-form');
  const applicationForm = document.getElementById('teacher-application-form');
  const loginForm = document.getElementById('teacher-login-form');
  const openButton = document.getElementById('open-quiz-builder');
  const closeButton = document.getElementById('close-quiz-builder');
  const logoutButton = document.getElementById('teacher-logout');
  const registrationPopup = document.getElementById('registration-popup');
  const registrationPopupMessage = document.getElementById('registration-popup-message');
  const registrationPopupButton = registrationPopup?.querySelector('.registration-popup-button');
  const loadingOverlay = document.getElementById('quiz-loading-overlay');
  const previewBox = document.getElementById('quiz-preview-box');
  const downloadTemplateButton = document.getElementById('download-quiz-template');
  const currentTeacherEmail = document.getElementById('current-teacher-email');
  const tokenKey = 'tacticalTeacherToken';

  function setCurrentTeacherEmail(email) {
    if (currentTeacherEmail) currentTeacherEmail.textContent = email
      ? `ชื่อผู้ใช้งานขณะนี้: ${email}`
      : 'ชื่อผู้ใช้งานขณะนี้: -';
  }

  function syncPassingControls() {
    const countMode = uploadForm.elements.passType.value === 'count';
    const questionCount = Number(uploadForm.elements.questionCount.value) || 0;
    const passValue = uploadForm.elements.passValue;
    const passLabel = document.getElementById('quiz-pass-value-label');

    if (passLabel) passLabel.textContent = countMode ? 'จำนวนข้อที่ต้องผ่าน' : 'เกณฑ์ผ่าน (%)';
    passValue.min = countMode ? '1' : '0';
    passValue.max = countMode ? (questionCount > 0 ? String(questionCount) : '') : '100';
    passValue.step = '1';

    if (countMode) {
      passValue.value = questionCount > 0
        ? String(Math.min(Number(passValue.value) || questionCount, questionCount))
        : '';
    }

    uploadForm.elements.attemptsAllowed.disabled = countMode;
  }

  function showModal() {
    modal.classList.remove('d-none');
    document.body.classList.add('registration-modal-open');
  }

  function hideModal() {
    modal.classList.add('d-none');
    document.body.classList.remove('registration-modal-open');
  }

  function clearBuilderState() {
    localStorage.removeItem(tokenKey);
    setCurrentTeacherEmail('');
    applicationForm.reset();
    loginForm.reset();
    uploadForm.reset();
    syncPassingControls();
    if (previewBox) {
      previewBox.classList.add('d-none');
      previewBox.innerHTML = '';
    }
    setStatus(applicationForm, 'error-message', '');
    setStatus(applicationForm, 'sent-message', '');
    setStatus(loginForm, 'error-message', '');
    setStatus(uploadForm, 'error-message', '');
    setStatus(uploadForm, 'sent-message', '');
    applicationForm.classList.remove('d-none');
    loginForm.classList.remove('quiz-login-complete');
    uploadForm.classList.add('d-none');
    closeButton.classList.remove('d-none');
  }

  function showQuizSuccessPopup(message) {
    if (!registrationPopup || !registrationPopupMessage) return;
    registrationPopupMessage.textContent = message;
    registrationPopup.classList.remove('d-none');
    if (registrationPopupButton) registrationPopupButton.focus();
  }

  function setStatus(form, type, message) {
    form.querySelectorAll('.quiz-status').forEach((element) => {
      const visible = element.classList.contains(type) && Boolean(message);
      element.textContent = visible ? message : '';
      element.classList.toggle('d-none', !visible);
    });
  }

  function setLoading(isLoading) {
    if (loadingOverlay) loadingOverlay.classList.toggle('d-none', !isLoading);
    [applicationForm, loginForm, uploadForm].forEach((form) => {
      form.querySelectorAll('button, input, select, textarea').forEach((control) => {
        control.disabled = isLoading;
      });
    });
    syncPassingControls();
  }

  async function request(parameters) {
    let url = api;
    const options = { ...parameters };
    if (options.method.startsWith('GET?')) {
      url += options.method.slice(3);
      options.method = 'GET';
    }
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'ไม่สามารถเชื่อมต่อระบบได้');
    return data;
  }


  function parseCsv(text) {
    return text.trim().split(/\r?\n/).map((line) => {
      const cells = [];
      let cell = '';
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') quoted = !quoted;
        else if (character === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
        else cell += character;
      }
      cells.push(cell.trim());
      return cells;
    });
  }

  function sanitizeChoiceValue(value, fallback) {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function normalizeAnswerValue(rawValue, questionType) {
    const value = String(rawValue ?? '').trim();
    if (!value) return '';
    if (questionType === 'yes-no') {
      if (/^(1|ได้|yes|y)$/i.test(value)) return '1';
      if (/^(2|ไม่ได้|no|n)$/i.test(value)) return '2';
      return value;
    }
    if (/^[1-4]$/.test(value)) return value;
    return value;
  }

  function rowsFromCells(cells, questionType = 'multiple-choice') {
    const start = cells[0] && /คำถาม|question/i.test(cells[0][0] || '') ? 1 : 0;
    return cells.slice(start).filter((row) => row && row[0]).map((row) => {
      if (questionType === 'yes-no') {
        const question = sanitizeChoiceValue(row[0], '');
        const choice1 = sanitizeChoiceValue(row[1], 'ได้');
        const choice2 = sanitizeChoiceValue(row[2], 'ไม่ได้');
        const answer = normalizeAnswerValue(row[3] || row[5], 'yes-no');
        const explanation = sanitizeChoiceValue(row[4] || row[6], '');
        return {
          question,
          choice1,
          choice2,
          choice3: '',
          choice4: '',
          answer,
          explanation
        };
      }

      return {
        question: sanitizeChoiceValue(row[0], ''),
        choice1: sanitizeChoiceValue(row[1], ''),
        choice2: sanitizeChoiceValue(row[2], ''),
        choice3: sanitizeChoiceValue(row[3], ''),
        choice4: sanitizeChoiceValue(row[4], ''),
        answer: normalizeAnswerValue(row[5], 'multiple-choice'),
        explanation: sanitizeChoiceValue(row[6], '')
      };
    });
  }

  async function readFile(file, questionType = 'multiple-choice') {
    if (file.name.toLowerCase().endsWith('.csv')) return rowsFromCells(parseCsv(await file.text()), questionType);
    if (!window.XLSX) throw new Error('ไม่พบตัวอ่านไฟล์ Excel');
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return rowsFromCells(window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }), questionType);
  }

  async function readGoogleSheet(url, questionType = 'multiple-choice') {
    const match = url.match(/\/spreadsheets\/d\/([\w-]+)/);
    if (!match) throw new Error('URL Google Sheet ไม่ถูกต้อง');
    const gid = (url.match(/[?&#]gid=(\d+)/) || [])[1] || '0';
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`);
    if (!response.ok) throw new Error('อ่าน Google Sheet ไม่สำเร็จ ต้องเปิดสิทธิ์ให้ดูได้');
    return rowsFromCells(parseCsv(await response.text()), questionType);
  }

  function validateQuestions(questions, questionType) {
    if (!Array.isArray(questions) || !questions.length) {
      throw new Error('ไม่พบข้อสอบในข้อมูลที่นำเข้า');
    }

    const invalidRows = [];
    questions.forEach((question, index) => {
      const rowNumber = index + 1;
      if (!question.question || !question.question.trim()) {
        invalidRows.push(`ข้อที่ ${rowNumber}: ขาดคำถาม`);
      }
      if (questionType === 'yes-no') {
        if (!['1', '2'].includes(String(question.answer || '').trim())) {
          invalidRows.push(`ข้อที่ ${rowNumber}: เฉลยต้องเป็น 1=ได้ หรือ 2=ไม่ได้`);
        }
      } else if (!['1', '2', '3', '4'].includes(String(question.answer || '').trim())) {
        invalidRows.push(`ข้อที่ ${rowNumber}: เฉลยต้องเป็น 1-4`);
      }

      if (questionType === 'yes-no') {
        if (!question.choice1 || !question.choice2) {
          invalidRows.push(`ข้อที่ ${rowNumber}: ต้องมีตัวเลือก 2 รายการ คือ ได้ และ ไม่ได้`);
        }
      } else {
        ['choice1', 'choice2', 'choice3', 'choice4'].forEach((key) => {
          if (!question[key]) invalidRows.push(`ข้อที่ ${rowNumber}: ${key} ไม่มีข้อมูล`);
        });
      }
    });

    if (invalidRows.length) {
      throw new Error(`ข้อมูลไม่ถูกต้อง: ${invalidRows.slice(0, 3).join(' • ')}`);
    }

    return questions;
  }

  function renderPreview(questions, questionType) {
    if (!previewBox) return;
    const sample = questions.slice(0, 5);
    if (!sample.length) {
      previewBox.classList.add('d-none');
      previewBox.innerHTML = '';
      return;
    }

    const rows = sample.map((item, index) => `
      <li><strong>ข้อ ${index + 1}:</strong> ${item.question || '-'}
        ${questionType === 'yes-no'
          ? `(${item.choice1 || 'ได้'} / ${item.choice2 || 'ไม่ได้'})`
          : `(${item.choice1 || '-'} / ${item.choice2 || '-'} / ${item.choice3 || '-'} / ${item.choice4 || '-'})`}
      </li>
    `).join('');

    previewBox.innerHTML = `<h5>ตัวอย่างข้อมูลที่ตรวจพบ</h5><ul>${rows}</ul>`;
    previewBox.classList.remove('d-none');
  }

  function downloadTemplateCsv() {
    const questionType = uploadForm.elements.questionType.value;
    const rows = questionType === 'yes-no'
      ? [
          ['คำถาม', 'ได้', 'ไม่ได้', 'เฉลย', 'คำอธิบาย'],
          ['ทำได้ไหม', 'ได้', 'ไม่ได้', '1', 'ถ้าทำได้ให้เลือกได้']
        ]
      : [
          ['คำถาม', 'ตัวเลือก 1', 'ตัวเลือก 2', 'ตัวเลือก 3', 'ตัวเลือก 4', 'เฉลย', 'คำอธิบาย'],
          ['ทดสอบความรู้', 'คำตอบ A', 'คำตอบ B', 'คำตอบ C', 'คำตอบ D', '2', 'คำอธิบาย']
        ];
    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = questionType === 'yes-no' ? 'template_yes_no.csv' : 'template_multiple_choice.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function getQuestions(form) {
    const file = form.querySelector('#quiz-file').files[0];
    const url = form.elements.sheetUrl.value.trim();
    const csv = form.elements.csv.value.trim();
    const questionType = form.elements.questionType.value;
    let questions;
    if (file) questions = await readFile(file, questionType);
    else if (url) questions = await readGoogleSheet(url, questionType);
    else if (csv) questions = rowsFromCells(parseCsv(csv), questionType);
    else throw new Error('กรุณาเลือกไฟล์ ใส่ URL Google Sheet หรือวาง CSV');

    const normalized = questions.map((item) => ({
      ...item,
      question: String(item.question || '').trim(),
      answer: normalizeAnswerValue(item.answer, questionType)
    }));

    renderPreview(normalized, questionType);
    return validateQuestions(normalized, questionType);
  }

  openButton.addEventListener('click', (event) => {
    event.preventDefault();
    showModal();
  });
  closeButton.addEventListener('click', () => {
    clearBuilderState();
    hideModal();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) hideModal();
  });

  applicationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(applicationForm);
    if (formData.get('password') !== formData.get('passwordConfirm')) {
      setStatus(applicationForm, 'error-message', 'รหัสผ่านยืนยันไม่ตรงกัน');
      return;
    }
    try {
      setLoading(true);
      setStatus(applicationForm, 'error-message', '');
      const data = await request({ method: 'POST', body: new URLSearchParams({
        formName: 'teacher-application', teacherName: formData.get('teacherName'),
        email: formData.get('email'), password: formData.get('password')
      }) });
      setStatus(applicationForm, 'sent-message', data.message);
      applicationForm.reset();
      hideModal();
    } catch (error) {
      setStatus(applicationForm, 'error-message', error.message);
    } finally {
      setLoading(false);
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    try {
      setLoading(true);
      const data = await request({ method: 'POST', body: new URLSearchParams({
        formName: 'teacher-login', email: formData.get('email'), password: formData.get('password')
      }) });
      localStorage.setItem(tokenKey, data.token);
      setCurrentTeacherEmail(String(formData.get('email') || '').trim());
      applicationForm.classList.add('d-none');
      loginForm.classList.add('quiz-login-complete');
      closeButton.classList.add('d-none');
      uploadForm.classList.remove('d-none');
    } catch (error) {
      setStatus(loginForm, 'error-message', error.message);
    } finally {
      setLoading(false);
    }
  });

  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const passType = uploadForm.elements.passType.value;
      const passValue = Number(uploadForm.elements.passValue.value);
      const questionCount = Number(uploadForm.elements.questionCount.value || 0);

      if (!Number.isFinite(passValue) || passValue < 0) {
        throw new Error('ค่าเกณฑ์ผ่านต้องเป็นจำนวนที่ถูกต้อง');
      }
      if (passType === 'percent' && (passValue < 0 || passValue > 100)) {
        throw new Error('เกณฑ์ผ่านแบบเปอร์เซ็นต์ต้องอยู่ระหว่าง 0 ถึง 100');
      }
      if (passType === 'count' && (passValue < 1 || passValue > questionCount || passValue > 999)) {
        throw new Error('จำนวนข้อเกณฑ์ผ่านต้องไม่เกินจำนวนข้อที่สุ่ม');
      }

      setLoading(true);
      const questions = await getQuestions(uploadForm);
      const data = await request({ method: 'POST', body: new URLSearchParams({
        formName: 'create-quiz', token: localStorage.getItem(tokenKey) || '',
        title: uploadForm.elements.title.value.trim(), duration: uploadForm.elements.duration.value,
        openAt: uploadForm.elements.openAt.value, closeAt: uploadForm.elements.closeAt.value,
        questionCount: uploadForm.elements.questionCount.value,
        attemptsAllowed: uploadForm.elements.attemptsAllowed.value,
        phase: uploadForm.elements.phase.value,
        questionType: uploadForm.elements.questionType.value,
        passType,
        passValue: String(passValue),
        passScore: String(passValue),
        questions: JSON.stringify(questions)
      }) });
      uploadForm.reset();
      syncPassingControls();
      if (previewBox) {
        previewBox.classList.add('d-none');
        previewBox.innerHTML = '';
      }
      const displayText = passType === 'count' ? `จำนวน ${passValue} ข้อ` : `${passValue}%`;
      showQuizSuccessPopup(`สร้างแบบทดสอบสำเร็จ (เกณฑ์ผ่าน ${displayText})`);
    } catch (error) {
      setStatus(uploadForm, 'error-message', error.message);
    } finally {
      setLoading(false);
    }
  });

  logoutButton.addEventListener('click', () => {
    clearBuilderState();
    hideModal();
  });

  if (downloadTemplateButton) {
    downloadTemplateButton.addEventListener('click', downloadTemplateCsv);
  }

  uploadForm.elements.passType.addEventListener('change', syncPassingControls);
  uploadForm.elements.questionCount.addEventListener('input', syncPassingControls);
  uploadForm.elements.questionCount.addEventListener('change', syncPassingControls);
  syncPassingControls();

  uploadForm.elements.questionType.addEventListener('change', async () => {
    try {
      if (!uploadForm.elements.csv.value.trim() && !uploadForm.querySelector('#quiz-file').files.length) {
        return;
      }
      const questions = await getQuestions(uploadForm);
      renderPreview(questions, uploadForm.elements.questionType.value);
    } catch (error) {
      if (previewBox) {
        previewBox.classList.remove('d-none');
        previewBox.innerHTML = `<h5>ตรวจสอบข้อมูล</h5><ul><li>${error.message}</li></ul>`;
      }
    }
  });

  if (registrationPopupButton) {
    registrationPopupButton.addEventListener('click', () => {
      if (!registrationPopupMessage.textContent.includes('สร้างแบบทดสอบสำเร็จ')) return;
      registrationPopup.classList.add('d-none');
      clearBuilderState();
      hideModal();
    });
  }

  if (localStorage.getItem(tokenKey)) {
    applicationForm.classList.add('d-none');
    loginForm.classList.add('quiz-login-complete');
    closeButton.classList.add('d-none');
    uploadForm.classList.remove('d-none');
  }

  window.addEventListener('pagehide', clearBuilderState);
})();
