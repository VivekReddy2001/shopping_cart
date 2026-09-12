/* Cart page: quantity changes and removals go through the REST API,
   then the server re-renders the cart fragment so totals are always authoritative. */
(function () {
  'use strict';

  var root = document.querySelector('[data-cart-root]');
  if (!root || !window.Kartly) return;
  var api = window.Kartly.api;
  var toast = window.Kartly.toast;

  function refresh() {
    return fetch('/cart', { headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' })
      .then(function (res) {
        return res.text();
      })
      .then(function (html) {
        root.innerHTML = html;
        var countNode = root.querySelector('[data-cart-count-value]');
        if (countNode)
          window.Kartly.setCartCount(Number(countNode.getAttribute('data-cart-count-value')));
      });
  }

  function mutate(promise) {
    root.setAttribute('aria-busy', 'true');
    return promise
      .then(refresh)
      .catch(function (err) {
        toast(err.message, { type: 'error' });
        return refresh();
      })
      .finally(function () {
        root.removeAttribute('aria-busy');
      });
  }

  function setQuantity(line, quantity) {
    var id = line.getAttribute('data-product-id');
    if (quantity < 1) return;
    mutate(
      api('/api/v1/cart/items/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: { quantity: quantity },
      })
    );
  }

  /* Every control on this page is a real form that works without JavaScript.
     With JavaScript we intercept the submit, call the JSON API and swap in a
     freshly rendered fragment, so totals always come from the server. */
  root.addEventListener('submit', function (event) {
    var form = event.target;

    if (form.matches('[data-cart-clear-form]')) {
      event.preventDefault();
      var dialog = document.getElementById('confirm-dialog');
      var clear = function () {
        mutate(api('/api/v1/cart', { method: 'DELETE' }));
      };
      if (!dialog || typeof dialog.showModal !== 'function') {
        if (window.confirm('Remove every item from your cart?')) clear();
        return;
      }
      dialog.querySelector('[data-confirm-title]').textContent = 'Clear your cart?';
      dialog.querySelector('[data-confirm-message]').textContent =
        'Every item will be removed from your cart.';
      dialog.querySelector('[data-confirm-ok]').textContent = 'Clear cart';
      dialog.returnValue = '';
      dialog.showModal();
      dialog.addEventListener(
        'close',
        function () {
          if (dialog.returnValue === 'confirm') clear();
        },
        { once: true }
      );
      return;
    }

    if (!form.matches('[data-cart-form]')) return;
    event.preventDefault();

    var line = form.closest('[data-cart-line]');
    var submitter = event.submitter;
    var input = line.querySelector('[data-cart-qty]');
    var current = parseInt(input.value, 10) || 1;

    if (submitter && submitter.hasAttribute('data-cart-remove')) {
      var name = line.querySelector('h3').textContent.trim();
      mutate(
        api('/api/v1/cart/items/' + encodeURIComponent(line.getAttribute('data-product-id')), {
          method: 'DELETE',
        })
      ).then(function () {
        toast('Removed ' + name + ' from your cart.', { icon: 'trash' });
      });
      return;
    }

    var step = submitter && submitter.getAttribute('data-cart-step');
    setQuantity(line, step ? current + Number(step) : Math.max(1, current));
  });

  root.addEventListener('change', function (event) {
    if (!event.target.matches('[data-cart-qty]')) return;
    var line = event.target.closest('[data-cart-line]');
    setQuantity(line, Math.max(1, parseInt(event.target.value, 10) || 1));
  });
})();
