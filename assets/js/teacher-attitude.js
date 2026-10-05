(function () {
  'use strict';

  const registrationForm = document.getElementById('registration-form');
  const menuPopup = document.getElementById('teacher-menu-popup');
  const menuButton = document.getElementById('teacher-attitude-menu');
  const popup = document.getElementById('teacher-attitude-popup');
  const form = document.getElementById('teacher-attitude-form');
  const rowsContainer = document.getElementById('teacher-attitude-rows');
  const rowTemplate = document.getElementById('teacher-attitude-row-template');
  const saveButton = document.getElementById('teacher-attitude-save');
  const closeButton = document.getElementById('teacher-attitude-close');
  const status = document.getElementById('teacher-attitude-status');
  const tokenKey = 'tacticalTeacherToken';
  const endpoint = registrationForm?.getAttribute('action');
  const rowStates = [];
  const reasons = [
    'ป่วย', 'ลา', 'ขาด', 'ธุรการ', 'เครื่องแต่งกาย', 'หลับ',
    'เล่นระหว่างเรียน', 'ทานขนมระหว่างเรียน'
  ];

  if (!endpoint || !menuPopup || !menuButton || !popup || !form || !rowsContainer
    || !rowTemplate || !saveButton || !status) return;

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

  function setRowLoaded(state, record) {
    const maximumScoreValue = String(record.columns[4]?.value || '').trim();
    const maximumScore = Number(maximumScoreValue);
    if (!maximumScoreValue || !Number.isFinite(maximumScore) || maximumScore < 0) {
      throw new Error('คะแนนเต็มในคอลัมน์ E ไม่ถูกต้อง');
    }
    state.record = record;
    state.nameCell.textContent = record.name || '—';
    state.deductionInput.max = String(maximumScore);
    state.deductionInput.value = String(record.deduction);
    state.deductionInput.disabled = false;
    state.reasonInput.value = record.reason;
    state.reasonInput.disabled = false;
    state.reasonInput.required = record.deduction > 0;
    updateScore(state);
  }

  function clearRow(state, message) {
    state.record = null;
    state.nameCell.textContent = message || '—';
    state.scoreCell.textContent = '—';
    state.deductionInput.value = '';
    state.deductionInput.removeAttribute('max');
    state.deductionInput.disabled = true;
    state.reasonInput.value = '';
    state.reasonInput.required = false;
    state.reasonInput.disabled = true;
  }

  function updateScore(state) {
    if (!state.record) return;
    const deduction = Number(state.deductionInput.value);
    state.reasonInput.required = state.deductionInput.value !== '' && deduction > 0;
    state.scoreCell.textContent = state.deductionInput.value !== ''
      && Number.isFinite(deduction)
      ? String(Number(state.deductionInput.max) - deduction)
      : '—';
  }

  async function loadRow(state, lookupId) {
    const requestId = ++state.requestId;
    state.lookupInput.setCustomValidity('');
    clearRow(state, 'กำลังค้นหา...');
    state.lookupInput.dataset.lookupState = 'loading';
    try {
      const result = await post({
        formName: 'teacher-attitude-lookup',
        token: localStorage.getItem(tokenKey) || '',
        lookupId
      });
      if (requestId !== state.requestId || state.lookupInput.value.trim() !== lookupId) return false;
      setRowLoaded(state, result.data);
      state.lookupInput.dataset.lookupState = 'loaded';
      state.lookupInput.setCustomValidity('');
      return true;
    } catch (error) {
      if (requestId !== state.requestId || state.lookupInput.value.trim() !== lookupId) return false;
      clearRow(state, 'ไม่มีข้อมูล');
      state.lookupInput.dataset.lookupState = 'error';
      state.lookupInput.setCustomValidity(error.message || 'ไม่พบข้อมูล');
      setStatus('เลขที่ ' + lookupId + ': ' + (error.message || 'ไม่พบข้อมูล'), 'error');
      return false;
    }
  }

  function createRow(index) {
    const fragment = rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('tr');
    const lookupInput = row.querySelector('[data-field="lookupId"]');
    const nameCell = row.querySelector('[data-field="name"]');
    const deductionInput = row.querySelector('[data-field="deduction"]');
    const scoreCell = row.querySelector('[data-field="score"]');
    const reasonInput = row.querySelector('[data-field="reason"]');
    lookupInput.setAttribute('aria-label', 'เลขที่กองพัน แถว ' + (index + 1));
    rowStates.push({
      row,
      lookupInput,
      nameCell,
      deductionInput,
      scoreCell,
      reasonInput,
      record: null,
      requestId: 0,
      lookupTimer: 0
    });
    rowsContainer.appendChild(fragment);
  }

  function resetRows() {
    rowStates.forEach((state) => {
      window.clearTimeout(state.lookupTimer);
      state.requestId += 1;
      state.lookupInput.value = '';
      state.lookupInput.disabled = false;
      state.lookupInput.dataset.lookupState = '';
      state.lookupInput.setCustomValidity('');
      state.deductionInput.disabled = true;
      state.reasonInput.disabled = true;
      clearRow(state, '—');
    });
  }

  function closePopup() {
    popup.classList.add('d-none');
    menuPopup.classList.remove('d-none');
    form.reset();
    resetRows();
    setStatus('', '');
    menuButton.focus();
  }

  for (let index = 0; index < 10; index += 1) createRow(index);

  menuButton.addEventListener('click', () => {
    menuPopup.classList.add('d-none');
    popup.classList.remove('d-none');
    form.reset();
    resetRows();
    setStatus('', '');
    rowStates[0].lookupInput.focus();
  });

  closeButton?.addEventListener('click', closePopup);
  popup.addEventListener('click', (event) => {
    if (event.target === popup) closePopup();
  });

  rowStates.forEach((state) => {
    state.lookupInput.addEventListener('input', () => {
      state.requestId += 1;
      state.lookupInput.setCustomValidity('');
      state.lookupInput.dataset.lookupState = '';
      clearRow(state, '—');
      window.clearTimeout(state.lookupTimer);
      const lookupId = state.lookupInput.value.trim();
      if (/^\d{4}$/.test(lookupId)) {
        state.lookupTimer = window.setTimeout(() => loadRow(state, lookupId), 250);
      }
    });
    state.deductionInput.addEventListener('input', () => updateScore(state));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const populatedRows = rowStates.filter((state) => state.lookupInput.value.trim());
    if (!populatedRows.length) {
      setStatus('กรุณากรอกเลขที่กองพันอย่างน้อย 1 หมายเลข', 'error');
      rowStates[0].lookupInput.focus();
      return;
    }

    const seenIds = new Set();
    const entries = [];
    for (const state of populatedRows) {
      const lookupId = state.lookupInput.value.trim();
      if (!/^\d{4}$/.test(lookupId)) {
        setStatus('กรุณากรอกเลขที่กองพันให้ครบ 4 หลัก', 'error');
        state.lookupInput.focus();
        return;
      }
      if (seenIds.has(lookupId)) {
        setStatus('เลขที่กองพัน ' + lookupId + ' ซ้ำกัน กรุณาตรวจสอบ', 'error');
        state.lookupInput.focus();
        return;
      }
      seenIds.add(lookupId);
      if (state.lookupInput.dataset.lookupState === 'loading') {
        setStatus('กรุณารอให้ระบบค้นหาข้อมูลครบก่อนบันทึก', 'error');
        state.lookupInput.focus();
        return;
      }
      if (!state.record || state.record.lookupId !== lookupId) {
        setStatus('กรุณาตรวจสอบข้อมูลของเลขที่ ' + lookupId, 'error');
        state.lookupInput.focus();
        return;
      }
      const deductionValue = state.deductionInput.value.trim();
      const deduction = Number(deductionValue);
      if (!deductionValue || !Number.isFinite(deduction) || deduction < 0
        || deduction > Number(state.deductionInput.max)) {
        setStatus('กรุณากรอกคะแนนตัดของเลขที่ ' + lookupId + ' ให้ถูกต้อง', 'error');
        state.deductionInput.focus();
        return;
      }
      if ((deduction > 0 && !reasons.includes(state.reasonInput.value))
        || (state.reasonInput.value && !reasons.includes(state.reasonInput.value))) {
        setStatus('กรุณาเลือกสาเหตุของเลขที่ ' + lookupId, 'error');
        state.reasonInput.focus();
        return;
      }
      entries.push({
        lookupId,
        deduction: deductionValue,
        reason: state.reasonInput.value
      });
    }

    saveButton.disabled = true;
    rowStates.forEach((state) => {
      state.lookupInput.disabled = true;
      state.deductionInput.disabled = true;
      state.reasonInput.disabled = true;
    });
    setStatus('กำลังบันทึก ' + entries.length + ' หมายเลข...', '');
    try {
      const result = await post({
        formName: 'teacher-attitude-save-many',
        token: localStorage.getItem(tokenKey) || '',
        entries: JSON.stringify(entries)
      });
      const refreshedRows = await Promise.all(populatedRows.map((state) => loadRow(
        state,
        state.record.lookupId
      )));
      const refreshedCount = refreshedRows.filter(Boolean).length;
      const refreshSucceeded = refreshedCount === result.data.length;
      if (refreshSucceeded) resetRows();
      setStatus(refreshSucceeded
        ? 'บันทึกคะแนนเรียบร้อยแล้ว ' + result.data.length + ' หมายเลข และรีเฟรชข้อมูลแล้ว'
        : 'บันทึกข้อมูลแล้ว แต่รีเฟรชข้อมูลได้ ' + refreshedCount + ' จาก '
          + result.data.length + ' หมายเลข กรุณาค้นหาใหม่',
      refreshSucceeded ? 'success' : 'error');
    } catch (error) {
      setStatus(error.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      saveButton.disabled = false;
      rowStates.forEach((state) => {
        state.lookupInput.disabled = false;
        if (state.record) {
          state.deductionInput.disabled = false;
          state.reasonInput.disabled = false;
        }
      });
    }
  });
})();
