// Admin Inbox Logic
let allMessages = [];
let currentMessage = null;

// Check authentication first
async function checkAuth() {
    try {
        const response = await fetch('/api/admin/status');
        const data = await response.json();
        
        if (!data.isAdmin) {
            console.log('Not authenticated, redirecting to Home...');
            window.location.href = '/';
            return false;
        }
        
        console.log('Authenticated as:', data.user);
        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
        return false;
    }
}

// Load messages on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, checking authentication...');
    
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        console.log('Authenticated, loading messages...');
        loadMessages();
        initializeSearch();
    }
});

// Load all messages from API
async function loadMessages() {
    console.log('Loading messages from API...');
    
    try {
        const response = await fetch('/api/messages');
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Response error:', errorText);
            throw new Error(`Not authenticated`);
        }
        
        const data = await response.json();
        console.log('Messages data received:', data);

        if (data.success) {
            allMessages = data.messages || [];
            console.log('Total messages:', allMessages.length);
            
            updateUnreadCount(data.unreadCount || 0);
            renderMessageList(allMessages);
            
            // Select first message if available
            if (allMessages.length > 0) {
                selectMessageById(allMessages[0]._id.toString());
            } else {
                showEmptyState();
            }
        } else {
            throw new Error(data.message || 'Failed to load messages');
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        showError('Failed to load messages: ' + error.message);
    }
}

// Update unread count in header
function updateUnreadCount(count) {
    const subtitle = document.querySelector('.greeting-sub');
    if (subtitle) {
        subtitle.textContent = count > 0 
            ? `You have ${count} unread message${count !== 1 ? 's' : ''}`
            : 'No unread messages';
    }
}

// Render message list
function renderMessageList(messages) {
    const messageList = document.querySelector('.message-list');
    
    if (!messageList) {
        console.error('Message list element not found!');
        return;
    }
    
    if (messages.length === 0) {
        messageList.innerHTML = '<div style="padding: 40px; text-align: center; color: #999;">No messages yet</div>';
        return;
    }

    messageList.innerHTML = messages.map((msg, index) => {
        const initials = getInitials(msg.name);
        const timeAgo = formatTimeAgo(msg.createdAt);
        const preview = msg.message.substring(0, 80) + (msg.message.length > 80 ? '...' : '');
        
        return `
            <div class="message-item ${index === 0 ? 'active' : ''} ${msg.status === 'unread' ? 'unread' : ''}" 
                 onclick="selectMessageById('${msg._id.toString()}')" 
                 data-id="${msg._id.toString()}">
                <div class="message-avatar">${initials}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-sender">${escapeHtml(msg.name)}</span>
                        <span class="message-time">${timeAgo}</span>
                    </div>
                    <div class="message-subject">${escapeHtml(msg.subject)}</div>
                    <div class="message-preview">${escapeHtml(preview)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Get initials from name
function getInitials(name) {
    if (!name) return '??';
    return name.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}

// Select message by ID
async function selectMessageById(messageId) {
    console.log('Selecting message:', messageId);

    // Update active state in list immediately
    document.querySelectorAll('.message-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.id === messageId) {
            item.classList.add('active');
        }
    });

    try {
        const res = await fetch(`/api/messages/${messageId}`);
        const data = await res.json();

        if (!data.success) {
            console.error('Message not found:', messageId);
            return;
        }

        const message = data.message;
        currentMessage = message;

        renderMessageView(message);

        // Mark as read if unread
        if (message.status === 'unread') {
            await markAsRead(messageId);
        }
    } catch (err) {
        console.error('Error fetching message:', err);
    }
}

// Render message view
function renderMessageView(message) {
    const messageView = document.querySelector('.message-view');
    
    if (!messageView) {
        console.error('Message view element not found!');
        return;
    }
    
    const initials = getInitials(message.name);
    const formattedDate = formatFullDate(message.createdAt);

    messageView.innerHTML = `
        <div class="message-view-header">
            <h2 class="message-view-subject">${escapeHtml(message.subject)}</h2>
            <div class="message-view-actions">
                <button class="btn btn-secondary" onclick="deleteMessage('${message._id}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Delete
                </button>
            </div>
        </div>
        <div class="message-view-meta">
            <div class="message-view-sender">
                <div class="message-avatar">${initials}</div>
                <div>
                    <div class="message-view-sender-name">${escapeHtml(message.name)}</div>
                    <div class="message-view-sender-email">${escapeHtml(message.email)}</div>
                    <div class="message-view-sender-phone" style="margin-top: 5px; color: #666;">📱 ${escapeHtml(message.phoneNumber)}</div>
                </div>
            </div>
            <div class="message-view-date">${formattedDate}</div>
        </div>
        <div class="message-view-body">
            <p style="white-space: pre-wrap;">${escapeHtml(message.message)}</p>
        </div>
        <div class="message-view-reply">
            <div class="reply-info" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <strong>Reply via:</strong>
                <a href="mailto:${message.email}" class="btn btn-secondary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    Email
                </a>
                <a href="tel:${message.phoneNumber}" class="btn btn-secondary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    Call
                </a>
                <a href="https://wa.me/${String(message.phoneNumber || '').replace(/^0/, '234')}" target="_blank" class="btn btn-primary">
                    <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    WhatsApp
                </a>
            </div>
        </div>
    `;
}

// Mark message as read
async function markAsRead(messageId) {
    try {
        const response = await fetch(`/api/messages/${messageId}/read`, {
            method: 'PATCH'
        });
        const data = await response.json();

        if (data.success) {
            // Update local state
            const message = allMessages.find(msg => msg._id.toString() === messageId);
            if (message) {
                message.status = 'read';
                
                // Remove unread class from message item
                const messageItem = document.querySelector(`.message-item[data-id="${messageId}"]`);
                if (messageItem) {
                    messageItem.classList.remove('unread');
                }
                
                // Update unread count
                const unreadCount = allMessages.filter(msg => msg.status === 'unread').length;
                updateUnreadCount(unreadCount);
            }
        }
    } catch (error) {
        console.error('Error marking message as read:', error);
    }
}

// Delete message
async function deleteMessage(messageId) {
    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }

    try {
        const response = await fetch(`/api/messages/${messageId}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            // Remove from local state
            allMessages = allMessages.filter(msg => msg._id.toString() !== messageId);
            
            // Re-render list
            renderMessageList(allMessages);
            
            // Select next message or show empty state
            if (allMessages.length > 0) {
                selectMessageById(allMessages[0]._id.toString());
            } else {
                showEmptyState();
            }
            
            // Update unread count
            const unreadCount = allMessages.filter(msg => msg.status === 'unread').length;
            updateUnreadCount(unreadCount);
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message');
    }
}

// Show empty state
function showEmptyState() {
    const messageView = document.querySelector('.message-view');
    if (!messageView) return;
    
    messageView.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #999;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 20px;">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
            </svg>
            <h3>No messages</h3>
            <p>Your inbox is empty</p>
        </div>
    `;
}

// Show error
function showError(message) {
    const messageView = document.querySelector('.message-view');
    if (!messageView) return;
    
    messageView.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #f44336;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 20px;">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h3>Error</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="loadMessages()" style="margin-top: 20px;">Retry</button>
        </div>
    `;
}

// Format time ago
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format full date
function formatFullDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric',
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize search
function initializeSearch() {
    const searchInput = document.querySelector('.inbox-search input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            
            if (query === '') {
                renderMessageList(allMessages);
            } else {
                const filtered = allMessages.filter(msg => 
                    msg.name.toLowerCase().includes(query) ||
                    msg.email.toLowerCase().includes(query) ||
                    msg.subject.toLowerCase().includes(query) ||
                    msg.message.toLowerCase().includes(query)
                );
                renderMessageList(filtered);
                
                // Select first filtered message if available
                if (filtered.length > 0) {
                    selectMessageById(filtered[0]._id.toString());
                } else {
                    showEmptyState();
                }
            }
        });
    }
}

console.log('Inbox logic script loaded');
