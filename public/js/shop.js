/* Catalogue page: instant filtering, sorting and pagination without full reloads.
   The server renders the results fragment; the URL stays shareable. */
(function () {
  'use strict';

  var root = document.querySelector('[data-shop-root]');
  if (!root) return;
  var controller = null;

  function collapseFiltersOnMobile() {
    var panel = root.querySelector('[data-filters-panel]');
    if (panel && window.matchMedia('(max-width: 900px)').matches) panel.removeAttribute('open');
  }

  function queryFromForm() {
    var form = root.querySelector('[data-filters]');
    var params = new URLSearchParams();
    new FormData(form).forEach(function (value, key) {
      if (value !== '') params.append(key, value);
    });
    if (params.get('sort') === 'relevance') params.delete('sort');
    var brands = params.getAll('brand');
    if (brands.length) {
      params.delete('brand');
      params.set('brand', brands.join(','));
    }
    var qs = params.toString();
    return '/products' + (qs ? '?' + qs : '');
  }

  function load(url, push) {
    if (controller) controller.abort();
    controller = new AbortController();
    root.setAttribute('aria-busy', 'true');
    fetch(url, {
      headers: { 'X-Requested-With': 'fetch' },
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Request failed');
        return res.text();
      })
      .then(function (html) {
        root.innerHTML = html;
        root.removeAttribute('aria-busy');
        var titleNode = root.querySelector('[data-page-title]');
        if (titleNode) document.title = titleNode.getAttribute('data-page-title');
        if (push) history.pushState({ shop: true }, '', url);
        collapseFiltersOnMobile();
        var top = root.getBoundingClientRect().top + window.scrollY - 140;
        if (window.scrollY > top) window.scrollTo({ top: top, behavior: 'smooth' });
      })
      .catch(function (err) {
        if (err.name === 'AbortError') return;
        window.location.href = url; // graceful fallback
      });
  }

  var debounce;
  root.addEventListener('change', function (event) {
    if (!event.target.closest('[data-filters]') && !event.target.matches('[data-sort]')) return;
    clearTimeout(debounce);
    debounce = setTimeout(
      function () {
        load(queryFromForm(), true);
      },
      event.target.type === 'number' ? 350 : 0
    );
  });

  root.addEventListener('submit', function (event) {
    if (!event.target.matches('[data-filters]')) return;
    event.preventDefault();
    load(queryFromForm(), true);
  });

  root.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-shop-link]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    load(link.getAttribute('href'), true);
  });

  window.addEventListener('popstate', function () {
    load(window.location.pathname + window.location.search, false);
  });

  collapseFiltersOnMobile();
})();
