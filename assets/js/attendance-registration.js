(function () {
  'use strict';

  const form = document.getElementById('attendance-form');
  if (!form) return;

  const endpoint = form.getAttribute('action');
  const modal = document.getElementById('attendance-registration');
  const openButton = document.getElementById('open-registration-secondary');
  const closeButton = document.getElementById('close-attendance');
  const studentIdField = document.getElementById('attendance-student-id');
  const lookupButton = document.getElementById('attendance-lookup');
  const lookupActions = document.getElementById('attendance-lookup-actions');
  const details = document.getElementById('attendance-details');
  const resultBox = document.getElementById('attendance-result');
  const formNameField = document.getElementById('attendance-form-name');
  const popup = document.getElementById('registration-popup');
  const popupMessage = document.getElementById('registration-popup-message');

  function parseResponse(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('ระบบส่งข้อมูลกลับมาในรูปแบบที่ไม่ถูกต้อง');
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
  }

  function setMessage(type, message) {
    ['error-message', 'sent-message'].forEach((className) => {
      const element = form.querySelector(`.${className}`);
      if (!element) return;
      const visible = className === type && Boolean(message);
      element.textContent = visible ? message : '';
      element.classList.toggle('d-none', !visible);
      element.classList.toggle('d-block', visible);
    });
  }

  function resetForm() {
    form.reset();
    resultBox.innerHTML = '';
    lookupActions.classList.remove('d-none');
    details.classList.add('d-none');
    setMessage('error-message', '');
    setMessage('sent-message', '');
  }

  function closeModal() {
    resetForm();
    modal.classList.add('d-none');
    document.body.classList.remove('registration-modal-open');
  }

  function showPopup(message) {
    popupMessage.textContent = message;
    popup.classList.remove('d-none');
  }

  function validateStudentId() {
    const value = studentIdField.value.trim();
    if (!/^\d{13}$/.test(value)) {
      throw new Error('กรุณากรอกเลขประจำตัวให้ครบ 13 หลัก');
    }
    return value;
  }

  function renderColumns(columns) {
    return `<div class="registration-result">
      <strong>ข้อมูลจากชีต Registration</strong>
      <dl>${columns.map((column) => `
        <div><dt>${escapeHtml(column.label)}</dt><dd>${escapeHtml(column.value || '-')}</dd></div>
      `).join('')}</dl>
    </div>`;
  }

  openButton.addEventListener('click', (event) => {
    event.preventDefault();
    modal.classList.remove('d-none');
    document.body.classList.add('registration-modal-open');
    studentIdField.focus();
  });

  closeButton.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  lookupButton.addEventListener('click', async () => {
    try {
      const registrationId = validateStudentId();
      resultBox.innerHTML = '<div class="registration-result loading-result">กำลังค้นหาข้อมูล...</div>';
      const response = await fetch(`${endpoint}?action=attendance-lookup&registrationId=${encodeURIComponent(registrationId)}`);
      const data = parseResponse(await response.text());
      if (!response.ok || !data.ok) throw new Error(data.message || 'ไม่พบข้อมูล');
      resultBox.innerHTML = renderColumns(data.data.columns);
      lookupActions.classList.add('d-none');
      details.classList.remove('d-none');
      setMessage('error-message', '');
    } catch (error) {
      resultBox.innerHTML = `<div class="registration-result registration-result-error">${escapeHtml(error.message)}</div>`;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const loading = form.querySelector('.loading');
    try {
      const registrationId = validateStudentId();
      const attendanceFormName = formNameField.value;
      if (!attendanceFormName) throw new Error('กรุณาเลือกครั้งที่ 1-4');
      if (loading) loading.classList.remove('d-none');
      if (submitButton) submitButton.disabled = true;
      setMessage('error-message', '');
      const payload = new URLSearchParams({
        registrationId,
        attendanceFormName,
        formName: 'attendance-registration'
      });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: payload.toString()
      });
      const data = parseResponse(await response.text());
      if (data.code === 'DUPLICATE_ATTENDANCE') {
        showPopup('ท่านลงทะเบียนครั้งนี้แล้ว');
        resetForm();
        return;
      }
      if (!response.ok || !data.ok) throw new Error(data.message || 'บันทึกข้อมูลไม่สำเร็จ');
      setMessage('sent-message', 'บันทึกข้อมูลเรียบร้อยแล้ว');
      resetForm();
    } catch (error) {
      setMessage('error-message', error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      if (loading) loading.classList.add('d-none');
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
