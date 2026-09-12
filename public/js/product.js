/* Product page: bounded quantity stepper. */
(function () {
  'use strict';

  document.querySelectorAll('[data-qty-stepper]').forEach(function (stepper) {
    var input = stepper.querySelector('[data-qty-input]');
    var max = Math.max(1, Number(stepper.getAttribute('data-max')) || 1);
    var buttons = stepper.querySelectorAll('[data-step]');

    function clamp(value) {
      var n = parseInt(value, 10);
      if (!Number.isFinite(n)) n = 1;
      return Math.min(max, Math.max(1, n));
    }
    function sync() {
      input.value = clamp(input.value);
      buttons[0].disabled = Number(input.value) <= 1;
      buttons[1].disabled = Number(input.value) >= max;
    }
    stepper.addEventListener('click', function (event) {
      var button = event.target.closest('[data-step]');
      if (!button) return;
      input.value = clamp(Number(input.value) + Number(button.getAttribute('data-step')));
      sync();
    });
    input.addEventListener('change', sync);
    sync();
  });
})();
