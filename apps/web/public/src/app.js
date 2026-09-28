import { readConfig } from './core/config.js';
import { createApiClient } from './services/api-client.js';
import { renderAppShell } from './components/layout/app-shell.js';
import { mountInbox } from './features/inbox/inbox-page.js';
const root = document.querySelector('#app-root'); const config = readConfig();
function showFatal(message) { root.innerHTML = `<main class="state state--error"><strong>Không thể khởi động ứng dụng</strong><span>${message}</span></main>`; }
if (config.error) showFatal(config.error); else { const api = createApiClient(config); let cleanup = () => {}; const shell = renderAppShell(root, { onNavigate: path => { history.pushState({}, '', path); renderRoute(); } }); function renderRoute() { cleanup(); const path = window.location.pathname.replace(/\/$/, '') || '/'; if (path === '/') { history.replaceState({}, '', '/inbox'); return renderRoute(); } if (path === '/inbox') { document.title = 'Inbox — chat2'; cleanup = mountInbox(shell.content, { api, workspaceId: config.workspaceId, toast: shell.toast }); return; } shell.content.innerHTML = '<div class="state state--error"><strong>Không tìm thấy trang</strong><span>Đường dẫn này chưa được đăng ký.</span></div>'; } window.addEventListener('popstate', renderRoute); renderRoute(); }
