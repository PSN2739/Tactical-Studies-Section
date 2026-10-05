(function () {
  'use strict';

  const registrationForm = document.getElementById('registration-form');
  const menuPopup = document.getElementById('teacher-menu-popup');
  const menuButton = document.getElementById('teacher-attitude-menu');
  const popup = document.getElementById('teacher-attitude-popup');
  const lookupForm = document.getElementById('teacher-attitude-lookup-form');
  const lookupInput = document.getElementById('teacher-attitude-lookup-id');
  const searchButton = document.getElementById('teacher-attitude-search');
  const searchCloseButton = document.getElementById('teacher-attitude-search-close');
  const recordSection = document.getElementById('teacher-attitude-record');
  const columnsList = document.getElementById('teacher-attitude-columns');
  const saveForm = document.getElementById('teacher-attitude-save-form');
  const deductionInput = document.getElementById('teacher-attitude-deduction');
  const reasonInput = document.getElementById('teacher-attitude-reason');
  const saveButton = document.getElementById('teacher-attitude-save');
  const recordCloseButton = document.getElementById('teacher-attitude-record-close');
  const status = document.getElementById('teacher-attitude-status');
  const tokenKey = 'tacticalTeacherToken';
  const endpoint = registrationForm?.getAttribute('action');
  let currentRecord = null;
  let currentMaximumScore = 0;
  let scoreValueElement = null;

  if (!endpoint || !menuPopup || !menuButton || !popup || !lookupForm || !recordSection
    || !columnsList || !saveForm || !status) return;

  function setStatus(message, type) {
    status.textContent = message || '';
    status.classList.toggle('d-none', !message);
    status.classList.toggle('error-message', Boolean(message) && type === 'error');
    status.classList.toggle('success-message', Boolean(message) && type === 'success');
  }

  async function post(data) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(data).toString()
    });
    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new Error('ระบบส่งข้อมูลกลับมาในรูปแบบที่ไม่ถูกต้อง');
    }
    if (!response.ok || !result.ok) throw new Error(result.message || 'ดำเนินการไม่สำเร็จ');
    return result;
  }

  function clearRecord() {
    currentRecord = null;
    currentMaximumScore = 0;
    scoreValueElement = null;
    recordSection.classList.add('d-none');
    columnsList.replaceChildren();
    saveForm.reset();
    deductionInput.removeAttribute('max');
  }

  function closePopup() {
    popup.classList.add('d-none');
    menuPopup.classList.remove('d-none');
    clearRecord();
    lookupForm.reset();
    setStatus('', '');
    menuButton.focus();
  }

  function renderRecord(record) {
    columnsList.replaceChildren();
    record.columns.forEach((column) => {
      const item = document.createElement('div');
      const label = document.createElement('dt');
      const value = document.createElement('dd');
      label.textContent = column.label;
      value.textContent = column.value || '—';
      item.append(label, value);
      columnsList.appendChild(item);
    });
    const scoreItem = document.createElement('div');
    const scoreLabel = document.createElement('dt');
    const scoreValue = document.createElement('dd');
    scoreLabel.textContent = 'คะแนนคงเหลือ (คอลัมน์ G)';
    scoreValue.textContent = String(record.score);
    scoreItem.append(scoreLabel, scoreValue);
    columnsList.appendChild(scoreItem);

    const maximumScoreValue = String(record.columns[4]?.value || '').trim();
    const maximumScore = Number(maximumScoreValue);
    if (!maximumScoreValue || !Number.isFinite(maximumScore) || maximumScore < 0) {
      throw new Error('คะแนนเต็มในคอลัมน์ E ไม่ถูกต้อง');
    }
    currentMaximumScore = maximumScore;
    scoreValueElement = scoreValue;
    deductionInput.max = String(maximumScore);
    deductionInput.value = String(record.deduction);
    reasonInput.value = record.reason;
    reasonInput.required = Number(record.deduction) > 0;
    recordSection.classList.remove('d-none');
    currentRecord = record;
  }

  async function loadRecord(lookupId, showLoading) {
    clearRecord();
    if (showLoading) setStatus('กำลังค้นหาข้อมูล...', '');
    const result = await post({
      formName: 'teacher-attitude-lookup',
      token: localStorage.getItem(tokenKey) || '',
      lookupId
    });
    renderRecord(result.data);
    setStatus('', '');
  }

  menuButton.addEventListener('click', () => {
    menuPopup.classList.add('d-none');
    popup.classList.remove('d-none');
    lookupForm.reset();
    clearRecord();
    setStatus('', '');
    lookupInput.focus();
  });

  [searchCloseButton, recordCloseButton].forEach((button) => {
    button.addEventListener('click', closePopup);
  });

  popup.addEventListener('click', (event) => {
    if (event.target === popup) closePopup();
  });

  lookupInput.addEventListener('input', () => {
    clearRecord();
    setStatus('', '');
  });

  lookupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!lookupForm.reportValidity()) return;
    searchButton.disabled = true;
    lookupInput.disabled = true;
    try {
      await loadRecord(lookupInput.value.trim(), true);
    } catch (error) {
      clearRecord();
      setStatus(error.message || 'ไม่สามารถค้นหาข้อมูลได้', 'error');
    } finally {
      searchButton.disabled = false;
      lookupInput.disabled = false;
    }
  });

  deductionInput.addEventListener('input', () => {
    const deduction = Number(deductionInput.value);
    reasonInput.required = deduction > 0;
    if (scoreValueElement && deductionInput.value !== '' && Number.isFinite(deduction)) {
      scoreValueElement.textContent = String(currentMaximumScore - deduction);
    }
  });

  saveForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentRecord || !saveForm.reportValidity()) return;
    saveButton.disabled = true;
    lookupInput.disabled = true;
    setStatus('กำลังบันทึกข้อมูล...', '');
    try {
      const result = await post({
        formName: 'teacher-attitude-save',
        token: localStorage.getItem(tokenKey) || '',
        lookupId: currentRecord.lookupId,
        deduction: deductionInput.value,
        reason: reasonInput.value
      });
      await loadRecord(currentRecord.lookupId, false);
      setStatus(result.message + ' คะแนนคงเหลือ ' + result.data.score, 'success');
    } catch (error) {
      setStatus(error.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      saveButton.disabled = false;
      lookupInput.disabled = false;
    }
  });
})();
