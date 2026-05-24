document.getElementById('newsletterForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const emailInput = document.getElementById('email-input');
    
    if(emailInput.value) {
        // Handle subscription logic (e.g., API call) here
        alert(`Thank you for subscribing: ${emailInput.value}`);
        emailInput.value = '';
    }
});