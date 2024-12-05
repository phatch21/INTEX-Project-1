
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerIcon = document.getElementById('hamburger-icon');
    const dropdownMenu = document.getElementById('dropdown-menu');

    const toggleDropdown = () => {
    if (window.innerWidth <= 768) {
        dropdownMenu.classList.toggle('hidden');
    }
    };

    const resetDropdown = () => {
    if (window.innerWidth > 768) {
        dropdownMenu.classList.add('hidden'); // Ensure dropdown is hidden
    }
    };

    // Toggle dropdown menu on click
    hamburgerIcon.addEventListener('click', toggleDropdown);

    // Ensure dropdown is reset when resizing to larger screens
    window.addEventListener('resize', resetDropdown);

    // Initial reset for larger screens
    resetDropdown();
});