(function () {
  'use strict';

  const modal = document.getElementById('tactical-score-entry');
  const openLink = document.getElementById('open-tactical-score-entry');
  const registrationForm = document.getElementById('registration-form');
  if (!modal || !openLink || !registrationForm) return;

  const endpoint = registrationForm.getAttribute('action');
  const codeForm = document.getElementById('tactical-score-code-form');
  const codeInput = document.getElementById('tactical-score-access-code');
  const codeStatus = document.getElementById('tactical-score-code-status');
  const scoreForm = document.getElementById('tactical-score-form');
  const scoreTable = document.getElementById('tactical-score-table');
  const scoreBody = scoreTable.querySelector('tbody');
  const scoreStatus = document.getElementById('tactical-score-status');
  const codeCloseButton = document.getElementById('tactical-score-close');
  const entryCloseButton = document.getElementById('tactical-score-entry-close');
  let accessCode = '';

  function setStatus(element, message, isSuccess) {
    element.textContent = message || '';
    element.classList.toggle('d-none', !message);
    element.classList.toggle('success-message', Boolean(message) && isSuccess);
    element.classList.toggle('error-message', !isSuccess);
  }

  async function post(data) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams(data).toString()
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'ดำเนินการไม่สำเร็จ');
    return result;
  }

  function buildTable() {
    const headerRow = document.createElement('tr');
    ['ลำดับ', 'เลขที่', 'ชื่อ', 'สังกัด'].forEach((label) => {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      headerRow.appendChild(cell);
    });
    for (let index = 1; index <= 25; index += 1) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = 'คะแนน ' + index;
      headerRow.appendChild(cell);
    }
    const totalHeader = document.createElement('th');
    totalHeader.scope = 'col';
    totalHeader.textContent = 'รวม (200)';
    headerRow.appendChild(totalHeader);
    scoreTable.querySelector('thead').replaceChildren(headerRow);

    const rows = [];
    for (let rowIndex = 0; rowIndex < 12; rowIndex += 1) {
      const row = document.createElement('tr');
      const rowNumber = document.createElement('th');
      rowNumber.scope = 'row';
      rowNumber.textContent = String(rowIndex + 1);
      row.appendChild(rowNumber);

      const lookupCell = document.createElement('td');
      const lookupInput = document.createElement('input');
      lookupInput.type = 'text';
      lookupInput.inputMode = 'numeric';
      lookupInput.pattern = '[0-9]{4}';
      lookupInput.maxLength = 4;
      lookupInput.autocomplete = 'off';
      lookupInput.setAttribute('aria-label', 'เลขที่ผู้เรียน ' + (rowIndex + 1));
      lookupInput.dataset.lookupId = '';
      lookupCell.appendChild(lookupInput);
      row.appendChild(lookupCell);

      ['student-name', 'student-affiliation'].forEach((className) => {
        const cell = document.createElement('td');
        cell.className = className;
        cell.textContent = '-';
        row.appendChild(cell);
      });

      for (let scoreIndex = 0; scoreIndex < 25; scoreIndex += 1) {
        const cell = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        input.inputMode = 'decimal';
        input.dataset.scoreIndex = String(scoreIndex);
        input.setAttribute('aria-label', 'คะแนนช่อง ' + (scoreIndex + 1) + ' แถว ' + (rowIndex + 1));
        cell.appendChild(input);
        row.appendChild(cell);
      }

      const totalCell = document.createElement('td');
      totalCell.className = 'tactical-score-total';
      totalCell.textContent = '0';
      row.appendChild(totalCell);
      rows.push(row);
    }
    scoreBody.replaceChildren(...rows);
  }

  function updateRowTotal(row) {
    const total = Array.from(row.querySelectorAll('[data-score-index]'))
      .reduce((sum, input) => sum + (input.value === '' ? 0 : Number(input.value)), 0);
    const totalCell = row.querySelector('.tactical-score-total');
    totalCell.textContent = String(total);
    totalCell.classList.toggle('tactical-score-total-over', total > 200);
    return total;
  }

  async function lookupStudent(row) {
    const input = row.querySelector('[data-lookup-id]');
    const lookupId = input.value.trim();
    const nameCell = row.querySelector('.student-name');
    const affiliationCell = row.querySelector('.student-affiliation');
    if (!lookupId) {
      nameCell.textContent = '-';
      affiliationCell.textContent = '-';
      return;
    }
    if (!/^\d{4}$/.test(lookupId)) {
      nameCell.textContent = '-';
      affiliationCell.textContent = '-';
      setStatus(scoreStatus, 'กรุณากรอกเลขที่ให้ครบ 4 หลัก', false);
      return;
    }

    try {
      const response = await fetch(`${endpoint}?action=lookup&lookupId=${encodeURIComponent(lookupId)}`);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'ไม่พบข้อมูลผู้เรียน');
      if (input.value.trim() !== lookupId) return;
      const columns = result.data.columns;
      nameCell.textContent = columns[1].value || '-';
      affiliationCell.textContent = columns[2].value || '-';
      setStatus(scoreStatus, '', false);
    } catch (error) {
      nameCell.textContent = '-';
      affiliationCell.textContent = '-';
      setStatus(scoreStatus, error.message || 'ค้นหาข้อมูลผู้เรียนไม่สำเร็จ', false);
    }
  }

  function closeModal() {
    modal.classList.add('d-none');
    document.body.classList.remove('registration-modal-open');
    codeForm.reset();
    scoreForm.reset();
    scoreForm.classList.add('d-none');
    codeForm.classList.remove('d-none');
    scoreBody.replaceChildren();
    accessCode = '';
    setStatus(codeStatus, '', false);
    setStatus(scoreStatus, '', false);
  }

  openLink.addEventListener('click', (event) => {
    event.preventDefault();
    modal.classList.remove('d-none');
    document.body.classList.add('registration-modal-open');
    codeForm.classList.remove('d-none');
    scoreForm.classList.add('d-none');
    codeInput.focus();
  });

  [codeCloseButton, entryCloseButton].forEach((button) => button.addEventListener('click', closeModal));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    accessCode = codeInput.value.trim();
    if (!/^\d{6}$/.test(accessCode)) {
      setStatus(codeStatus, 'กรุณากรอกรหัสตัวเลข 6 หลัก', false);
      return;
    }
    const submitButton = codeForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(codeStatus, 'กำลังตรวจสอบรหัส...', false);
    try {
      await post({ formName: 'validate-score-code', accessCode });
      buildTable();
      codeForm.classList.add('d-none');
      scoreForm.classList.remove('d-none');
      setStatus(scoreStatus, 'ยืนยันรหัสแล้ว กรอกคะแนนได้สูงสุด 12 คน', true);
      scoreBody.querySelector('[data-lookup-id]').focus();
    } catch (error) {
      accessCode = '';
      setStatus(codeStatus, error.message || 'รหัสการใช้งานไม่ถูกต้อง', false);
      codeInput.select();
    } finally {
      submitButton.disabled = false;
    }
  });

  scoreBody.addEventListener('focusout', (event) => {
    if (event.target.matches('[data-lookup-id]')) lookupStudent(event.target.closest('tr'));
  });
  scoreBody.addEventListener('input', (event) => {
    if (event.target.matches('[data-score-index]')) updateRowTotal(event.target.closest('tr'));
  });

  function confirmAndCopyFirstRowScores() {
    const rows = Array.from(scoreBody.querySelectorAll('tr'));
    const firstRow = rows[0];
    if (!firstRow) return true;

    const firstLookupId = firstRow.querySelector('[data-lookup-id]').value.trim();
    const firstInputs = Array.from(firstRow.querySelectorAll('[data-score-index]'));
    if (!/^\d{4}$/.test(firstLookupId) || !firstInputs.slice(0, 24).every((input) => input.value !== '')) {
      return true;
    }

    const firstScores = firstInputs.map((input) => input.value);
    const remainingRows = rows.slice(1);
    const alreadyCopied = remainingRows.every((row) =>
      Array.from(row.querySelectorAll('[data-score-index]')).every((input, index) => input.value === firstScores[index])
    );
    if (alreadyCopied) return true;

    const shouldCopy = window.confirm('คะแนนแถวแรกกรอกถึงช่อง 24 แล้ว ต้องการคัดลอกคะแนนไปยังอีก 11 แถวหรือไม่? ช่องคะแนน 25 เว้นว่างได้');
    if (!shouldCopy) {
      closeModal();
      return false;
    }

    remainingRows.forEach((row) => {
      const scoreInputs = Array.from(row.querySelectorAll('[data-score-index]'));
      scoreInputs.forEach((input, index) => { input.value = firstScores[index]; });
      updateRowTotal(row);
    });
    return true;
  }

  scoreForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!confirmAndCopyFirstRowScores()) return;

    const entries = [];
    const seenIds = new Set();
    for (const row of scoreBody.querySelectorAll('tr')) {
      const lookupId = row.querySelector('[data-lookup-id]').value.trim();
      const scoreInputs = Array.from(row.querySelectorAll('[data-score-index]'));
      const hasScores = scoreInputs.some((input) => input.value !== '');
      if (!lookupId && !hasScores) continue;
      if (!/^\d{4}$/.test(lookupId)) {
        setStatus(scoreStatus, 'กรุณากรอกเลขที่ 4 หลักให้ครบในแถวที่มีคะแนน', false);
        row.querySelector('[data-lookup-id]').focus();
        return;
      }
      if (seenIds.has(lookupId)) {
        setStatus(scoreStatus, 'เลขที่ ' + lookupId + ' ซ้ำกัน กรุณาตรวจสอบ', false);
        row.querySelector('[data-lookup-id]').focus();
        return;
      }
      seenIds.add(lookupId);
      if (updateRowTotal(row) > 200) {
        setStatus(scoreStatus, 'คะแนนรวมของเลขที่ ' + lookupId + ' ต้องไม่เกิน 200 คะแนน', false);
        return;
      }
      entries.push({ lookupId, scores: scoreInputs.map((input) => input.value) });
    }
    if (entries.length === 0) {
      setStatus(scoreStatus, 'กรุณากรอกข้อมูลอย่างน้อย 1 คน', false);
      return;
    }

    const submitButton = scoreForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(scoreStatus, 'กำลังบันทึกคะแนน...', false);
    try {
      const result = await post({
        formName: 'submit-tactical-scores',
        accessCode,
        entries: JSON.stringify(entries)
      });
      closeModal();
    } catch (error) {
      const message = error.message || 'บันทึกคะแนนไม่สำเร็จ';
      if (message.includes('รหัสการใช้งาน')) {
        scoreForm.classList.add('d-none');
        codeForm.classList.remove('d-none');
        accessCode = '';
        setStatus(codeStatus, message, false);
        codeInput.focus();
      } else {
        setStatus(scoreStatus, message, false);
      }
    } finally {
      submitButton.disabled = false;
    }
  });
})();
