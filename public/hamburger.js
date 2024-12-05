document.addEventListener('DOMContentLoaded', () => {
    const hamburgerIcon = document.getElementById('hamburger-icon');
    const dropdownMenu = document.getElementById('dropdown-menu');
  
    const toggleDropdown = () => {
      dropdownMenu.classList.toggle('hidden');
    };
  
    const hideDropdown = () => {
      dropdownMenu.classList.add('hidden'); // Ensure dropdown is hidden
    };
  
    // Toggle dropdown menu on hamburger click
    hamburgerIcon.addEventListener('click', toggleDropdown);
  
    // Hide dropdown menu when scrolling
    window.addEventListener('scroll', hideDropdown);
  
    // Optional: Reset dropdown visibility on resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        hideDropdown();
      }
    });
  });
  
