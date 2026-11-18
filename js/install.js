/* ============================================================
   DIGITAL-PRIME — Installation PWA + menu mobile
   - Android/Chrome : beforeinstallprompt (déclenché uniquement si le
     service worker possède un gestionnaire fetch et un manifeste valide).
   - iPhone/iPad : iOS interdit l'installation programmatique ; on affiche
     la procédure « Partager > Sur l'écran d'accueil » ET un accès direct.
   - Autres navigateurs : ouverture de l'application + instructions.
   Le bouton renvoie toujours vers l'application, quel que soit le téléphone.
   ============================================================ */
(function () {
  'use strict';

  var deferredPrompt = null;
  var APP_URL = 'app.html';

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }
  function openApp() { window.location.href = APP_URL; }

  /* Enregistrement du service worker (nécessaire à l'installabilité). */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  }

  /* Feuille d'instruction affichée sur l'accueil (toujours visible sur iOS). */
  function showHint(kind) {
    var el = document.getElementById('install-help');
    if (!el) return;
    if (kind === 'ios') {
      el.innerHTML = '<strong>iPhone / iPad :</strong> touchez le bouton « Partager » ' +
        '(<span aria-hidden="true">⬆️</span>) en bas/haut de l’écran, puis ' +
        '<strong>« Sur l’écran d’accueil »</strong> → <strong>« Ajouter »</strong>. ' +
        'L’icône DIGITAL-PRIME s’affichera comme une application.';
    } else if (kind === 'android') {
      el.innerHTML = '<strong>Android :</strong> touchez le bouton ci-dessus, puis ' +
        '<strong>« Installer »</strong> dans la fenêtre du navigateur.';
    } else {
      el.innerHTML = 'Dans le menu de votre navigateur, choisissez ' +
        '<strong>« Installer l’application »</strong> ou ' +
        '<strong>« Ajouter à l’écran d’accueil »</strong>.';
    }
  }

  /* Panneau d'installation (utilisé quand le navigateur ne peut pas installer seul). */
  function ensureSheet() {
    var sheet = document.getElementById('install-sheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'install-sheet';
    sheet.className = 'install-sheet-backdrop hidden';
    sheet.innerHTML =
      '<div class="install-sheet" role="dialog" aria-modal="true" aria-label="Installer DIGITAL-PRIME">' +
        '<div class="spread"><h3 style="margin:0">📲 Installer DIGITAL-PRIME</h3>' +
        '<button class="btn sm ghost" id="install-sheet-close" aria-label="Fermer">✕</button></div>' +
        '<ol id="install-steps" class="install-steps"></ol>' +
        '<a class="btn primary block" href="' + APP_URL + '">➡️ Ouvrir l’application</a>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (e) {
      if (e.target === sheet || (e.target.id || '').indexOf('install-sheet-close') === 0) {
        sheet.classList.add('hidden');
      }
    });
    return sheet;
  }

  function showSheet(kind) {
    var sheet = ensureSheet();
    var steps = document.getElementById('install-steps');
    if (kind === 'ios') {
      steps.innerHTML =
        '<li>Ouvrez ce site dans <strong>Safari</strong>.</li>' +
        '<li>Touchez le bouton <strong>Partager ⬆️</strong>.</li>' +
        '<li>Choisissez <strong>« Sur l’écran d’accueil »</strong>.</li>' +
        '<li>Confirmez <strong>« Ajouter »</strong> : l’icône H apparaît sur votre écran.</li>';
    } else {
      steps.innerHTML =
        '<li>Ouvrez le <strong>menu</strong> de votre navigateur (⋮ ou ☰).</li>' +
        '<li>Choisissez <strong>« Installer l’application »</strong> ou « Ajouter à l’écran d’accueil ».</li>' +
        '<li>Confirmez. Vous pouvez aussi ouvrir l’application directement ci-dessous.</li>';
    }
    sheet.classList.remove('hidden');
  }

  /* Chrome/Android : l'événement n'arrive que si le service worker est actif. */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showHint('android');
    document.querySelectorAll('.install-btn, #btn-install').forEach(function (b) {
      if (b.id === 'btn-install' && !b.classList.contains('install-btn')) return;
      b.textContent = "📲 Installer l'application";
    });
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    document.querySelectorAll('.install-btn, #btn-install').forEach(function (b) {
      b.textContent = '✅ Application installée';
    });
    showHint('android');
  });

  function handleInstall(e) {
    var homeLink = e.currentTarget.classList.contains('install-btn');
    if (deferredPrompt) {
      e.preventDefault();
      var prompt = deferredPrompt;
      deferredPrompt = null;
      prompt.prompt();
      if (prompt.userChoice && typeof prompt.userChoice.then === 'function') {
        prompt.userChoice.then(function () { openApp(); }, function () { openApp(); });
      } else {
        openApp();
      }
      return;
    }
    // Sur l'accueil, le bouton est un vrai lien : il redirige toujours vers l'application.
    if (homeLink) { showHint(isIOS() ? 'ios' : 'other'); return; }
    // Dans l'application, on affiche la procédure d'installation.
    e.preventDefault();
    showSheet(isIOS() ? 'ios' : 'other');
  }

  var targets = document.querySelectorAll('.install-btn, #btn-install');
  Array.prototype.forEach.call(targets, function (b) {
    b.addEventListener('click', handleInstall);
  });
  Array.prototype.forEach.call(document.querySelectorAll('#btn-install-help'), function (b) {
    b.addEventListener('click', function () { showSheet(isIOS() ? 'ios' : 'other'); });
  });

  if (isIOS()) showHint('ios');
  else if (!deferredPrompt) showHint('other');

  /* ---------- Menu déroulant mobile ---------- */
  function initMobileMenu() {
    var btn = document.getElementById('btn-menu');
    var panel = document.getElementById('top-actions');
    if (!btn || !panel) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.classList.toggle('open');
      btn.textContent = open ? '✕' : '☰';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('button, a')) closeMenu();
    });
    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== btn) closeMenu();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) closeMenu();
    });

    function closeMenu() {
      panel.classList.remove('open');
      btn.textContent = '☰';
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileMenu);
  } else {
    initMobileMenu();
  }
})();
