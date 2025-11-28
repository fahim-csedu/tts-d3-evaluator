document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('errorMessage');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('audioFileBrowserSession', data.sessionId);
            localStorage.setItem('audioFileBrowserUsername', data.username);
            window.location.href = '/';
        } else {
            errorMessage.textContent = data.error || 'Login failed';
        }
    } catch (error) {
        errorMessage.textContent = 'Connection error. Please try again.';
    }
});
