document.addEventListener('DOMContentLoaded', () => {
    // Existing hamburger menu functionality
    const hamburgerIcon = document.getElementById('hamburger-icon');
    const dropdownMenu = document.getElementById('dropdown-menu');

    const toggleDropdown = () => {
        if (window.innerWidth <= 820) {
            dropdownMenu.classList.toggle('hidden');
        }
    };

    const resetDropdown = () => {
        if (window.innerWidth > 820) {
            dropdownMenu.classList.add('hidden'); // Ensure dropdown is hidden
        }
    };

    // Toggle dropdown menu on click
    hamburgerIcon.addEventListener('click', toggleDropdown);

    // Ensure dropdown is reset when resizing to larger screens
    window.addEventListener('resize', resetDropdown);

    // Initial reset for larger screens
    resetDropdown();

    // New sidebar toggle functionality
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-btn');

    const toggleSidebar = () => {
        sidebar.classList.toggle('collapsed'); // Add/remove collapsed class
        toggleBtn.classList.toggle('collapsed'); // Adjust button position
        toggleBtn.innerHTML = sidebar.classList.contains('collapsed') ? '⮞' : '⮜'; // Toggle arrow direction
    };

    // Add event listener to the toggle button
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleSidebar);
    }
});
