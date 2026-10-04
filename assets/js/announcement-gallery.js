(function () {
  'use strict';

  const endpoint = document.querySelector('#registration-form')?.getAttribute('action');
  const teacherTokenKey = 'tacticalTeacherToken';
  const dashboardOpenButton = document.getElementById('open-announcement-dashboard');
  const dashboardPopup = document.getElementById('announcement-dashboard-popup');
  const dashboardCloseButton = document.getElementById('announcement-dashboard-close');
  const dashboardAddButton = document.getElementById('announcement-dashboard-add');
  const announcementList = document.getElementById('announcement-list');
  const dashboardEmpty = document.getElementById('announcement-dashboard-empty');
  const dashboardStatus = document.getElementById('announcement-dashboard-status');
  const editorPopup = document.getElementById('announcement-editor-popup');
  const editorCloseButton = document.getElementById('announcement-editor-close');
  const announcementLoginForm = document.getElementById('announcement-login-form');
  const announcementForm = document.getElementById('announcement-form');
  const announcementLoginStatus = document.getElementById('announcement-login-status');
  const announcementFormStatus = document.getElementById('announcement-form-status');

  async function postAnnouncementApi(parameters, method) {
    if (!endpoint) throw new Error('ไม่พบที่อยู่ระบบประกาศ');
    const url = new URL(endpoint);
    const options = { method: 'GET', cache: 'no-store' };
    if (method === 'POST') {
      options.method = 'POST';
      options.body = new URLSearchParams(parameters);
    } else {
      Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
    }
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'เชื่อมต่อระบบประกาศไม่สำเร็จ');
    return data;
  }

  function setAnnouncementStatus(element, message, isError) {
    element.textContent = message;
    element.classList.toggle('d-none', !message);
    element.classList.toggle('error-message', Boolean(isError));
  }

  function formatAnnouncementDate(value) {
    return new Date(value).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok'
    });
  }

  function renderAnnouncements(announcements) {
    announcementList.replaceChildren();
    dashboardEmpty.classList.toggle('d-none', announcements.length > 0);
    announcements.forEach((announcement, index) => {
      const item = document.createElement('article');
      item.className = 'announcement-list-item';

      const number = document.createElement('span');
      number.className = 'announcement-list-number';
      number.textContent = String(index + 1);

      const details = document.createElement('div');
      details.className = 'announcement-list-details';

      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'announcement-list-title';
      title.setAttribute('aria-expanded', 'false');
      title.textContent = `${announcement.icon || '📢'} ${announcement.title}`;
      if (announcement.isNew) {
        const badge = document.createElement('span');
        badge.className = 'announcement-new-badge';
        badge.textContent = 'NEW';
        title.append(' ', badge);
      }

      const dates = document.createElement('p');
      dates.className = 'announcement-list-dates';
      dates.textContent = `${formatAnnouncementDate(announcement.startAt)} – ${formatAnnouncementDate(announcement.endAt)}`;

      const content = document.createElement('p');
      content.className = 'announcement-list-content d-none';
      content.textContent = announcement.content;

      title.addEventListener('click', () => {
        const expanded = title.getAttribute('aria-expanded') === 'true';
        title.setAttribute('aria-expanded', String(!expanded));
        content.classList.toggle('d-none', expanded);
      });

      details.append(title, dates, content);
      item.append(number, details);
      announcementList.appendChild(item);
    });
  }

  async function loadAnnouncements() {
    if (!announcementList || !dashboardStatus) return;
    setAnnouncementStatus(dashboardStatus, 'กำลังโหลดประกาศ...', false);
    try {
      const data = await postAnnouncementApi({ action: 'announcements' }, 'GET');
      if (!Array.isArray(data.announcements)) throw new Error('รูปแบบข้อมูลประกาศไม่ถูกต้อง');
      renderAnnouncements(data.announcements);
      setAnnouncementStatus(dashboardStatus, '', false);
      dashboardEmpty.querySelector('p').textContent = data.announcements.length
        ? ''
        : 'ขณะนี้ยังไม่มีประกาศที่กำลังเผยแพร่';
    } catch (error) {
      setAnnouncementStatus(dashboardStatus, error.message || 'โหลดประกาศไม่สำเร็จ กรุณาลองใหม่', true);
    }
  }

  function openAnnouncementEditor() {
    if (!editorPopup) return;
    editorPopup.classList.remove('d-none');
    document.body.classList.add('announcement-dashboard-open');
    setAnnouncementStatus(announcementLoginStatus, '', false);
    setAnnouncementStatus(announcementFormStatus, '', false);
    const hasTeacherToken = Boolean(localStorage.getItem(teacherTokenKey));
    announcementLoginForm.classList.toggle('d-none', hasTeacherToken);
    announcementForm.classList.toggle('d-none', !hasTeacherToken);
    if (hasTeacherToken) {
      document.getElementById('announcement-editor-account').textContent = 'เข้าสู่ระบบด้วยบัญชีครูที่อนุมัติแล้ว';
      announcementForm.elements.startAt.min = getLocalDateTimeValue(new Date());
      announcementForm.elements.endAt.min = announcementForm.elements.startAt.min;
      announcementForm.elements.startAt.value = announcementForm.elements.startAt.min;
      const defaultEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      announcementForm.elements.endAt.value = getLocalDateTimeValue(defaultEnd);
      announcementForm.elements.title.focus();
    } else {
      announcementLoginForm.querySelector('input').focus();
    }
  }

  function getLocalDateTimeValue(date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  }

  function closeAnnouncementEditor() {
    editorPopup.classList.add('d-none');
    if (dashboardPopup?.classList.contains('d-none')) {
      document.body.classList.remove('announcement-dashboard-open');
    }
    dashboardAddButton?.focus();
  }

  if (dashboardOpenButton && dashboardPopup && dashboardCloseButton) {
    function closeDashboard() {
      dashboardPopup.classList.add('d-none');
      document.body.classList.remove('announcement-dashboard-open');
      dashboardOpenButton.setAttribute('aria-expanded', 'false');
      dashboardOpenButton.focus();
    }

    dashboardOpenButton.addEventListener('click', (event) => {
      event.preventDefault();
      dashboardPopup.classList.remove('d-none');
      document.body.classList.add('announcement-dashboard-open');
      dashboardOpenButton.setAttribute('aria-expanded', 'true');
      dashboardCloseButton.focus();
      loadAnnouncements();
    });
    dashboardCloseButton.addEventListener('click', closeDashboard);
    dashboardPopup.addEventListener('click', (event) => {
      if (event.target === dashboardPopup) closeDashboard();
    });
    document.addEventListener('keydown', (event) => {
      if (!dashboardPopup.classList.contains('d-none') && event.key === 'Escape') closeDashboard();
    });
  }

  dashboardAddButton?.addEventListener('click', openAnnouncementEditor);
  editorCloseButton?.addEventListener('click', closeAnnouncementEditor);
  editorPopup?.addEventListener('click', (event) => {
    if (event.target === editorPopup) closeAnnouncementEditor();
  });
  document.addEventListener('keydown', (event) => {
    if (!editorPopup?.classList.contains('d-none') && event.key === 'Escape') closeAnnouncementEditor();
  });

  announcementLoginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = announcementLoginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    setAnnouncementStatus(announcementLoginStatus, 'กำลังตรวจสอบบัญชีครู...', false);
    try {
      const formData = new FormData(announcementLoginForm);
      const data = await postAnnouncementApi({
        formName: 'teacher-login',
        email: formData.get('email'),
        password: formData.get('password')
      }, 'POST');
      localStorage.setItem(teacherTokenKey, data.token);
      announcementLoginForm.classList.add('d-none');
      announcementForm.classList.remove('d-none');
      document.getElementById('announcement-editor-account').textContent =
        `เข้าสู่ระบบแล้ว: ${data.teacherName || 'ครูที่ได้รับอนุมัติ'}`;
      announcementForm.elements.startAt.min = getLocalDateTimeValue(new Date());
      announcementForm.elements.endAt.min = announcementForm.elements.startAt.min;
      announcementForm.elements.startAt.value = announcementForm.elements.startAt.min;
      announcementForm.elements.endAt.value = getLocalDateTimeValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      setAnnouncementStatus(announcementLoginStatus, '', false);
      announcementForm.elements.title.focus();
    } catch (error) {
      setAnnouncementStatus(announcementLoginStatus, error.message || 'เข้าสู่ระบบไม่สำเร็จ', true);
    } finally {
      submitButton.disabled = false;
    }
  });

  announcementForm?.elements.startAt.addEventListener('change', () => {
    announcementForm.elements.endAt.min = announcementForm.elements.startAt.value;
  });

  document.querySelectorAll('[data-announcement-emoji]').forEach((button) => {
    button.addEventListener('click', () => {
      const content = announcementForm.elements.content;
      const emoji = button.dataset.announcementEmoji;
      content.setRangeText(emoji, content.selectionStart, content.selectionEnd, 'end');
      content.focus();
    });
  });

  announcementForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = announcementForm.querySelector('button[type="submit"]');
    const formData = new FormData(announcementForm);
    if (new Date(formData.get('endAt')) <= new Date(formData.get('startAt'))) {
      setAnnouncementStatus(announcementFormStatus, 'วันและเวลาสิ้นสุดต้องอยู่หลังวันและเวลาเริ่มประกาศ', true);
      return;
    }
    submitButton.disabled = true;
    setAnnouncementStatus(announcementFormStatus, 'กำลังบันทึกประกาศ...', false);
    try {
      const data = await postAnnouncementApi({
        formName: 'create-announcement',
        token: localStorage.getItem(teacherTokenKey) || '',
        title: formData.get('title').trim(),
        startAt: formData.get('startAt'),
        endAt: formData.get('endAt'),
        icon: formData.get('icon'),
        content: formData.get('content').trim()
      }, 'POST');
      setAnnouncementStatus(announcementFormStatus, data.message || 'บันทึกประกาศแล้ว', false);
      announcementForm.reset();
      await loadAnnouncements();
      closeAnnouncementEditor();
    } catch (error) {
      if (/เข้าสู่ระบบครูใหม่|บัญชีครู/i.test(error.message)) {
        localStorage.removeItem(teacherTokenKey);
        announcementForm.classList.add('d-none');
        announcementLoginForm.classList.remove('d-none');
        setAnnouncementStatus(announcementLoginStatus, error.message, true);
      } else {
        setAnnouncementStatus(announcementFormStatus, error.message || 'บันทึกประกาศไม่สำเร็จ', true);
      }
    } finally {
      submitButton.disabled = false;
    }
  });

  const openButton = document.getElementById('open-announcement-gallery');
  const popup = document.getElementById('announcement-gallery-popup');
  if (!openButton || !popup) return;

  const closeButton = document.getElementById('announcement-gallery-close');
  const previousButton = document.getElementById('announcement-gallery-previous');
  const nextButton = document.getElementById('announcement-gallery-next');
  const autoplayButton = document.getElementById('announcement-gallery-autoplay');
  const downloadButton = document.getElementById('announcement-gallery-download');
  const downloadPopup = document.getElementById('announcement-gallery-download-popup');
  const downloadCloseButton = document.getElementById('announcement-gallery-download-close');
  const imageElement = document.getElementById('announcement-gallery-image');
  const counter = document.getElementById('announcement-gallery-counter');
  const status = document.getElementById('announcement-gallery-status');
  let images = [];
  let currentIndex = 0;
  let autoplayTimer = 0;
  let requestController = null;
  let requestId = 0;
  let isPlaying = true;
  const requestTimeoutMs = 20000;

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
    status.classList.toggle('d-none', !message);
  }

  function closeDownloadNotice() {
    downloadPopup.classList.add('d-none');
    downloadButton.setAttribute('aria-expanded', 'false');
    downloadButton.focus();
  }

  downloadButton.addEventListener('click', () => {
    downloadPopup.classList.remove('d-none');
    downloadButton.setAttribute('aria-expanded', 'true');
    downloadCloseButton.focus();
  });
  downloadCloseButton.addEventListener('click', closeDownloadNotice);
  downloadPopup.addEventListener('click', (event) => {
    if (event.target === downloadPopup) closeDownloadNotice();
  });

  function stopAutoplay() {
    window.clearInterval(autoplayTimer);
    autoplayTimer = 0;
  }

  function startAutoplay() {
    stopAutoplay();
    if (images.length < 2 || !isPlaying) return;
    autoplayTimer = window.setInterval(() => showImage(currentIndex + 1), 6000);
  }

  function showImage(index) {
    if (!images.length) return;
    currentIndex = (index + images.length) % images.length;
    const image = images[currentIndex];
    imageElement.classList.remove('d-none');
    imageElement.alt = image.name;
    imageElement.src = `https://drive.google.com/thumbnail?id=${encodeURIComponent(image.id)}&sz=w1600`;
    counter.textContent = `${currentIndex + 1} / ${images.length} - ${image.name}`;
    setStatus('', false);

    const nextImage = images[(currentIndex + 1) % images.length];
    const preload = new Image();
    preload.src = `https://drive.google.com/thumbnail?id=${encodeURIComponent(nextImage.id)}&sz=w1600`;
  }

  function closeGallery() {
    requestId += 1;
    requestController?.abort();
    requestController = null;
    stopAutoplay();
    popup.classList.add('d-none');
    document.body.classList.remove('announcement-gallery-open');
    openButton.setAttribute('aria-expanded', 'false');
    openButton.focus();
  }

  async function openGallery() {
    popup.classList.remove('d-none');
    document.body.classList.add('announcement-gallery-open');
    openButton.setAttribute('aria-expanded', 'true');
    closeButton.focus();
    imageElement.classList.add('d-none');
    counter.textContent = '';
    setStatus('กำลังโหลดภาพประกาศ...', false);
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const currentRequestId = ++requestId;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);

    try {
      if (!endpoint) throw new Error('ไม่พบที่อยู่ระบบสำหรับโหลดภาพ');
      const response = await fetch(`${endpoint}?action=announcement-gallery`, {
        cache: 'no-store',
        signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'โหลดภาพประกาศไม่สำเร็จ');
      if (currentRequestId !== requestId || popup.classList.contains('d-none')) return;
      if (!Array.isArray(data.images)) {
        throw new Error('ระบบโหลดภาพยังไม่พร้อม กรุณาอัปเดต Apps Script');
      }

      images = data.images.filter((image) => image && image.id && image.name);
      if (!images.length) {
        setStatus('ไม่พบไฟล์ภาพในโฟลเดอร์ประกาศ', true);
        return;
      }

      currentIndex = 0;
      isPlaying = true;
      autoplayButton.textContent = 'หยุดสไลด์';
      autoplayButton.setAttribute('aria-label', 'หยุดสไลด์');
      showImage(currentIndex);
      startAutoplay();
    } catch (error) {
      if (error.name !== 'AbortError' && currentRequestId === requestId) {
        setStatus(error.message || 'โหลดภาพประกาศไม่สำเร็จ กรุณาลองใหม่', true);
      } else if (timedOut && currentRequestId === requestId) {
        setStatus('โหลดรายการภาพใช้เวลานานเกินไป กรุณาลองใหม่', true);
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestController === controller) requestController = null;
    }
  }

  openButton.addEventListener('click', (event) => {
    event.preventDefault();
    openGallery();
  });
  closeButton.addEventListener('click', closeGallery);
  previousButton.addEventListener('click', () => showImage(currentIndex - 1));
  nextButton.addEventListener('click', () => showImage(currentIndex + 1));
  autoplayButton.addEventListener('click', () => {
    isPlaying = !isPlaying;
    autoplayButton.textContent = isPlaying ? 'หยุดสไลด์' : 'เล่นสไลด์';
    autoplayButton.setAttribute('aria-label', isPlaying ? 'หยุดสไลด์' : 'เล่นสไลด์');
    if (isPlaying) startAutoplay();
    else stopAutoplay();
  });
  popup.addEventListener('click', (event) => {
    if (event.target === popup) closeGallery();
  });
  document.addEventListener('keydown', (event) => {
    if (popup.classList.contains('d-none')) return;
    if (event.key === 'Escape' && !downloadPopup.classList.contains('d-none')) {
      closeDownloadNotice();
      return;
    }
    if (event.key === 'Escape') closeGallery();
    if (event.key === 'ArrowLeft') showImage(currentIndex - 1);
    if (event.key === 'ArrowRight') showImage(currentIndex + 1);
  });
  imageElement.addEventListener('error', () => {
    imageElement.classList.add('d-none');
    setStatus('เปิดภาพนี้ไม่ได้ กรุณาลองภาพถัดไป', true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoplay();
    else if (!popup.classList.contains('d-none')) startAutoplay();
  });
})();
