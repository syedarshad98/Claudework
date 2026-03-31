/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — auth.js
   Handles login.html tab switching, form submission, and token storage.
   ───────────────────────────────────────────────────────────────────────────── */

const API = '';   // same origin

// ── Redirect if already logged in ────────────────────────────────────────────
if (localStorage.getItem('ct_token')) {
  window.location.replace('/');
}

// ── Tab switching ─────────────────────────────────────────────────────────────
const tabs        = document.querySelectorAll('.auth-tab');
const loginForm   = document.getElementById('login-form');
const regForm     = document.getElementById('register-form');
const errorEl     = document.getElementById('auth-error');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    errorEl.classList.remove('visible');
    errorEl.textContent = '';

    if (tab.dataset.tab === 'login') {
      loginForm.style.display = '';
      regForm.style.display   = 'none';
    } else {
      loginForm.style.display = 'none';
      regForm.style.display   = '';
    }
  });
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add('visible');
}

function storeSession(data) {
  localStorage.setItem('ct_token',       data.token);
  localStorage.setItem('ct_company',     data.companyName);
  localStorage.setItem('ct_email',       data.email);
  localStorage.setItem('ct_role',        data.role);
  localStorage.setItem('ct_onboarding',  data.onboardingComplete ? 'complete' : 'pending');
  localStorage.setItem('ct_demo',        data.isDemo ? 'true' : 'false');
}

// ── Login ─────────────────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.remove('visible');

  const btn   = document.getElementById('login-btn');
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;

  btn.textContent = 'Signing in…';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password: pass })
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Login failed');
      return;
    }

    storeSession(data);
    // Demo accounts always go through the onboarding guide on every login
    const dest = data.isDemo ? '/onboarding.html' : (data.onboardingComplete ? '/' : '/onboarding.html');
    window.location.replace(dest);
  } catch {
    showError('Network error — please try again');
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled    = false;
  }
});

// ── Register ──────────────────────────────────────────────────────────────────
regForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.remove('visible');

  const btn         = document.getElementById('register-btn');
  const companyName = document.getElementById('reg-company').value.trim();
  const industry    = document.getElementById('reg-industry').value;
  const country     = document.getElementById('reg-country').value.trim();
  const email       = document.getElementById('reg-email').value.trim();
  const password    = document.getElementById('reg-password').value;

  if (password.length < 8) {
    showError('Password must be at least 8 characters');
    return;
  }

  btn.textContent = 'Creating account…';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${API}/api/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ companyName, industry, country, email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Registration failed');
      return;
    }

    storeSession(data);
    window.location.replace('/onboarding.html');
  } catch {
    showError('Network error — please try again');
  } finally {
    btn.textContent = 'Create Account';
    btn.disabled    = false;
  }
});
