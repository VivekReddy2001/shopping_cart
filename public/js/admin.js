/* Admin panel: inline order status updates (REST API), image previews, chart tooltips, mobile nav. */
(function () {
  'use strict';

  var api = window.Kartly && window.Kartly.api;
  var toast = window.Kartly && window.Kartly.toast;

  // Inline order status changes → PATCH /api/v1/admin/orders/:orderNumber/status
  document.addEventListener('change', function (event) {
    var select = event.target.closest('[data-order-status]');
    if (!select || !api) return;
    var orderNumber = select.getAttribute('data-order-status');
    var previous = select.getAttribute('data-current');
    var next = select.value;
    if (next === previous) return;
    select.disabled = true;
    api('/api/v1/admin/orders/' + encodeURIComponent(orderNumber) + '/status', {
      method: 'PATCH',
      body: { status: next },
    })
      .then(function () {
        toast(
          'Order ' +
            orderNumber +
            ' marked as ' +
            select.options[select.selectedIndex].text.replace('→ ', '').toLowerCase() +
            '.'
        );
        setTimeout(function () {
          window.location.reload();
        }, 700);
      })
      .catch(function (err) {
        select.value = previous;
        select.disabled = false;
        toast(err.message, { type: 'error' });
      });
  });

  // Product image preview before upload.
  document.addEventListener('change', function (event) {
    if (!event.target.matches('[data-image-input]')) return;
    var file = event.target.files && event.target.files[0];
    var preview = document.querySelector('[data-image-preview]');
    if (file && preview) preview.src = URL.createObjectURL(file);
  });

  // Chart hover tooltips (per-column hit areas).
  document.querySelectorAll('[data-chart]').forEach(function (wrap) {
    var svg = wrap.querySelector('svg');
    var tip = wrap.querySelector('[data-chart-tooltip]');
    if (!svg || !tip) return;
    function show(group) {
      var box = svg.getBoundingClientRect();
      var scale = box.width / svg.viewBox.baseVal.width;
      var x =
        Number(group.getAttribute('data-x')) * scale +
        (box.left - wrap.getBoundingClientRect().left);
      var y =
        Number(group.getAttribute('data-y')) * scale + (box.top - wrap.getBoundingClientRect().top);
      var orders = Number(group.getAttribute('data-orders'));
      tip.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = group.getAttribute('data-value');
      tip.appendChild(strong);
      tip.appendChild(
        document.createTextNode(
          group.getAttribute('data-label') + ' · ' + orders + (orders === 1 ? ' order' : ' orders')
        )
      );
      tip.style.left = x + 'px';
      tip.style.top = y - 10 + 'px';
      tip.hidden = false;
      svg.querySelectorAll('.bar-group.is-active').forEach(function (g) {
        g.classList.remove('is-active');
      });
      group.classList.add('is-active');
    }
    svg.addEventListener('mouseover', function (event) {
      var group = event.target.closest('[data-bar]');
      if (group) show(group);
    });
    svg.addEventListener('mouseleave', function () {
      tip.hidden = true;
      svg.querySelectorAll('.bar-group.is-active').forEach(function (g) {
        g.classList.remove('is-active');
      });
    });
  });

  // Mobile sidebar toggle.
  var shell = document.querySelector('[data-admin-shell]');
  document.addEventListener('click', function (event) {
    if (!shell) return;
    if (event.target.closest('[data-admin-menu]')) {
      shell.classList.toggle('nav-open');
    } else if (shell.classList.contains('nav-open') && !event.target.closest('.admin-sidebar')) {
      shell.classList.remove('nav-open');
    }
  });
})();
