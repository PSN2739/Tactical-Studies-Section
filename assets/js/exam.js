(function () {
  'use strict';

  const modal = document.getElementById('quiz-exam');
  if (!modal) return;

  const api = document.querySelector('#registration-form')?.getAttribute('action');
  const startForm = document.getElementById('exam-start-form');
  const answerForm = document.getElementById('exam-answer-form');
  const studentIdInput = document.getElementById('exam-student-id');
  const phaseSelect = document.getElementById('exam-phase-select');
  const questionsBox = document.getElementById('exam-questions');
  const timerBox = document.getElementById('exam-timer');
  const resultBox = document.getElementById('exam-result');
  const resultTableBox = document.getElementById('exam-result-table');
  const studentInfoBox = document.getElementById('exam-student-info');
  const startActions = document.getElementById('exam-start-actions');
  const beginButton = document.getElementById('exam-begin');
  const nextButton = document.getElementById('exam-next');
  const submitButton = document.getElementById('exam-submit');
  const timeoutPopup = document.getElementById('exam-timeout-popup');
  const timeoutSubmitButton = document.getElementById('exam-timeout-submit');
  const titleBox = document.getElementById('exam-title');
  const phaseBox = document.getElementById('exam-phase');
  const closeButton = document.getElementById('exam-close');
  const loadingOverlay = document.getElementById('quiz-loading-overlay');
  let selectedTitle = '';
  let selectedPhase = '';
  let activeQuizId = '';
  let attemptToken = '';
  let timerId;
  let secondsRemaining = 0;
  let pendingQuestions = [];
  let currentQuestionIndex = 0;
  let collectedAnswers = {};
  let examTimedOut = false;

  function syncPhaseSelector(phase) {
    if (!phaseSelect) return;
    const resolved = phase || selectedPhase || 'pre-test';
    phaseSelect.value = resolved;
    selectedPhase = resolved;
    phaseBox.textContent = formatPhaseLabel(selectedPhase);
  }

  function renderPhaseSummaryTable(summary) {
    if (!resultTableBox) return;
    const rows = [
      { key: 'pre-test', label: 'ก่อนเรียน' },
      { key: 'post-test', label: 'หลังเรียน' },
      { key: 'score', label: 'สอบเก็บคะแนน' },
      { key: 'midterm', label: 'สอบกลางภาค' },
      { key: 'final', label: 'สอบปลายภาค' }
    ];
    const values = summary && typeof summary === 'object' ? summary : {};
    const hasRealData = rows.some((row) => {
      const item = values[row.key] || {};
      return !!(item.score !== undefined && item.score !== '-' && item.score !== ''
        || item.total !== undefined && item.total !== '-' && item.total !== '');
    });

    if (!hasRealData) {
      resultTableBox.innerHTML = '';
      return;
    }

    const cells = rows
      .filter((row) => {
        const item = values[row.key] || {};
        return !!(item.score !== undefined && item.score !== '-' && item.score !== ''
          || item.total !== undefined && item.total !== '-' && item.total !== '');
      })
      .map((row) => {
        const item = values[row.key] || {};
        const score = item.score ?? '-';
        const total = item.total ?? '-';
        return `
          <tr>
            <td>${row.label}</td>
            <td>${score}</td>
            <td>${total}</td>
          </tr>`;
      }).join('');

    resultTableBox.innerHTML = `
      <table class="quiz-result-summary-table">
        <thead>
          <tr>
            <th>ช่วงสอบ</th>
            <th>คะแนน</th>
            <th>เต็ม</th>
          </tr>
        </thead>
        <tbody>${cells}</tbody>
      </table>`;
  }

  function setLoading(isLoading) {
    if (loadingOverlay) loadingOverlay.classList.toggle('d-none', !isLoading);
  }

  function setError(message) {
    startForm.querySelectorAll('.exam-status').forEach((element) => {
      element.textContent = message || '';
      element.classList.toggle('d-none', !message);
    });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
  }

  async function request(url, options) {
    const response = await fetch(`${api}${url}`, options);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'ไม่สามารถโหลดแบบทดสอบได้');
    return data;
  }

  function formatPhaseLabel(phase) {
    const labels = {
      'pre-test': 'ก่อนเรียน',
      'post-test': 'หลังเรียน',
      'score': 'สอบเก็บคะแนน',
      'midterm': 'สอบกลางภาค',
      'final': 'สอบปลายภาค'
    };
    return labels[String(phase || '')] || String(phase || '');
  }

  async function findQuizId() {
    const data = await request('?action=quiz-list');
    const normalizedTitle = selectedTitle.replace(/^เรื่อง\s*/i, '').replace(/\s+/g, '');
    const quizzes = data.quizzes.slice().reverse();
    const phaseMatches = (itemPhase) => !itemPhase || itemPhase === selectedPhase;
    const quiz = quizzes.find((item) => {
      const itemTitle = String(item.title || '').replace(/^เรื่อง\s*/i, '').replace(/\s+/g, '');
      return itemTitle === normalizedTitle && phaseMatches(item.phase);
    });
    const sharedQuiz = (selectedPhase === 'post-test' || selectedPhase === 'pre-test') && quizzes.find((item) => {
      const itemTitle = String(item.title || '').replace(/^เรื่อง\s*/i, '').replace(/\s+/g, '');
      return itemTitle === normalizedTitle;
    });
    if (!quiz && !sharedQuiz) throw new Error(`ไม่พบแบบทดสอบเรื่อง ${selectedTitle} (${formatPhaseLabel(selectedPhase)})`);
    return (quiz || sharedQuiz).quizId;
  }

  async function loadStudentInfo(studentId) {
    const data = await request(`?action=attendance-lookup&registrationId=${encodeURIComponent(studentId)}`);
    const columns = data.data && data.data.columns ? data.data.columns : [];
    const valueAt = (index) => columns[index] ? columns[index].value : '';
    return {
      registrationId: valueAt(0),
      lookupId: valueAt(2),
      rankName: valueAt(4),
      affiliation: valueAt(5),
      email: valueAt(7),
      formName: valueAt(8)
    };
  }

  function renderStudentInfo(columns) {
    if (!studentInfoBox || !columns) return;
    if (Array.isArray(columns)) {
      const values = (index) => columns[index] ? columns[index].value : '';
      columns = {
        registrationId: values(0),
        lookupId: values(2),
        rankName: values(4),
        affiliation: values(5),
        email: values(7),
        formName: values(8)
      };
    }

    const fields = [
      ['หมายเลขประชาชน', columns.registrationId],
      ['เลขที่กองกัน', columns.lookupId],
      ['ยศ-ชื่อ-สกุล', columns.rankName],
      ['สังกัด', columns.affiliation],
      ['อีเมล', columns.email],
      ['ตอนที่', columns.formName]
    ];

    studentInfoBox.innerHTML = `<strong>ข้อมูลผู้เข้าสอบ</strong><dl>${fields.map(([label, value]) =>
      `<div><dt>${label}</dt><dd>${escapeHtml(value || '-')}</dd></div>`).join('')}</dl>`;
    studentInfoBox.classList.remove('d-none');
  }

  const scoreLookupModal = document.getElementById('score-results');
  const scoreLookupOpen = document.getElementById('open-score-results');
  const scoreLookupForm = document.getElementById('score-search-form');
  const scoreLookupInput = document.getElementById('score-search-student-id');
  const scoreLookupStatus = document.getElementById('score-search-status');
  const scoreLookupData = document.getElementById('score-result-data');
  const scoreLookupTable = document.getElementById('score-result-table');
  const scoreLookupClose = document.getElementById('score-result-close');

  function closeScoreLookup() {
    if (!scoreLookupModal) return;
    scoreLookupModal.classList.add('d-none');
    document.body.classList.remove('registration-modal-open');
    if (scoreLookupForm) scoreLookupForm.reset();
    if (scoreLookupStatus) {
      scoreLookupStatus.textContent = '';
      scoreLookupStatus.classList.add('d-none');
    }
    if (scoreLookupData) scoreLookupData.classList.add('d-none');
    if (scoreLookupTable) scoreLookupTable.innerHTML = '';
  }

  function renderScoreLookupRow(data) {
    if (!scoreLookupTable || !data || !data.student) return;
    const student = data.student;
    const rows = [
      { label: 'เลขที่กองกัน', value: student.lookup_id || '-' },
      { label: 'ยศ-ชื่อ-สกุล', value: student.rank_name || '-' },
      { label: 'สังกัด', value: student.affiliation || '-' },
      { label: 'อีเมล', value: student.email || '-' },
      { label: 'ตอนที่', value: student.episode || '-' }
    ];

    const scoreRows = [
      { label: 'ก่อนเรียน', value: student.pre_score || '-' },
      { label: 'หลังเรียน', value: student.post_score || '-' },
      { label: 'คะแนนเก็บ', value: student.score || '-' }
    ];

    scoreLookupTable.innerHTML = `
      <div class="score-lookup-summary">
        ${rows.map((row) => `<div class="score-lookup-row"><span>${row.label}</span><strong>${escapeHtml(row.value)}</strong></div>`).join('')}
      </div>
      <table class="quiz-result-summary-table">
        <thead>
          <tr>
            <th>ช่วงสอบ</th>
            <th>คะแนน</th>
          </tr>
        </thead>
        <tbody>
          ${scoreRows.map((row) => `
            <tr>
              <td>${row.label}</td>
              <td>${escapeHtml(row.value)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    if (scoreLookupData) scoreLookupData.classList.remove('d-none');
  }

  if (scoreLookupOpen) {
    scoreLookupOpen.addEventListener('click', (event) => {
      event.preventDefault();
      if (scoreLookupModal) {
        scoreLookupModal.classList.remove('d-none');
        document.body.classList.add('registration-modal-open');
      }
      if (scoreLookupInput) scoreLookupInput.focus();
    });
  }

  if (scoreLookupClose) {
    scoreLookupClose.addEventListener('click', closeScoreLookup);
  }

  if (scoreLookupModal) {
    scoreLookupModal.addEventListener('click', (event) => {
      if (event.target === scoreLookupModal) closeScoreLookup();
    });
  }

  if (scoreLookupForm) {
    scoreLookupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const studentId = (scoreLookupInput ? scoreLookupInput.value.trim() : '');
      if (!studentId) {
        if (scoreLookupStatus) {
          scoreLookupStatus.textContent = 'กรุณากรอกเลขประจำตัวประชาชน';
          scoreLookupStatus.classList.remove('d-none');
        }
        return;
      }
      try {
        setLoading(true);
        if (scoreLookupStatus) {
          scoreLookupStatus.textContent = 'กำลังค้นหาผลสอบ...';
          scoreLookupStatus.classList.remove('d-none');
        }
        const data = await request(`?action=student-score-results&studentId=${encodeURIComponent(studentId)}`);
        if (!data || !data.ok || !data.data || !data.data.student) {
          throw new Error(data && data.message ? data.message : 'ไม่พบข้อมูลผลสอบ');
        }
        renderScoreLookupRow(data.data);
        if (scoreLookupStatus) {
          scoreLookupStatus.textContent = 'ค้นหาข้อมูลสำเร็จ';
          scoreLookupStatus.classList.remove('d-none');
          scoreLookupStatus.classList.add('success-message');
        }
      } catch (error) {
        if (scoreLookupStatus) {
          scoreLookupStatus.textContent = error.message || 'ไม่พบข้อมูล';
          scoreLookupStatus.classList.remove('d-none');
          scoreLookupStatus.classList.remove('success-message');
        }
        if (scoreLookupTable) scoreLookupTable.innerHTML = '';
        if (scoreLookupData) scoreLookupData.classList.add('d-none');
      } finally {
        setLoading(false);
      }
    });
  }

  function closeExam() {
    clearInterval(timerId);
    startForm.reset();
    answerForm.reset();
    answerForm.classList.add('d-none');
    startForm.classList.remove('d-none');
    startActions.classList.add('d-none');
    pendingQuestions = [];
    currentQuestionIndex = 0;
    collectedAnswers = {};
    examTimedOut = false;
    timeoutPopup.classList.add('d-none');
    resultBox.textContent = '';
    resultBox.classList.remove('registration-result');
    resultTableBox.innerHTML = '';
    if (studentInfoBox) {
      studentInfoBox.innerHTML = '';
      studentInfoBox.classList.add('d-none');
    }
    setError('');
    modal.classList.add('d-none');
    document.body.classList.remove('registration-modal-open');
  }

  function updateTimer() {
    const minutes = Math.floor(secondsRemaining / 60).toString().padStart(2, '0');
    const seconds = (secondsRemaining % 60).toString().padStart(2, '0');
    timerBox.textContent = `เวลาคงเหลือ ${minutes}:${seconds}`;
    if (secondsRemaining <= 0) {
      clearInterval(timerId);
      secondsRemaining = 0;
      examTimedOut = true;
      const selected = answerForm.querySelector('input[name^="question-"]:checked');
      if (selected) collectedAnswers[selected.name.replace('question-', '')] = selected.value;
      answerForm.querySelectorAll('input, #exam-next').forEach((element) => { element.disabled = true; });
      submitButton.disabled = false;
      submitButton.classList.remove('d-none');
      nextButton.classList.add('d-none');
      timeoutPopup.classList.remove('d-none');
    }
  }

  function renderQuestion() {
    const question = pendingQuestions[currentQuestionIndex];
    if (!question) return;
    const selectedAnswer = collectedAnswers[String(question.id)] || '';
    questionsBox.innerHTML = `
      <fieldset class="quiz-question">
        <legend>${currentQuestionIndex + 1}. ${escapeHtml(question.question)}</legend>
        ${question.choices.map((choice, choiceIndex) => `
          <label class="quiz-choice"><input type="radio" name="question-${question.id}" value="${choiceIndex + 1}" ${selectedAnswer === String(choiceIndex + 1) ? 'checked' : ''} required> ${escapeHtml(choice)}</label>
        `).join('')}
      </fieldset>`;
    const lastQuestion = currentQuestionIndex === pendingQuestions.length - 1;
    nextButton.classList.toggle('d-none', lastQuestion);
    submitButton.classList.toggle('d-none', !lastQuestion);
  }

  function beginExam() {
    currentQuestionIndex = 0;
    collectedAnswers = {};
    if (studentInfoBox) {
      studentInfoBox.innerHTML = '';
      studentInfoBox.classList.add('d-none');
    }
    renderQuestion();
    startActions.classList.add('d-none');
    answerForm.classList.remove('d-none');
    secondsRemaining = Math.max(60, Number(answerForm.dataset.duration || 30) * 60);
    updateTimer();
    timerId = setInterval(() => { secondsRemaining -= 1; updateTimer(); }, 1000);
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  document.querySelectorAll('[data-quiz-title][data-quiz-phase]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      selectedTitle = link.dataset.quizTitle;
      selectedPhase = link.dataset.quizPhase;
      titleBox.textContent = selectedTitle;
      syncPhaseSelector(selectedPhase);
      modal.classList.remove('d-none');
      document.body.classList.add('registration-modal-open');
      studentIdInput.focus();
    });
  });

  if (phaseSelect) {
    phaseSelect.addEventListener('change', () => {
      selectedPhase = phaseSelect.value;
      phaseBox.textContent = formatPhaseLabel(selectedPhase);
    });
  }

  closeButton.addEventListener('click', closeExam);
  beginButton.addEventListener('click', beginExam);
  timeoutSubmitButton.addEventListener('click', () => {
    timeoutPopup.classList.add('d-none');
    answerForm.requestSubmit();
  });
  nextButton.addEventListener('click', () => {
    const selected = answerForm.querySelector('input[name^="question-"]:checked');
    if (!selected) {
      answerForm.reportValidity();
      return;
    }
    collectedAnswers[selected.name.replace('question-', '')] = selected.value;
    currentQuestionIndex += 1;
    renderQuestion();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeExam();
  });

  startForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const studentId = studentIdInput.value.trim();
    if (!studentId) return;
    if (phaseSelect) {
      selectedPhase = phaseSelect.value;
      phaseBox.textContent = formatPhaseLabel(selectedPhase);
    }
    try {
      setLoading(true);
      setError('');
      const student = await loadStudentInfo(studentId);
      renderStudentInfo(student);
      resultTableBox.innerHTML = '';
      activeQuizId = await findQuizId();
      const data = await request(`?action=get-quiz&quizId=${encodeURIComponent(activeQuizId)}&phase=${encodeURIComponent(selectedPhase)}&studentId=${encodeURIComponent(studentId)}`);
      activeQuizId = data.quizId || activeQuizId;
      attemptToken = data.attemptToken;
      const remaining = Number(data.remainingAttempts ?? data.attemptsLeft ?? 0);
      if (remaining >= 0) {
        setError(`เหลือ ${remaining} ครั้ง`);
      }
      renderStudentInfo(data.student || student);
      pendingQuestions = data.questions;
      answerForm.dataset.duration = data.duration || 30;
      startForm.classList.add('d-none');
      startActions.classList.remove('d-none');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  });

  answerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInterval(timerId);
    timeoutPopup.classList.add('d-none');
    answerForm.querySelectorAll('[required]').forEach((element) => { element.required = false; });
    const answers = { ...collectedAnswers };
    new FormData(answerForm).forEach((value, key) => { answers[key.replace('question-', '')] = value; });
    try {
      setLoading(true);
      const data = await request('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({
          formName: 'submit-quiz', quizId: activeQuizId, phase: selectedPhase, studentId: studentIdInput.value.trim(),
          attemptToken, answers: JSON.stringify(answers)
        }).toString()
      });
      resultBox.textContent = `ผลคะแนน ${formatPhaseLabel(data.phase)}: ${data.score}/${data.total} คะแนน`;
      resultBox.classList.add('registration-result');
      resultTableBox.innerHTML = '';
      answerForm.classList.add('d-none');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  });

})();
