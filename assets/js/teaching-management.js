(function () {
  'use strict';

  const openLink = document.getElementById('open-teaching-management');
  const appShell = document.getElementById('teaching-management');
  const loginView = document.getElementById('teaching-login-view');
  const appView = document.getElementById('teaching-app-view');
  const loginForm = document.getElementById('teaching-login-form');
  const loginEmail = document.getElementById('teaching-login-email');
  const loginPassword = document.getElementById('teaching-login-password');
  const loginStatus = document.getElementById('teaching-login-status');
  const loginButton = document.getElementById('teaching-login-submit');
  const userName = document.getElementById('teaching-user-name');
  const connectionState = document.getElementById('teaching-connection-state');
  const endpoint = document.querySelector('#registration-form')?.getAttribute('action');
  const homeButton = document.getElementById('teaching-login-home');
  const returnButton = document.getElementById('teaching-app-home');
  const logoutButton = document.getElementById('teaching-logout');
  if (!openLink || !appShell || !loginView || !appView || !loginForm || !endpoint) return;

  let studentSession = null;

  function setValue(id, value, fallback) {
    const element = document.getElementById(id);
    if (element) element.textContent = value || fallback || '—';
  }

  function setLoginStatus(message, isSuccess) {
    loginStatus.textContent = message || '';
    loginStatus.classList.toggle('d-none', !message);
    loginStatus.classList.toggle('success', Boolean(message) && isSuccess);
    loginStatus.classList.toggle('error-message', Boolean(message) && !isSuccess);
  }

  function showLogin() {
    loginView.classList.remove('d-none');
    appView.classList.add('d-none');
    appShell.setAttribute('aria-labelledby', 'teaching-login-title');
    if (loginEmail) loginEmail.focus();
  }

  function showDashboard(student) {
    loginView.classList.add('d-none');
    appView.classList.remove('d-none');
    appShell.setAttribute('aria-labelledby', 'teaching-dashboard-title');
    const person = student || {};
    const scores = person.scores || {};
    if (userName) userName.textContent = person.fullName || 'ผู้เรียน';
    setValue('teaching-profile-id', person.personalId);
    setValue('teaching-profile-attendance', person.attendanceDate);
    setValue('teaching-profile-battalion', person.battalionNumber);
    setValue('teaching-profile-name', person.fullName);
    setValue('teaching-profile-email', person.email);
    setValue('teaching-profile-episode', person.episode);
    setValue('teaching-score-attitude', scores.attitude, 'ยังไม่ระบุแหล่งข้อมูล');
    setValue('teaching-score-pre', scores.preTest);
    setValue('teaching-score-post', scores.postTest);
    setValue('teaching-score-knowledge', scores.knowledgeAssessment);
    setValue('teaching-score-special', scores.specialTask);
    if (connectionState) {
      connectionState.innerHTML = '<i aria-hidden="true"></i> เชื่อมต่อแล้ว';
      connectionState.classList.add('is-connected');
    }
    document.querySelector('.teaching-sidebar-link')?.focus();
  }

  function closeApp() {
    appShell.classList.add('d-none');
    document.body.classList.remove('teaching-management-open');
    openLink.setAttribute('aria-expanded', 'false');
    openLink.focus();
  }

  openLink.addEventListener('click', (event) => {
    event.preventDefault();
    appShell.classList.remove('d-none');
    document.body.classList.add('teaching-management-open');
    openLink.setAttribute('aria-expanded', 'true');
    setLoginStatus('', false);
    if (studentSession) showDashboard(studentSession);
    else showLogin();
  });

  [homeButton, returnButton].forEach((button) => {
    if (button) button.addEventListener('click', closeApp);
  });
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      studentSession = null;
      loginForm.reset();
      if (connectionState) {
        connectionState.innerHTML = '<i aria-hidden="true"></i> รอเชื่อมข้อมูล';
        connectionState.classList.remove('is-connected');
      }
      ['teaching-profile-id', 'teaching-profile-attendance', 'teaching-profile-battalion',
        'teaching-profile-name', 'teaching-profile-email', 'teaching-profile-episode',
        'teaching-score-pre', 'teaching-score-post', 'teaching-score-knowledge', 'teaching-score-special']
        .forEach((id) => setValue(id, ''));
      setValue('teaching-score-attitude', '', 'ยังไม่ระบุแหล่งข้อมูล');
      setLoginStatus('', false);
      showLogin();
    });
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;

    loginButton.disabled = true;
    setLoginStatus('กำลังตรวจสอบบัญชี...', false);
    try {
      const payload = new URLSearchParams({
        formName: 'attendance-student-login',
        email: loginEmail.value.trim(),
        password: loginPassword.value
      });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: payload.toString()
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'เข้าสู่ระบบไม่สำเร็จ');

      studentSession = result.data.student;
      studentSession.scores = result.data.scores;
      loginForm.reset();
      setLoginStatus('', false);
      showDashboard(studentSession);
    } catch (error) {
      setLoginStatus(error.message || 'ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้', false);
      loginPassword.focus();
    } finally {
      loginButton.disabled = false;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !appShell.classList.contains('d-none')) closeApp();
  });
})();
