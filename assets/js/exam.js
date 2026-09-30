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
  const studentInfoBox = document.getElementById('exam-student-info');
  const startActions = document.getElementById('exam-start-actions');
  const beginButton = document.getElementById('exam-begin');
  const retryButton = document.getElementById('exam-retry');
  const nextButton = document.getElementById('exam-next');
  const submitButton = document.getElementById('exam-submit');
  const timeoutPopup = document.getElementById('exam-timeout-popup');
  const timeoutSubmitButton = document.getElementById('exam-timeout-submit');
  const titleBox = document.getElementById('exam-title');
  const phaseBox = document.getElementById('exam-phase');
  const closeButton = document.getElementById('exam-close');
  const loadingOverlay = document.getElementById('quiz-loading-overlay');
  const quizMenu = document.getElementById('quiz-test-menu');
  let selectedTitle = '';
  let selectedPhase = '';
  let selectedQuizId = '';
  let activeQuizId = '';
  let attemptToken = '';
  let timerId;
  let secondsRemaining = 0;
  let pendingQuestions = [];
  let currentQuestionIndex = 0;
  let collectedAnswers = {};
  let examTimedOut = false;
  let retryPostTestAutomatically = false;

  function syncPhaseSelector(phase) {
    if (!phaseSelect) return;
    const resolved = phase || selectedPhase || 'pre-test';
    phaseSelect.value = resolved;
    selectedPhase = resolved;
    phaseBox.textContent = formatPhaseLabel(selectedPhase);
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

  function normalizeTitle(title) {
    return String(title || '').replace(/^เรื่อง\s*/i, '').replace(/\s+/g, '').toLowerCase();
  }

  async function refreshQuizMenu() {
    if (!quizMenu) return;
    try {
      const data = await request('?action=quiz-list');
      const quizzes = Array.isArray(data.quizzes) ? data.quizzes : [];
      quizMenu.querySelectorAll(':scope > .quiz-menu-generated').forEach((item) => item.remove());

      const latestQuizzes = new Map();
      quizzes.forEach((quiz) => {
        if (quiz.quizId && quiz.title && quiz.phase) {
          latestQuizzes.set(`${normalizeTitle(quiz.title)}:${quiz.phase}`, quiz);
        }
      });

      const quizGroups = new Map();
      latestQuizzes.forEach((quiz) => {
        const titleKey = normalizeTitle(quiz.title);
        if (!quizGroups.has(titleKey)) quizGroups.set(titleKey, { title: quiz.title, phases: new Map() });
        quizGroups.get(titleKey).phases.set(quiz.phase, quiz);
      });

      quizGroups.forEach((group) => {
        const preTest = group.phases.get('pre-test');
        if (preTest) {
          group.phases.set('post-test', { ...preTest, phase: 'post-test' });
        }

        const item = document.createElement('li');
        item.className = 'dropdown quiz-menu-generated';
        const titleLink = document.createElement('a');
        titleLink.href = '#';
        const titleText = document.createElement('span');
        titleText.textContent = group.title;
        const toggleIcon = document.createElement('i');
        toggleIcon.className = 'bi bi-chevron-down toggle-dropdown';
        titleLink.append(titleText, document.createTextNode(' '), toggleIcon);
        item.appendChild(titleLink);

        const phaseMenu = document.createElement('ul');
        ['pre-test', 'post-test', 'score', 'midterm', 'final'].forEach((phase) => {
          const quiz = group.phases.get(phase);
          if (!quiz) return;
          const phaseItem = document.createElement('li');
          const phaseLink = document.createElement('a');
          phaseLink.href = '#';
          phaseLink.dataset.quizTitle = group.title;
          phaseLink.dataset.quizPhase = phase;
          phaseLink.dataset.quizId = quiz.quizId;
          phaseLink.textContent = formatPhaseLabel(phase);
          phaseItem.appendChild(phaseLink);
          phaseMenu.appendChild(phaseItem);
        });
        item.appendChild(phaseMenu);
        quizMenu.appendChild(item);
      });
    } catch (error) {
      console.error('ไม่สามารถโหลดรายการแบบทดสอบได้', error);
    }
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
    retryPostTestAutomatically = false;
    timeoutPopup.classList.add('d-none');
    retryButton.classList.add('d-none');
    resultBox.textContent = '';
    resultBox.classList.remove('registration-result');
    if (studentInfoBox) {
      studentInfoBox.innerHTML = '';
      studentInfoBox.classList.add('d-none');
    }
    setError('');
    selectedQuizId = '';
    activeQuizId = '';
    if (phaseSelect) phaseSelect.disabled = false;
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
    const isYesNo = question.type === 'yes-no' || (Array.isArray(question.choices) && question.choices.length <= 2);
    const choices = Array.isArray(question.choices) && question.choices.length ? question.choices : ['ได้', 'ไม่ได้'];
    questionsBox.innerHTML = `
      <fieldset class="quiz-question">
        <legend>${currentQuestionIndex + 1}. ${escapeHtml(question.question)}</legend>
        ${choices.map((choice, choiceIndex) => `
          <label class="quiz-choice"><input type="radio" name="question-${question.id}" value="${choiceIndex + 1}" ${selectedAnswer === String(choiceIndex + 1) ? 'checked' : ''} required> ${escapeHtml(choice)}</label>
        `).join('')}
      </fieldset>`;
    if (isYesNo && choices.length === 2) {
      questionsBox.querySelectorAll('input[name^="question-"]').forEach((radio) => {
        const value = radio.value;
        if (value === '1') radio.nextSibling.textContent = ' ได้';
        if (value === '2') radio.nextSibling.textContent = ' ไม่ได้';
      });
    }
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

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-quiz-title][data-quiz-phase]');
    if (!link) return;
    event.preventDefault();
    if (document.body.classList.contains('mobile-nav-active')) {
      document.body.classList.remove('mobile-nav-active');
      const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
      if (mobileNavToggle) {
        mobileNavToggle.classList.add('bi-list');
        mobileNavToggle.classList.remove('bi-x');
      }
    }
    selectedTitle = link.dataset.quizTitle;
    selectedPhase = link.dataset.quizPhase;
    selectedQuizId = link.dataset.quizId || '';
    if (phaseSelect) phaseSelect.disabled = Boolean(selectedQuizId);
    titleBox.textContent = selectedTitle;
    syncPhaseSelector(selectedPhase);
    modal.classList.remove('d-none');
    document.body.classList.add('registration-modal-open');
    studentIdInput.focus();
  });
  quizMenu?.addEventListener('click', (event) => {
    const toggle = event.target.closest('.quiz-menu-generated .toggle-dropdown');
    if (!toggle) return;
    event.preventDefault();
    event.stopPropagation();
    const item = toggle.closest('li.dropdown');
    item?.classList.toggle('active');
    item?.querySelector(':scope > ul')?.classList.toggle('dropdown-active');
  });
  window.addEventListener('quiz-list-updated', refreshQuizMenu);
  refreshQuizMenu();

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
      activeQuizId = selectedQuizId || await findQuizId();
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
      answerForm.dataset.passType = data.passType || 'percent';
      answerForm.dataset.passValue = data.passValue ?? data.passScore ?? 70;
      answerForm.dataset.passScore = data.passScore || 70;
      startForm.classList.add('d-none');
      if (retryPostTestAutomatically) {
        retryPostTestAutomatically = false;
        beginExam();
      } else {
        startActions.classList.remove('d-none');
      }
    } catch (error) {
      if (retryPostTestAutomatically) {
        retryPostTestAutomatically = false;
        startForm.classList.remove('d-none');
      }
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
      const passType = data.passType || answerForm.dataset.passType || 'percent';
      const passValue = Number(data.passValue ?? data.passScore ?? answerForm.dataset.passValue ?? answerForm.dataset.passScore ?? 70);
      const score = Number(data.score || 0);
      const total = Number(data.total || 0);
      const percentage = total ? (score / total) * 100 : 0;
      const passed = typeof data.passed === 'boolean'
        ? data.passed
        : (passType === 'count' ? score >= passValue : percentage >= passValue);
      const thresholdText = passType === 'count' ? `${passValue} ข้อ` : `${passValue}%`;
      const canRetryPostTest = selectedPhase === 'post-test' && !passed;
      resultBox.innerHTML = `
        <strong>ผลคะแนน ${formatPhaseLabel(data.phase)}:</strong>
        ${score}/${total} คะแนน
        <span class="${passed ? 'success-message' : 'error-message'}">(${passed ? 'ผ่าน' : 'ไม่ผ่าน'} - เกณฑ์ ${thresholdText})</span>
        ${canRetryPostTest ? '<p>ท่านไม่ผ่านเกณฑ์ 80% สามารถเข้าสอบใหม่ได้</p>' : ''}
      `;
      resultBox.classList.add('registration-result');
      retryButton.classList.toggle('d-none', !canRetryPostTest);
      answerForm.classList.add('d-none');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  });

  retryButton.addEventListener('click', () => {
    retryPostTestAutomatically = true;
    retryButton.classList.add('d-none');
    resultBox.textContent = '';
    resultBox.classList.remove('registration-result');
    answerForm.reset();
    startActions.classList.add('d-none');
    startForm.classList.remove('d-none');
    startForm.requestSubmit();
  });

})();
