(function () {
  'use strict';

  const dashboardOpenButton = document.getElementById('open-announcement-dashboard');
  const dashboardPopup = document.getElementById('announcement-dashboard-popup');
  const dashboardCloseButton = document.getElementById('announcement-dashboard-close');
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
    });
    dashboardCloseButton.addEventListener('click', closeDashboard);
    dashboardPopup.addEventListener('click', (event) => {
      if (event.target === dashboardPopup) closeDashboard();
    });
    document.addEventListener('keydown', (event) => {
      if (!dashboardPopup.classList.contains('d-none') && event.key === 'Escape') closeDashboard();
    });
  }

  const openButton = document.getElementById('open-announcement-gallery');
  const popup = document.getElementById('announcement-gallery-popup');
  if (!openButton || !popup) return;

  const endpoint = document.querySelector('#registration-form')?.getAttribute('action');
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
