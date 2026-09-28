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
  const tokenKey = 'tacticalTeacherToken';

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
    applicationForm.reset();
    loginForm.reset();
    uploadForm.reset();
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

  function rowsFromCells(cells) {
    const start = cells[0] && /คำถาม|question/i.test(cells[0][0] || '') ? 1 : 0;
    return cells.slice(start).filter((row) => row[0]).map((row) => ({
      question: row[0] || '', choice1: row[1] || '', choice2: row[2] || '',
      choice3: row[3] || '', choice4: row[4] || '', answer: row[5] || '', explanation: row[6] || ''
    }));
  }

  async function readFile(file) {
    if (file.name.toLowerCase().endsWith('.csv')) return rowsFromCells(parseCsv(await file.text()));
    if (!window.XLSX) throw new Error('ไม่พบตัวอ่านไฟล์ Excel');
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return rowsFromCells(window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }));
  }

  async function readGoogleSheet(url) {
    const match = url.match(/\/spreadsheets\/d\/([\w-]+)/);
    if (!match) throw new Error('URL Google Sheet ไม่ถูกต้อง');
    const gid = (url.match(/[?&#]gid=(\d+)/) || [])[1] || '0';
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`);
    if (!response.ok) throw new Error('อ่าน Google Sheet ไม่สำเร็จ ต้องเปิดสิทธิ์ให้ดูได้');
    return rowsFromCells(parseCsv(await response.text()));
  }

  async function getQuestions(form) {
    const file = form.querySelector('#quiz-file').files[0];
    const url = form.elements.sheetUrl.value.trim();
    const csv = form.elements.csv.value.trim();
    if (file) return readFile(file);
    if (url) return readGoogleSheet(url);
    if (csv) return rowsFromCells(parseCsv(csv));
    throw new Error('กรุณาเลือกไฟล์ ใส่ URL Google Sheet หรือวาง CSV');
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
      setLoading(true);
      const questions = await getQuestions(uploadForm);
      if (!questions.length) throw new Error('ไม่พบข้อสอบในข้อมูลที่นำเข้า');
      const data = await request({ method: 'POST', body: new URLSearchParams({
        formName: 'create-quiz', token: localStorage.getItem(tokenKey) || '',
        title: uploadForm.elements.title.value.trim(), duration: uploadForm.elements.duration.value,
        openAt: uploadForm.elements.openAt.value, closeAt: uploadForm.elements.closeAt.value,
        questionCount: uploadForm.elements.questionCount.value,
        attemptsAllowed: uploadForm.elements.attemptsAllowed.value,
        phase: uploadForm.elements.phase.value,
        questions: JSON.stringify(questions)
      }) });
      uploadForm.reset();
      showQuizSuccessPopup('สร้างแบบทดสอบสำเร็จ');
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

  if (registrationPopupButton) {
    registrationPopupButton.addEventListener('click', () => {
      if (registrationPopupMessage.textContent !== 'สร้างแบบทดสอบสำเร็จ') return;
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
})();
