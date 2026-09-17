(function () {
  'use strict';

  const GOOGLE_SHEET_URL_PLACEHOLDER = 'PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';

  function getActionUrl(form) {
    const action = form.getAttribute('action') || form.dataset.googleSheetUrl || '';
    if (!action || action.includes(GOOGLE_SHEET_URL_PLACEHOLDER)) {
      return '';
    }
    return action;
  }

  function setStatus(form, type, message) {
    const loading = form.querySelector('.loading');
    const errorMessage = form.querySelector('.error-message');
    const sentMessage = form.querySelector('.sent-message');

    if (loading) loading.classList.toggle('d-none', type !== 'loading');
    if (errorMessage) {
      errorMessage.textContent = message || '';
      errorMessage.classList.toggle('d-block', type === 'error');
      errorMessage.classList.toggle('d-none', type !== 'error');
    }
    if (sentMessage) {
      sentMessage.textContent = message || 'บันทึกข้อมูลเรียบร้อยแล้ว';
      sentMessage.classList.toggle('d-block', type === 'success');
      sentMessage.classList.toggle('d-none', type !== 'success');
    }
  }

  function showLookupResult(resultBox, payload) {
    if (!resultBox) return;
    if (!payload || !payload.found) {
      resultBox.innerHTML = '<div class="alert alert-warning mb-0">ไม่พบข้อมูลตามเลขประจำตัวที่ค้นหา</div>';
      return;
    }

    resultBox.innerHTML = `
      <div class="alert alert-success mb-0">
        <strong>พบข้อมูล:</strong><br>
        ${payload.name || '-'}<br>
        ${payload.department || '-'}<br>
        ${payload.quota || '-'}
      </div>
    `;
  }

  function parseJsonResponse(responseText) {
    try {
      return JSON.parse(responseText);
    } catch (error) {
      return { ok: false, message: responseText || 'Unknown error' };
    }
  }

  document.querySelectorAll('.gs-lookup').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const action = getActionUrl(form);
      const resultBox = document.getElementById(form.dataset.resultId || 'student-result');
      const field = form.querySelector('input[name="studentId"], input[name="studentCode"]');

      if (!action) {
        if (resultBox) {
          resultBox.innerHTML = '<div class="alert alert-danger mb-0">กรุณาตั้งค่า Google Apps Script URL ก่อนใช้งาน</div>';
        }
        return;
      }

      if (!field || !field.value.trim()) {
        if (resultBox) {
          resultBox.innerHTML = '<div class="alert alert-warning mb-0">กรุณากรอกเลขประจำตัวก่อนค้นหา</div>';
        }
        return;
      }

      const query = new URLSearchParams({ action: 'lookup', studentId: field.value.trim() });
      const url = `${action}?${query.toString()}`;

      try {
        const response = await fetch(url);
        const text = await response.text();
        const data = parseJsonResponse(text);

        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'การค้นหาล้มเหลว');
        }

        showLookupResult(resultBox, data.data || null);
        const registrationForm = document.getElementById('registration-form');
        if (registrationForm) {
          const studentField = registrationForm.querySelector('input[name="studentId"]');
          if (studentField) studentField.value = field.value.trim();
          const nameField = registrationForm.querySelector('input[name="fullName"]');
          if (nameField && data.data && data.data.name) nameField.value = data.data.name;
          const departmentField = registrationForm.querySelector('input[name="department"]');
          if (departmentField && data.data && data.data.department) departmentField.value = data.data.department;
          const quotaField = registrationForm.querySelector('input[name="quota"]');
          if (quotaField && data.data && data.data.quota) quotaField.value = data.data.quota;
        }
      } catch (error) {
        if (resultBox) {
          resultBox.innerHTML = `<div class="alert alert-danger mb-0">${error.message}</div>`;
        }
      }
    });
  });

  document.querySelectorAll('.gs-form').forEach((form) => {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();

      const action = getActionUrl(form);
      const loading = form.querySelector('.loading');
      const submitButton = form.querySelector('button[type="submit"]');

      if (!action) {
        setStatus(form, 'error', 'กรุณาใส่ Google Apps Script URL ให้ถูกต้องก่อนส่งข้อมูล');
        return;
      }

      if (loading) loading.classList.remove('d-none');
      setStatus(form, 'error', '');
      if (submitButton) submitButton.disabled = true;

      try {
        const formData = new FormData(form);
        const payload = new URLSearchParams();

        formData.forEach((value, key) => {
          const text = value ? value.toString().trim() : '';
          if (text) payload.append(key, text);
        });

        payload.append('formName', form.dataset.formName || 'registration');
        payload.append('submittedAt', new Date().toISOString());

        const response = await fetch(action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: payload.toString()
        });

        const responseText = await response.text();
        const data = parseJsonResponse(responseText);

        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'ส่งข้อมูลล้มเหลว');
        }

        form.reset();
        if (data.registrationId) {
          setStatus(form, 'success', `บันทึกข้อมูลเรียบร้อยแล้ว เลขประจำตัว 13 หลัก: ${data.registrationId}`);
        } else {
          setStatus(form, 'success', data.message || 'บันทึกข้อมูลเรียบร้อยแล้ว');
        }
      } catch (error) {
        setStatus(form, 'error', error.message || 'เกิดข้อผิดพลาดในการส่งข้อมูล');
      } finally {
        if (loading) loading.classList.add('d-none');
        if (submitButton) submitButton.disabled = false;
      }
    });
  });
})();
