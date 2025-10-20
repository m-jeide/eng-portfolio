(function () {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    const searchToggle = document.getElementById('searchToggle');
    const searchContainer = document.getElementById('searchContainer');
    const searchInput = document.getElementById('q');
    const filterToggle = document.getElementById('filterToggle');
    const filterMenu = document.getElementById('filterMenu');

    if (!searchToggle || !searchContainer || !searchInput || !filterToggle || !filterMenu) {
      return;
    }

    // Toggle search container expansion (once expanded, stays expanded)
    searchToggle.addEventListener('click', () => {
      const isExpanded = searchContainer.classList.contains('expanded');

      if (!isExpanded) {
        // Expand search and focus input
        searchContainer.classList.add('expanded');
        setTimeout(() => {
          searchInput.focus();
        }, 100);
      }
    });

    // Toggle filter menu
    filterToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      filterMenu.classList.toggle('hidden');
    });

    // Close filter menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!filterMenu.contains(e.target) && e.target !== filterToggle) {
        filterMenu.classList.add('hidden');
      }
    });
  }
})();
