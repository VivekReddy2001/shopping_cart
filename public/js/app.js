/* Kartly — global client-side behaviour (no framework, CSP-safe, progressive enhancement). */
(function () {
  'use strict';

  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.content : '';

  /* ------------------------------------------------------------------ API */

  /** fetch() wrapper for the JSON REST API: CSRF header, JSON body, typed errors. */
  function api(url, options) {
    options = options || {};
    var headers = { Accept: 'application/json', 'X-CSRF-Token': csrfToken };
    var body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    return fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: body,
      credentials: 'same-origin',
    }).then(function (res) {
      if (res.status === 204) return null;
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (json) {
          if (!res.ok) {
            var err = new Error(
              (json.error && json.error.message) || 'Something went wrong. Please try again.'
            );
            err.status = res.status;
            err.code = json.error && json.error.code;
            err.details = json.error && json.error.details;
            throw err;
          }
          return json;
        });
    });
  }

  /* --------------------------------------------------------------- Toasts */

  var toastRegion = document.getElementById('toast-region');
  function icon(name) {
    return (
      '<svg class="icon" aria-hidden="true"><use href="/img/icons.svg#' + name + '"></use></svg>'
    );
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(message, opts) {
    opts = opts || {};
    if (!toastRegion) return;
    var el = document.createElement('div');
    el.className = 'toast' + (opts.type === 'error' ? ' is-error' : '');
    el.setAttribute('role', opts.type === 'error' ? 'alert' : 'status');
    el.innerHTML =
      icon(opts.type === 'error' ? 'alert' : opts.icon || 'check-circle') +
      '<span>' +
      escapeHtml(message) +
      '</span>' +
      (opts.action
        ? '<a href="' + escapeHtml(opts.action.href) + '">' + escapeHtml(opts.action.label) + '</a>'
        : '');
    toastRegion.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () {
        el.remove();
      }, 250);
    }, opts.duration || 4000);
  }

  /* ----------------------------------------------------------- Cart badge */

  function setCartCount(count) {
    document.querySelectorAll('[data-cart-count]').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.setAttribute('data-count', String(count));
    });
    var link = document.querySelector('[data-cart-link]');
    if (link) {
      link.setAttribute('aria-label', 'Cart, ' + count + ' items');
      link.classList.remove('bump');
      void link.offsetWidth; // restart animation
      link.classList.add('bump');
    }
  }

  /* ---------------------------------------------------------- Add to cart */

  /* The markup is a real <form> that works without JavaScript; when scripting is
     available we intercept the submit and use the JSON API instead, so the page
     never reloads. */
  document.addEventListener('submit', function (event) {
    var form = event.target.closest('[data-add-form]');
    if (!form) return;
    var button = event.submitter || form.querySelector('[data-add-to-cart]');
    if (!button || button.disabled) return;
    event.preventDefault();

    var quantity = 1;
    var qtySelector = button.getAttribute('data-qty-from');
    if (qtySelector) {
      var input = document.querySelector(qtySelector);
      quantity = Math.max(1, parseInt(input && input.value, 10) || 1);
    }
    var buyNow = button.hasAttribute('data-buy-now');

    button.disabled = true;
    button.classList.add('is-loading');
    api('/api/v1/cart/items', {
      method: 'POST',
      body: { productId: button.getAttribute('data-add-to-cart'), quantity: quantity },
    })
      .then(function (res) {
        setCartCount(res.data.itemCount);
        if (buyNow) {
          window.location.href = '/checkout';
          return;
        }
        toast(res.meta && res.meta.message ? res.meta.message : 'Added to your cart.', {
          action: { href: '/cart', label: 'View cart' },
        });
      })
      .catch(function (err) {
        toast(err.message, { type: 'error' });
      })
      .finally(function () {
        button.disabled = false;
        button.classList.remove('is-loading');
      });
  });

  /* --------------------------------------------------------- Voice search */

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var activeRecognition = null;

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-voice-search]');
    if (!button) return;
    event.preventDefault();
    if (!Recognition) {
      toast('Voice search isn’t supported in this browser. Try Chrome, Edge or Safari.', {
        type: 'error',
      });
      return;
    }
    if (activeRecognition) {
      activeRecognition.stop();
      return;
    }
    var form = button.closest('form');
    var input = form && form.querySelector('[data-search-input]');
    var recognition = new Recognition();
    recognition.lang =
      document.documentElement.lang === 'en' ? 'en-IN' : document.documentElement.lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    activeRecognition = recognition;

    button.classList.add('is-listening');
    button.setAttribute('aria-pressed', 'true');
    toast('Listening… try “Samsung phones under 20000”.', { icon: 'mic', duration: 3000 });

    var finalTranscript = '';
    recognition.onresult = function (e) {
      var transcript = '';
      for (var i = 0; i < e.results.length; i += 1) {
        transcript += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript = transcript;
      }
      if (input) input.value = transcript.trim();
    };
    recognition.onerror = function (e) {
      var messages = {
        'not-allowed':
          'Microphone access was blocked. Allow it in your browser settings to use voice search.',
        'no-speech': 'We didn’t hear anything. Tap the mic and try again.',
        network: 'Voice recognition needs an internet connection.',
      };
      if (e.error !== 'aborted')
        toast(messages[e.error] || 'Voice search stopped: ' + e.error, { type: 'error' });
    };
    recognition.onend = function () {
      button.classList.remove('is-listening');
      button.setAttribute('aria-pressed', 'false');
      activeRecognition = null;
      var value = (finalTranscript || (input && input.value) || '').trim();
      if (value && form) {
        if (input) input.value = value;
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      }
    };
    recognition.start();
  });

  /* ------------------------------------------------------ Confirm dialogs */

  var dialog = document.getElementById('confirm-dialog');
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form.hasAttribute('data-confirm') || form.dataset.confirmed === 'true') return;
    if (!dialog || typeof dialog.showModal !== 'function') {
      if (!window.confirm(form.getAttribute('data-confirm'))) event.preventDefault();
      return;
    }
    event.preventDefault();
    dialog.querySelector('[data-confirm-title]').textContent =
      form.getAttribute('data-confirm-title') || 'Are you sure?';
    dialog.querySelector('[data-confirm-message]').textContent = form.getAttribute('data-confirm');
    dialog.querySelector('[data-confirm-ok]').textContent =
      form.getAttribute('data-confirm-ok') || 'Confirm';
    dialog.returnValue = '';
    dialog.showModal();
    dialog.addEventListener(
      'close',
      function () {
        if (dialog.returnValue === 'confirm') {
          form.dataset.confirmed = 'true';
          if (form.requestSubmit) form.requestSubmit();
          else form.submit();
        }
      },
      { once: true }
    );
  });

  /** Prevents double submission of important forms (checkout, sign in…). */
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (event.defaultPrevented || !form.hasAttribute('data-disable-on-submit')) return;
    if (form.dataset.submitting === 'true') {
      event.preventDefault();
      return;
    }
    form.dataset.submitting = 'true';
    var submit = form.querySelector('[type="submit"]');
    if (submit) submit.classList.add('is-loading');
    // Re-enable if the user navigates back to the page.
    window.addEventListener(
      'pageshow',
      function () {
        form.dataset.submitting = 'false';
        if (submit) submit.classList.remove('is-loading');
      },
      { once: true }
    );
  });

  /* ------------------------------------------------------ Small helpers */

  document.addEventListener('click', function (event) {
    var dismiss = event.target.closest('[data-dismiss]');
    if (dismiss) dismiss.closest('[data-flash]').remove();

    var toggle = event.target.closest('[data-toggle-password]');
    if (toggle) {
      var field = document.getElementById(toggle.getAttribute('data-toggle-password'));
      var show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.innerHTML = icon(show ? 'eye-off' : 'eye');
    }

    var demo = event.target.closest('[data-demo-login]');
    if (demo) {
      var loginForm = document.querySelector('[data-login-form]');
      loginForm.querySelector('[name="email"]').value = demo.getAttribute('data-email');
      loginForm.querySelector('[name="password"]').value = demo.getAttribute('data-password');
      if (loginForm.requestSubmit) loginForm.requestSubmit();
      else loginForm.submit();
    }

    if (event.target.closest('[data-print]')) window.print();

    // Close the account menu when clicking elsewhere.
    document.querySelectorAll('details[data-menu][open]').forEach(function (menu) {
      if (!menu.contains(event.target)) menu.removeAttribute('open');
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      document.querySelectorAll('details[data-menu][open]').forEach(function (menu) {
        menu.removeAttribute('open');
      });
    }
  });

  document.addEventListener('change', function (event) {
    if (event.target.matches('[data-autosubmit]')) event.target.form.submit();
  });

  window.Kartly = { api: api, toast: toast, setCartCount: setCartCount, csrfToken: csrfToken };
})();
