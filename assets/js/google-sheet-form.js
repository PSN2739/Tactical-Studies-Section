(function () {
  'use strict';

  const form = document.getElementById('registration-form');
  if (!form) return;

  const endpoint = form.getAttribute('action');
  const lookupStudentIdField = document.getElementById('lookup-student-id');
  const registrationIdField = document.getElementById('registration-student-id');
  const registrationDetails = document.getElementById('registration-details');
  const resultBox = document.getElementById('student-result');
  const lookupButton = document.getElementById('lookup-student');
  const closeSearchButton = document.getElementById('close-registration-search');
  const closeDetailsButton = document.getElementById('close-registration-details');
  const registrationModal = document.getElementById('registration');
  const registrationOpenButton = document.getElementById('open-registration');
  const registrationOpenSecondaryButton = document.getElementById('open-registration-secondary');
  const registrationPopup = document.getElementById('registration-popup');
  const registrationPopupMessage = document.getElementById('registration-popup-message');
  const registrationPopupCloseButtons = registrationPopup
    ? registrationPopup.querySelectorAll('.registration-popup-close, .registration-popup-button')
    : [];

  function parseResponse(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('ระบบส่งข้อมูลกลับมาในรูปแบบที่ไม่ถูกต้อง');
    }
  }

  function setMessage(type, message) {
    ['error-message', 'sent-message'].forEach((className) => {
      const element = form.querySelector(`.${className}`);
      if (element) {
        element.textContent = className === type ? message : '';
        const visible = className === type && Boolean(message);
        element.classList.toggle('d-none', !visible);
        element.classList.toggle('d-block', visible);
      }
    });
  }

  function showRegistrationPopup(message) {
    if (!registrationPopup || !registrationPopupMessage) return;
    registrationPopupMessage.textContent = message;
    registrationPopup.classList.remove('d-none');
    const closeButton = registrationPopup.querySelector('.registration-popup-button');
    if (closeButton) closeButton.focus();
  }

  function resetRegistrationForm() {
    form.reset();
    resultBox.innerHTML = '';
    registrationDetails.classList.add('d-none');
    form.elements.email.required = false;
    registrationIdField.required = false;
    form.elements.episode.required = false;
    setMessage('error-message', '');
    setMessage('sent-message', '');
  }

  registrationPopupCloseButtons.forEach((button) => {
    button.addEventListener('click', () => {
      registrationPopup.classList.add('d-none');
      if (button.classList.contains('registration-popup-button')) {
        resetRegistrationForm();
        lookupStudentIdField.focus();
      }
    });
  });

  function closeRegistrationModal() {
    if (registrationModal) {
      registrationModal.classList.add('d-none');
      document.body.classList.remove('registration-modal-open');
    }

  }

  if (closeSearchButton) {
    closeSearchButton.addEventListener('click', () => {
      resetRegistrationForm();
      closeRegistrationModal();
    });
  }

  if (closeDetailsButton) {
    closeDetailsButton.addEventListener('click', () => {
      resetRegistrationForm();
      closeRegistrationModal();
    });
  }

  if (registrationOpenButton) {
    registrationOpenButton.addEventListener('click', (event) => {
      event.preventDefault();
      registrationModal.classList.remove('d-none');
      document.body.classList.add('registration-modal-open');
      lookupStudentIdField.focus();
    });
  }

  if (registrationOpenSecondaryButton) {
    registrationOpenSecondaryButton.addEventListener('click', (event) => {
      event.preventDefault();
      if (registrationOpenButton) registrationOpenButton.click();
    });
  }

  if (registrationModal) {
    registrationModal.addEventListener('click', (event) => {
      if (event.target === registrationModal) closeRegistrationModal();
    });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[character]));
  }

  function validateLookupId() {
    const lookupId = lookupStudentIdField.value.trim();
    if (!/^\d{4}$/.test(lookupId)) {
      throw new Error('กรุณากรอกเลขค้นหาให้ครบ 4 หลัก');
    }
    return lookupId;
  }

  function validateRegistrationId() {
    const registrationId = registrationIdField.value.trim();
    if (!/^\d{13}$/.test(registrationId)) {
      throw new Error('กรุณากรอกหมายเลขประจำตัวให้ครบ 13 หลัก');
    }
    return registrationId;
  }

  function validateEpisode() {
    const episode = form.elements.episode.value;
    if (!episode) {
      throw new Error('กรุณาเลือกตอนที่');
    }
    return episode;
  }

  async function lookupStudent() {
    const lookupId = validateLookupId();
    resultBox.innerHTML = '<div class="registration-result loading-result">กำลังค้นหาข้อมูล...</div>';
    const response = await fetch(`${endpoint}?action=lookup&lookupId=${encodeURIComponent(lookupId)}`);
    const data = parseResponse(await response.text());
    if (!response.ok || !data.ok) throw new Error(data.message || 'ไม่พบข้อมูลในชีต Data');

    const columns = data.data.columns;
    resultBox.innerHTML = `
      <div class="registration-result">
        <strong>ข้อมูลจากชีต Data</strong>
        <dl>
          <div><dt>${escapeHtml(columns[0].label)}</dt><dd>${escapeHtml(columns[0].value || '-')}</dd></div>
          <div><dt>${escapeHtml(columns[1].label)}</dt><dd>${escapeHtml(columns[1].value || '-')}</dd></div>
          <div><dt>${escapeHtml(columns[2].label)}</dt><dd>${escapeHtml(columns[2].value || '-')}</dd></div>
          <div><dt>${escapeHtml(columns[3].label)}</dt><dd>${escapeHtml(columns[3].value || '-')}</dd></div>
        </dl>
      </div>`;
    registrationDetails.classList.remove('d-none');
    form.elements.email.required = true;
    registrationIdField.required = true;
    form.elements.episode.required = true;
    setMessage('error-message', '');
  }

  lookupButton.addEventListener('click', async () => {
    try {
      await lookupStudent();
    } catch (error) {
      resultBox.innerHTML = `<div class="registration-result registration-result-error">${error.message}</div>`;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    const loading = form.querySelector('.loading');
    try {
      const registrationId = validateRegistrationId();
      validateLookupId();
      const episode = validateEpisode();
      if (loading) loading.classList.remove('d-none');
      if (submitButton) submitButton.disabled = true;
      setMessage('error-message', '');
      setMessage('sent-message', '');

      const payload = new URLSearchParams({
        lookupId: lookupStudentIdField.value.trim(),
        registrationId,
        email: form.elements.email.value.trim(),
        episode,
        formName: form.dataset.formName || 'class-registration'
      });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: payload.toString()
      });
      const data = parseResponse(await response.text());
      if (data.code === 'DUPLICATE_REGISTRATION'
        || /ลงทะเบียนไว้แล้ว/.test(data.message || '')) {
        showRegistrationPopup('ท่านลงทะเบียนแล้ว');
        return;
      }
      if (!response.ok || !data.ok) throw new Error(data.message || 'บันทึกข้อมูลไม่สำเร็จ');

      form.reset();
      resultBox.innerHTML = '';
      setMessage('sent-message', 'บันทึกข้อมูลเรียบร้อยแล้ว');
    } catch (error) {
      setMessage('error-message', error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      if (loading) loading.classList.add('d-none');
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
