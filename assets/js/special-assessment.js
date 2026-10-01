(function () {
  'use strict';

  const registrationForm = document.getElementById('registration-form');
  const assessmentMenu = document.getElementById('special-assessment-menu');
  const teacherMenuPopup = document.getElementById('teacher-menu-popup');
  const teacherAssessmentButton = document.getElementById('teacher-assessment-menu');
  const builderPopup = document.getElementById('special-assessment-builder-popup');
  const builderForm = document.getElementById('special-assessment-builder-form');
  const builderStatus = document.getElementById('special-assessment-create-status');
  const entryPopup = document.getElementById('special-assessment-entry-popup');
  const entryTitle = document.getElementById('special-assessment-entry-title');
  const entrySummary = document.getElementById('special-assessment-entry-summary');
  const codeForm = document.getElementById('special-assessment-code-form');
  const codeInput = document.getElementById('special-assessment-access-code');
  const codeStatus = document.getElementById('special-assessment-code-status');
  const entryForm = document.getElementById('special-assessment-entry-form');
  const entryStatus = document.getElementById('special-assessment-entry-status');
  const scoreTable = document.getElementById('special-assessment-table');
  const scoreBody = scoreTable?.querySelector('tbody');
  const tokenKey = 'tacticalTeacherToken';
  const endpoint = registrationForm?.getAttribute('action');
  const assessments = new Map();
  let currentAssessment = null;
  let currentAccessCode = '';

  if (!endpoint || !assessmentMenu || !teacherMenuPopup || !builderPopup || !entryPopup || !scoreBody) return;

  function setStatus(element, message, isSuccess = false) {
    element.textContent = message || '';
    element.classList.toggle('d-none', !message);
    element.classList.toggle('success-message', Boolean(message) && isSuccess);
    element.classList.toggle('error-message', Boolean(message) && !isSuccess);
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

  async function loadAssessments() {
    try {
      const response = await fetch(`${endpoint}?action=special-assessment-list`);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'โหลดรายการแบบประเมินไม่สำเร็จ');
      assessmentMenu.querySelectorAll(':scope > .special-assessment-generated').forEach((item) => item.remove());
      assessments.clear();
      (result.assessments || []).forEach((assessment) => {
        assessments.set(assessment.assessmentId, assessment);
        const item = document.createElement('li');
        item.className = 'special-assessment-generated';
        const link = document.createElement('a');
        link.href = '#special-assessment-entry-popup';
        link.dataset.specialAssessmentId = assessment.assessmentId;
        link.textContent = assessment.title;
        item.appendChild(link);
        assessmentMenu.appendChild(item);
      });
    } catch (error) {
      console.error('ไม่สามารถโหลดรายการแบบประเมินได้', error);
    }
  }

  function showEntryForm() {
    codeForm.classList.add('d-none');
    entryForm.classList.remove('d-none');
    setStatus(codeStatus, '');
    scoreBody.querySelector('[data-lookup-id]')?.focus();
  }

  function openBuilder() {
    teacherMenuPopup.classList.add('d-none');
    builderPopup.classList.remove('d-none');
    setStatus(builderStatus, '');
    builderForm.elements.title.focus();
  }

  function closeBuilder() {
    builderPopup.classList.add('d-none');
    teacherMenuPopup.classList.remove('d-none');
    teacherAssessmentButton.focus();
  }

  function closeEntry() {
    entryPopup.classList.add('d-none');
    codeForm.reset();
    entryForm.reset();
    codeForm.classList.remove('d-none');
    entryForm.classList.add('d-none');
    scoreBody.replaceChildren();
    currentAssessment = null;
    currentAccessCode = '';
    setStatus(codeStatus, '');
    setStatus(entryStatus, '');
  }

  function updateRowTotal(row) {
    const total = Array.from(row.querySelectorAll('[data-score-index]'))
      .reduce((sum, input) => sum + (input.value === '' ? 0 : Number(input.value)), 0);
    const totalCell = row.querySelector('.special-assessment-total');
    totalCell.textContent = String(total);
    totalCell.classList.toggle('tactical-score-total-over', total > currentAssessment.maxTotal);
    return total;
  }

  function createHeader(label) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    return cell;
  }

  function createInput(type, label, attributes) {
    const input = document.createElement('input');
    input.type = type;
    input.setAttribute('aria-label', label);
    Object.entries(attributes).forEach(([key, value]) => { input[key] = value; });
    return input;
  }

  function buildTable() {
    const headerRow = document.createElement('tr');
    ['ลำดับ', 'เลขที่', 'ชื่อ', 'สังกัด'].forEach((label) => headerRow.appendChild(createHeader(label)));
    for (let index = 1; index <= currentAssessment.scoreCount; index += 1) {
      headerRow.appendChild(createHeader('คะแนน ' + index));
    }
    headerRow.appendChild(createHeader('รวม (' + currentAssessment.maxTotal + ')'));
    scoreTable.querySelector('thead').replaceChildren(headerRow);

    const rows = [];
    for (let rowIndex = 0; rowIndex < currentAssessment.recordCount; rowIndex += 1) {
      const row = document.createElement('tr');
      const numberCell = document.createElement('th');
      numberCell.scope = 'row';
      numberCell.textContent = String(rowIndex + 1);
      row.appendChild(numberCell);

      const lookupCell = document.createElement('td');
      lookupCell.appendChild(createInput('text', 'เลขที่ผู้เรียน ' + (rowIndex + 1), {
        inputMode: 'numeric', pattern: '[0-9]{4}', maxLength: 4, autocomplete: 'off'
      }));
      lookupCell.firstElementChild.dataset.lookupId = '';
      row.appendChild(lookupCell);

      ['special-assessment-student-name', 'special-assessment-student-affiliation'].forEach((className) => {
        const cell = document.createElement('td');
        cell.className = className;
        cell.textContent = '-';
        row.appendChild(cell);
      });

      for (let scoreIndex = 0; scoreIndex < currentAssessment.scoreCount; scoreIndex += 1) {
        const cell = document.createElement('td');
        const input = createInput('number', 'คะแนนช่อง ' + (scoreIndex + 1) + ' แถว ' + (rowIndex + 1), {
          min: '0', step: 'any', inputMode: 'decimal'
        });
        input.dataset.scoreIndex = String(scoreIndex);
        cell.appendChild(input);
        row.appendChild(cell);
      }

      const totalCell = document.createElement('td');
      totalCell.className = 'special-assessment-total';
      totalCell.textContent = '0';
      row.appendChild(totalCell);
      rows.push(row);
    }
    scoreBody.replaceChildren(...rows);
  }

  async function lookupStudent(row) {
    const input = row.querySelector('[data-lookup-id]');
    const lookupId = input.value.trim();
    const nameCell = row.querySelector('.special-assessment-student-name');
    const affiliationCell = row.querySelector('.special-assessment-student-affiliation');
    if (!lookupId) {
      nameCell.textContent = '-';
      affiliationCell.textContent = '-';
      return;
    }
    if (!/^\d{4}$/.test(lookupId)) {
      nameCell.textContent = '-';
      affiliationCell.textContent = '-';
      setStatus(entryStatus, 'กรุณากรอกเลขที่ให้ครบ 4 หลัก');
      return;
    }

    try {
      const response = await fetch(`${endpoint}?action=lookup&lookupId=${encodeURIComponent(lookupId)}`);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'ไม่พบข้อมูลผู้เรียน');
      if (input.value.trim() !== lookupId) return;
      nameCell.textContent = result.data.columns[1].value || '-';
      affiliationCell.textContent = result.data.columns[2].value || '-';
      setStatus(entryStatus, '');
    } catch (error) {
      nameCell.textContent = '-';
      affiliationCell.textContent = '-';
      setStatus(entryStatus, error.message || 'ค้นหาข้อมูลผู้เรียนไม่สำเร็จ');
    }
  }

  function openAssessment(assessment) {
    currentAssessment = assessment;
    currentAccessCode = '';
    entryTitle.textContent = assessment.title;
    entrySummary.textContent = `${assessment.recordCount} แถว | ${assessment.scoreCount} ช่องคะแนน | รวมสูงสุด ${assessment.maxTotal}`;
    buildTable();
    entryPopup.classList.remove('d-none');
    entryForm.classList.add('d-none');
    codeForm.classList.toggle('d-none', !assessment.requiresCode);
    setStatus(entryStatus, '');
    setStatus(codeStatus, '');
    if (assessment.requiresCode) codeInput.focus();
    else showEntryForm();
  }

  teacherAssessmentButton.addEventListener('click', openBuilder);
  document.getElementById('special-assessment-builder-close').addEventListener('click', closeBuilder);
  document.getElementById('special-assessment-code-close').addEventListener('click', closeEntry);
  document.getElementById('special-assessment-entry-close').addEventListener('click', closeEntry);
  assessmentMenu.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-special-assessment-id]');
    if (!link) return;
    event.preventDefault();
    const assessment = assessments.get(link.dataset.specialAssessmentId);
    if (assessment) openAssessment(assessment);
  });

  builderForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = builderForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(builderStatus, 'กำลังสร้างแบบประเมิน...', true);
    try {
      const data = await post({
        formName: 'create-special-assessment',
        token: localStorage.getItem(tokenKey) || '',
        title: builderForm.elements.title.value.trim(),
        recordCount: builderForm.elements.recordCount.value,
        scoreCount: builderForm.elements.scoreCount.value,
        maxTotal: builderForm.elements.maxTotal.value,
        requiresCode: builderForm.elements.requiresCode.value
      });
      const codeMessage = data.accessCode ? ' รหัสสำหรับบันทึก: ' + data.accessCode : '';
      setStatus(builderStatus, data.message + codeMessage, true);
      builderForm.reset();
      await loadAssessments();
    } catch (error) {
      setStatus(builderStatus, error.message || 'สร้างแบบประเมินไม่สำเร็จ');
    } finally {
      submitButton.disabled = false;
    }
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    currentAccessCode = codeInput.value.trim();
    if (!/^\d{6}$/.test(currentAccessCode)) {
      setStatus(codeStatus, 'กรุณากรอกรหัส 6 หลัก');
      return;
    }
    const submitButton = codeForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(codeStatus, 'กำลังตรวจสอบรหัส...', true);
    try {
      await post({
        formName: 'validate-special-assessment-code',
        assessmentId: currentAssessment.assessmentId,
        accessCode: currentAccessCode
      });
      showEntryForm();
    } catch (error) {
      currentAccessCode = '';
      setStatus(codeStatus, error.message || 'รหัสแบบประเมินไม่ถูกต้อง');
      codeInput.select();
    } finally {
      submitButton.disabled = false;
    }
  });

  scoreBody.addEventListener('focusout', (event) => {
    if (event.target.matches('[data-lookup-id]')) lookupStudent(event.target.closest('tr'));
  });
  scoreBody.addEventListener('input', (event) => {
    if (!event.target.matches('[data-score-index]')) return;
    updateRowTotal(event.target.closest('tr'));
  });

  document.getElementById('special-assessment-copy-first-row').addEventListener('click', () => {
    const rows = Array.from(scoreBody.querySelectorAll('tr'));
    const firstScores = Array.from(rows[0]?.querySelectorAll('[data-score-index]') || [])
      .map((input) => input.value);
    if (!firstScores.length || firstScores.every((score) => score === '')) {
      setStatus(entryStatus, 'กรอกคะแนนในแถวแรกก่อนคัดลอก');
      return;
    }
    rows.slice(1).forEach((row) => {
      row.querySelectorAll('[data-score-index]').forEach((input, index) => { input.value = firstScores[index]; });
      updateRowTotal(row);
    });
    setStatus(entryStatus, 'คัดลอกคะแนนจากแถวแรกแล้ว', true);
  });

  entryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const entries = [];
    const seenIds = new Set();
    for (const row of scoreBody.querySelectorAll('tr')) {
      const lookupId = row.querySelector('[data-lookup-id]').value.trim();
      const scoreInputs = Array.from(row.querySelectorAll('[data-score-index]'));
      const scores = scoreInputs.map((input) => input.value);
      const hasScores = scores.some((score) => score !== '');
      if (!lookupId && !hasScores) continue;
      if (!/^\d{4}$/.test(lookupId)) {
        setStatus(entryStatus, 'กรุณากรอกเลขที่ 4 หลักให้ครบในแถวที่มีคะแนน');
        row.querySelector('[data-lookup-id]').focus();
        return;
      }
      if (seenIds.has(lookupId)) {
        setStatus(entryStatus, 'เลขที่ ' + lookupId + ' ซ้ำกัน กรุณาตรวจสอบ');
        row.querySelector('[data-lookup-id]').focus();
        return;
      }
      seenIds.add(lookupId);
      if (updateRowTotal(row) > currentAssessment.maxTotal) {
        setStatus(entryStatus, 'คะแนนรวมของเลขที่ ' + lookupId + ' ต้องไม่เกิน ' + currentAssessment.maxTotal);
        return;
      }
      entries.push({ lookupId, scores });
    }
    if (!entries.length) {
      setStatus(entryStatus, 'กรุณากรอกข้อมูลอย่างน้อย 1 คน');
      return;
    }

    const submitButton = entryForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setStatus(entryStatus, 'กำลังบันทึกผล...', true);
    try {
      const result = await post({
        formName: 'submit-special-assessment',
        assessmentId: currentAssessment.assessmentId,
        accessCode: currentAccessCode,
        entries: JSON.stringify(entries)
      });
      buildTable();
      setStatus(entryStatus, result.message + ' (' + result.saved + ' รายการ)', true);
    } catch (error) {
      setStatus(entryStatus, error.message || 'บันทึกผลไม่สำเร็จ');
    } finally {
      submitButton.disabled = false;
    }
  });

  loadAssessments();
})();
